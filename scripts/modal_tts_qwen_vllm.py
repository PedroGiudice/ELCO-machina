#!/usr/bin/env python3
"""Qwen3-TTS 1.7B Base via vLLM-Omni OFFLINE no Modal (A10G GPU).

Pipeline de 2 stages (Talker + Code2Wav) via Omni class (Python API).
API baseada em examples/offline_inference/qwen3_tts/end2end.py do repo.
Sem snapshot (por enquanto — iterar depois).

Deploy:  modal deploy scripts/modal_tts_qwen_vllm.py
Health:  curl https://<url>/web_health
Synth:   curl -X POST https://<url>/web_synthesize \
           -F "text=Olá" -F "ref_audio_path=ref_ptbr_male.wav"
"""

import base64
import io
import os
import subprocess
import time

import fastapi
import modal

APP_NAME = "tts-serve"
MODEL_NAME = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
GPU_TYPE = "H100"
STAGE_CONFIG_PATH = "/opt/stage_configs/qwen3_tts.yaml"
VOICE_REFS_PATH = "/voice-refs"

app = modal.App(
    APP_NAME, tags={"project": "elco-machina", "model": "qwen3-tts-vllm"}
)
hf_secret = modal.Secret.from_name("huggingface-secret")
voice_refs_vol = modal.Volume.from_name("tts-voice-refs", create_if_missing=True)

# ---------------------------------------------------------------------------
# Stage config YAML (from vllm-omni repo, qwen3_tts.yaml)
# ---------------------------------------------------------------------------
STAGE_CONFIG_YAML = """\
async_chunk: true
stage_args:
  - stage_id: 0
    stage_type: llm
    is_comprehension: true
    runtime:
      devices: "0"
    engine_args:
      model_stage: qwen3_tts
      max_num_seqs: 10
      model_arch: Qwen3TTSTalkerForConditionalGeneration
      worker_type: ar
      scheduler_cls: vllm_omni.core.sched.omni_ar_scheduler.OmniARScheduler
      enforce_eager: true
      trust_remote_code: true
      async_scheduling: true
      enable_prefix_caching: false
      engine_output_type: latent
      gpu_memory_utilization: 0.3
      distributed_executor_backend: "mp"
      max_num_batched_tokens: 512
      max_model_len: 4096
      custom_process_next_stage_input_func: vllm_omni.model_executor.stage_input_processors.qwen3_tts.talker2code2wav_async_chunk
    output_connectors:
      to_stage_1: connector_of_shared_memory
    default_sampling_params:
      temperature: 0.9
      top_k: 50
      max_tokens: 4096
      seed: 42
      detokenize: false
      repetition_penalty: 1.05
      stop_token_ids: [2150]

  - stage_id: 1
    stage_type: llm
    runtime:
      devices: "0"
    engine_args:
      model_stage: code2wav
      max_num_seqs: 1
      model_arch: Qwen3TTSCode2Wav
      worker_type: generation
      scheduler_cls: vllm_omni.core.sched.omni_generation_scheduler.OmniGenerationScheduler
      enforce_eager: true
      trust_remote_code: true
      async_scheduling: true
      enable_prefix_caching: false
      engine_output_type: audio
      gpu_memory_utilization: 0.3
      distributed_executor_backend: "mp"
      max_num_batched_tokens: 8192
      max_model_len: 32768
    engine_input_source: [0]
    final_output: true
    final_output_type: audio
    input_connectors:
      from_stage_0: connector_of_shared_memory
    tts_args:
      max_instructions_length: 500
    default_sampling_params:
      temperature: 0.0
      top_p: 1.0
      top_k: -1
      max_tokens: 65536
      seed: 42
      detokenize: true
      repetition_penalty: 1.0

runtime:
  enabled: true
  defaults:
    window_size: -1
    max_inflight: 1

  connectors:
    connector_of_shared_memory:
      name: SharedMemoryConnector
      extra:
        shm_threshold_bytes: 65536
        codec_streaming: true
        connector_get_sleep_s: 0.01
        connector_get_max_wait_first_chunk: 3000
        connector_get_max_wait: 300
        codec_chunk_frames: 25
        codec_left_context_frames: 25

  edges:
    - from: 0
      to: 1
      window_size: -1
"""


def write_stage_config():
    """Write stage config YAML during image build."""
    config_dir = os.path.dirname(STAGE_CONFIG_PATH)
    os.makedirs(config_dir, exist_ok=True)
    with open(STAGE_CONFIG_PATH, "w") as f:
        f.write(STAGE_CONFIG_YAML)


def download_model_weights():
    """Pre-download model weights."""
    from huggingface_hub import snapshot_download

    snapshot_download(MODEL_NAME)


image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libsndfile1", "git")
    .pip_install("vllm==0.16.0")
    .pip_install(
        "vllm-omni==0.16.0",
        "soundfile",
        "numpy",
        "fastapi[standard]",
    )
    .run_function(write_stage_config)
    .run_function(download_model_weights, secrets=[hf_secret])
    .env(
        {
            "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
            "TORCHINDUCTOR_COMPILE_THREADS": "1",
            "NCCL_DEBUG": "ERROR",
            "TORCH_NCCL_ENABLE_MONITORING": "0",
            "TORCH_CPP_LOG_LEVEL": "FATAL",
        }
    )
)


@app.cls(
    image=image,
    gpu=GPU_TYPE,
    memory=32768,
    timeout=600,
    secrets=[hf_secret],
    volumes={VOICE_REFS_PATH: voice_refs_vol},
    scaledown_window=2,
)
class TTSService:
    @modal.enter()
    def load(self):
        """Load the 2-stage vLLM-Omni pipeline (offline API)."""
        import logging

        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )
        self.logger = logging.getLogger("tts-vllm")
        self.logger.info("Loading vLLM-Omni pipeline: %s", MODEL_NAME)

        from vllm_omni import Omni

        self.omni = Omni(
            model=MODEL_NAME,
            stage_configs_path=STAGE_CONFIG_PATH,
        )

        self.logger.info("vLLM-Omni pipeline loaded")

    @modal.fastapi_endpoint(method="POST")
    def web_synthesize(
        self,
        text: str = fastapi.Form(...),
        ref_audio_base64: str = fastapi.Form(""),
        ref_audio_path: str = fastapi.Form(""),
        ref_text: str = fastapi.Form(""),
        language: str = fastapi.Form("Portuguese"),
    ) -> fastapi.Response:
        """Synthesize speech via vLLM-Omni offline API.

        ref audio: ref_audio_path (volume, for curl) or ref_audio_base64 (from PHP).
        """
        import soundfile as sf
        import tempfile

        import torch

        if not text.strip():
            return fastapi.Response(
                content="Empty text", status_code=400, media_type="text/plain"
            )

        t0 = time.perf_counter()

        ref_wav_path = None
        try:
            # -- Resolve ref audio to a local WAV path --
            ref_bytes = None
            if ref_audio_path.strip():
                vol_path = os.path.join(VOICE_REFS_PATH, ref_audio_path.strip())
                if not os.path.exists(vol_path):
                    return fastapi.Response(
                        content=f"Voice ref not found: {ref_audio_path}",
                        status_code=404,
                        media_type="text/plain",
                    )
                with open(vol_path, "rb") as f:
                    ref_bytes = f.read()
            elif ref_audio_base64.strip():
                ref_bytes = base64.b64decode(ref_audio_base64)

            if ref_bytes:
                with tempfile.NamedTemporaryFile(
                    suffix=".input", delete=False
                ) as tmp_in:
                    tmp_in.write(ref_bytes)
                    tmp_in_path = tmp_in.name

                ref_wav_path = tmp_in_path + ".wav"
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", tmp_in_path,
                        "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
                        ref_wav_path,
                    ],
                    capture_output=True,
                    check=True,
                )
                os.unlink(tmp_in_path)

            # -- Build additional_information (ALL values as lists per end2end.py) --
            x_vector_only = not ref_text.strip()
            additional_info = {
                "task_type": ["Base"],
                "text": [text],
                "language": [language],
                "x_vector_only_mode": [x_vector_only],
                "max_new_tokens": [2048],
            }
            if ref_wav_path:
                additional_info["ref_audio"] = [ref_wav_path]
                if ref_text.strip():
                    additional_info["ref_text"] = [ref_text]

            # -- Build input with prompt_token_ids placeholder --
            inputs = [
                {
                    "prompt_token_ids": [0] * 2048,
                    "additional_information": additional_info,
                }
            ]

            # -- Generate through 2-stage pipeline --
            # omni.generate() yields stage_outputs; request_output may be
            # a single object or a list depending on vllm-omni version.
            mm = None
            for stage_outputs in self.omni.generate(inputs):
                ro = stage_outputs.request_output
                # Handle list vs single object
                items = ro if isinstance(ro, list) else [ro]
                for item in items:
                    if hasattr(item, "outputs") and item.outputs:
                        out = item.outputs[0]
                        if hasattr(out, "multimodal_output") and out.multimodal_output:
                            mm = out.multimodal_output

            if mm is None:
                return fastapi.Response(
                    content="No audio generated",
                    status_code=500,
                    media_type="text/plain",
                )

            # -- Extract audio from output dict (audio=list[tensor], sr=list|scalar) --
            audio_data = mm["audio"]
            sr_raw = mm["sr"]
            sr_val = sr_raw[-1] if isinstance(sr_raw, list) and sr_raw else sr_raw
            sr = sr_val.item() if hasattr(sr_val, "item") else int(sr_val)
            audio_tensor = (
                torch.cat(audio_data, dim=-1)
                if isinstance(audio_data, list)
                else audio_data
            )
            audio_np = audio_tensor.float().cpu().numpy().flatten()
            duration = len(audio_np) / sr

            buf = io.BytesIO()
            sf.write(buf, audio_np, sr, format="WAV")
            audio_bytes = buf.getvalue()

            elapsed = time.perf_counter() - t0
            self.logger.info(
                "[TTS] %d chars -> %.1fs audio in %.1fs", len(text), duration, elapsed
            )

            return fastapi.Response(
                content=audio_bytes,
                media_type="audio/wav",
                headers={
                    "X-Inference-Time": f"{elapsed:.2f}",
                    "X-Audio-Duration": f"{duration:.2f}",
                    "X-Sample-Rate": str(sr),
                },
            )
        except Exception as e:
            self.logger.error("[TTS] Error: %s", e)
            return fastapi.Response(
                content=str(e), status_code=500, media_type="text/plain"
            )
        finally:
            if ref_wav_path and os.path.exists(ref_wav_path):
                os.unlink(ref_wav_path)

    @modal.fastapi_endpoint(method="GET")
    def web_health(self) -> dict:
        """Health check."""
        has_omni = hasattr(self, "omni") and self.omni is not None
        return {
            "status": "healthy" if has_omni else "degraded",
            "model": MODEL_NAME,
            "backend": "vllm-omni-offline",
            "gpu": GPU_TYPE,
        }
