#!/usr/bin/env python3
"""Qwen TTS + Voice services no Modal (H100 GPU).

Three services in one deploy:
  - TTSService (Qwen3-TTS Base): voice cloning with ref audio
  - VoiceDesignService (Qwen3-TTS VoiceDesign): voice creation from text description
  - VoiceAnalyzerService (Qwen3-Omni Captioner): analyze voice from audio

Deploy:  modal deploy scripts/modal_tts_qwen_vllm_snap.py
Synth:   curl -X POST https://<url>/web_synthesize \
           -F "text=Olá" -F "ref_audio_path=ref_ptbr_male.wav"
Design:  curl -X POST https://<url>/web_design \
           -F "text=Olá mundo" -F "voice_instructions=A deep male voice"
Analyze: curl -X POST https://<url>/web_analyze \
           -F "audio=@voice.wav"
"""

import base64
import io
import os
import socket
import subprocess
import time

import fastapi
import modal

APP_NAME = "tts-serve-vllm"
MODEL_BASE = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
MODEL_VOICEDESIGN = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
GPU_TYPE = "H100"
VLLM_PORT = 8091
STAGE_CONFIG_PATH = "/opt/stage_configs/qwen3_tts.yaml"
VOICE_REFS_PATH = "/voice-refs"
MINUTES = 60

app = modal.App(
    APP_NAME, tags={"project": "elco-machina", "model": "qwen3-tts-vllm-snap"}
)
hf_secret = modal.Secret.from_name("huggingface-secret")
voice_refs_vol = modal.Volume.from_name("tts-voice-refs", create_if_missing=True)

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


def build_tts_image():
    """Write stage config + download both TTS model weights."""
    from huggingface_hub import snapshot_download

    config_dir = os.path.dirname(STAGE_CONFIG_PATH)
    os.makedirs(config_dir, exist_ok=True)
    with open(STAGE_CONFIG_PATH, "w") as f:
        f.write(STAGE_CONFIG_YAML)

    snapshot_download(MODEL_BASE)
    snapshot_download(MODEL_VOICEDESIGN)


image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libsndfile1", "sox")
    .pip_install("vllm==0.16.0")
    .pip_install(
        "vllm-omni==0.16.0",
        "soundfile",
        "numpy",
        "requests",
        "fastapi[standard]",
    )
    .run_function(build_tts_image, secrets=[hf_secret])
    .env(
        {
            "VLLM_SERVER_DEV_MODE": "1",
            "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
            "TORCHINDUCTOR_COMPILE_THREADS": "1",
            "NCCL_DEBUG": "ERROR",
            "TORCH_NCCL_ENABLE_MONITORING": "0",
            "TORCH_CPP_LOG_LEVEL": "FATAL",
        }
    )
)

with image.imports():
    import requests as http_requests


def _wait_ready(proc: subprocess.Popen, timeout: int = 5 * MINUTES) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            socket.create_connection(("localhost", VLLM_PORT), timeout=1).close()
            return
        except OSError:
            if proc.poll() is not None:
                stderr_tail = ""
                try:
                    with open("/tmp/vllm-stderr.log") as f:
                        stderr_tail = f.read()[-3000:]
                except Exception:
                    pass
                raise RuntimeError(
                    f"vLLM-Omni exited with {proc.returncode}.\n{stderr_tail}"
                )
            time.sleep(1)
    raise TimeoutError(f"vLLM-Omni not ready within {timeout}s")


def _sleep(level: int = 1) -> None:
    http_requests.post(
        f"http://localhost:{VLLM_PORT}/sleep?level={level}"
    ).raise_for_status()


def _wake_up() -> None:
    http_requests.post(
        f"http://localhost:{VLLM_PORT}/wake_up"
    ).raise_for_status()


@app.cls(
    image=image,
    gpu=GPU_TYPE,
    memory=32768,
    timeout=600,
    secrets=[hf_secret],
    volumes={VOICE_REFS_PATH: voice_refs_vol},
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
    scaledown_window=2,
)
class TTSService:
    @modal.enter(snap=True)
    def start(self):
        import logging

        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )
        self.logger = logging.getLogger("tts-vllm")

        self.logger.info("Starting vllm serve --omni ...")

        cmd = [
            "vllm", "serve", MODEL_BASE,
            "--stage-configs-path", STAGE_CONFIG_PATH,
            "--omni",
            "--trust-remote-code",
            "--enforce-eager",
            "--host", "0.0.0.0",
            "--port", str(VLLM_PORT),
            "--gpu-memory-utilization", "0.9",
            "--enable-sleep-mode",
            "--uvicorn-log-level", "error",
            "--disable-uvicorn-access-log",
        ]

        self._vllm_log = open("/tmp/vllm-stderr.log", "w")
        self.vllm_proc = subprocess.Popen(cmd, stderr=self._vllm_log)

        _wait_ready(self.vllm_proc)
        self.logger.info("vLLM-Omni ready on port %d", VLLM_PORT)

        self.logger.info("Putting to sleep...")
        _sleep()
        self.logger.info("vLLM-Omni sleeping — snapshot point")

    @modal.enter(snap=False)
    def restore(self):
        import logging

        try:
            import torch.distributed as dist

            if dist.is_initialized():
                dist.destroy_process_group()
        except Exception:
            pass

        if not hasattr(self, "logger"):
            logging.basicConfig(
                level=logging.INFO,
                format="%(asctime)s - %(levelname)s - %(message)s",
            )
            self.logger = logging.getLogger("tts-vllm")

        self.logger.info("Waking vLLM-Omni...")
        _wake_up()
        _wait_ready(self.vllm_proc, timeout=MINUTES)
        self.logger.info("vLLM-Omni awake on port %d", VLLM_PORT)

    @modal.exit()
    def stop(self):
        # Sleep first for cleaner shutdown (avoids ZMQ socket warnings)
        try:
            _sleep()
        except Exception:
            pass
        if hasattr(self, "vllm_proc") and self.vllm_proc.poll() is None:
            self.vllm_proc.terminate()
            try:
                self.vllm_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.vllm_proc.kill()
        if hasattr(self, "_vllm_log"):
            self._vllm_log.close()

    @modal.fastapi_endpoint(method="POST")
    def web_synthesize(
        self,
        text: str = fastapi.Form(...),
        ref_audio_base64: str = fastapi.Form(""),
        ref_audio_path: str = fastapi.Form(""),
        ref_text: str = fastapi.Form(""),
        language: str = fastapi.Form("Portuguese"),
    ) -> fastapi.Response:
        """Proxy TTS request to local vLLM-Omni /v1/audio/speech.

        ref audio: ref_audio_path (volume, for curl) or ref_audio_base64 (from PHP).
        """
        import soundfile as sf
        import tempfile

        if not text.strip():
            return fastapi.Response(
                content="Empty text", status_code=400, media_type="text/plain"
            )

        t0 = time.perf_counter()

        try:
            payload = {
                "model": MODEL_BASE,
                "input": text,
                "voice": "alloy",
                "language": language,
                "task_type": "Base",
                "response_format": "wav",
            }

            # Resolve ref audio: volume path > base64
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
                # Convert to WAV PCM via ffmpeg, then base64 for the API
                with tempfile.NamedTemporaryFile(
                    suffix=".input", delete=False
                ) as tmp_in:
                    tmp_in.write(ref_bytes)
                    tmp_in_path = tmp_in.name

                tmp_wav_path = tmp_in_path + ".wav"
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", tmp_in_path,
                        "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
                        tmp_wav_path,
                    ],
                    capture_output=True,
                    check=True,
                )
                os.unlink(tmp_in_path)

                with open(tmp_wav_path, "rb") as f:
                    wav_b64 = base64.b64encode(f.read()).decode()
                os.unlink(tmp_wav_path)

                payload["ref_audio"] = f"data:audio/wav;base64,{wav_b64}"

                # ref_text is REQUIRED for Base voice cloning.
                # Priority: explicit param > companion .txt file in volume
                resolved_ref_text = ref_text.strip()
                if not resolved_ref_text and ref_audio_path.strip():
                    txt_name = os.path.splitext(ref_audio_path.strip())[0] + ".txt"
                    txt_path = os.path.join(VOICE_REFS_PATH, txt_name)
                    if os.path.exists(txt_path):
                        with open(txt_path) as tf:
                            resolved_ref_text = tf.read().strip()
                        self.logger.info("[TTS] ref_text from companion: %s", txt_name)

                if not resolved_ref_text:
                    return fastapi.Response(
                        content=(
                            "ref_text is required for Base voice cloning. "
                            "Pass ref_text param or place a .txt companion "
                            "file next to the ref audio in the volume."
                        ),
                        status_code=400,
                        media_type="text/plain",
                    )
                payload["ref_text"] = resolved_ref_text

            # POST to local vLLM-Omni server
            resp = http_requests.post(
                f"http://localhost:{VLLM_PORT}/v1/audio/speech",
                json=payload,
                timeout=300,
            )

            if resp.status_code != 200:
                self.logger.error(
                    "[TTS] vLLM-Omni error: %d %s",
                    resp.status_code,
                    resp.text[:500],
                )
                return fastapi.Response(
                    content=resp.text,
                    status_code=resp.status_code,
                    media_type="text/plain",
                )

            audio_bytes = resp.content
            elapsed = time.perf_counter() - t0

            # Try to parse audio metadata; response may be WAV or raw PCM
            duration = 0.0
            sr = 24000
            content_type = resp.headers.get("content-type", "audio/wav")
            try:
                buf = io.BytesIO(audio_bytes)
                data, sr = sf.read(buf)
                duration = len(data) / sr
            except Exception:
                # Fallback: estimate from raw bytes (24kHz, 16-bit mono)
                duration = len(audio_bytes) / (sr * 2)

            self.logger.info(
                "[TTS] %d chars -> %.1fs audio in %.1fs (content-type: %s, %d bytes)",
                len(text), duration, elapsed, content_type, len(audio_bytes),
            )

            return fastapi.Response(
                content=audio_bytes,
                media_type=content_type,
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


# ---------------------------------------------------------------------------
# VoiceDesign: create voice profiles from text description (no microphone)
# Same infra, different model, dies immediately after use.
# ---------------------------------------------------------------------------

@app.cls(
    image=image,
    gpu=GPU_TYPE,
    memory=32768,
    timeout=600,
    secrets=[hf_secret],
    volumes={VOICE_REFS_PATH: voice_refs_vol},
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
    scaledown_window=15,
)
class VoiceDesignService:
    @modal.enter(snap=True)
    def start(self):
        import logging

        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )
        self.logger = logging.getLogger("tts-voicedesign")
        self.logger.info("Starting vllm serve --omni (VoiceDesign)...")

        cmd = [
            "vllm", "serve", MODEL_VOICEDESIGN,
            "--stage-configs-path", STAGE_CONFIG_PATH,
            "--omni",
            "--trust-remote-code",
            "--enforce-eager",
            "--host", "0.0.0.0",
            "--port", str(VLLM_PORT),
            "--gpu-memory-utilization", "0.9",
            "--enable-sleep-mode",
            "--uvicorn-log-level", "error",
            "--disable-uvicorn-access-log",
        ]

        self._vllm_log = open("/tmp/vllm-stderr.log", "w")
        self.vllm_proc = subprocess.Popen(cmd, stderr=self._vllm_log)

        _wait_ready(self.vllm_proc)
        self.logger.info("vLLM-Omni (VoiceDesign) ready on port %d", VLLM_PORT)

        self.logger.info("Putting to sleep...")
        _sleep()
        self.logger.info("vLLM-Omni sleeping — snapshot point")

    @modal.enter(snap=False)
    def restore(self):
        import logging

        try:
            import torch.distributed as dist

            if dist.is_initialized():
                dist.destroy_process_group()
        except Exception:
            pass

        if not hasattr(self, "logger"):
            logging.basicConfig(
                level=logging.INFO,
                format="%(asctime)s - %(levelname)s - %(message)s",
            )
            self.logger = logging.getLogger("tts-voicedesign")

        self.logger.info("Waking vLLM-Omni (VoiceDesign)...")
        _wake_up()
        _wait_ready(self.vllm_proc, timeout=2 * MINUTES)
        self.logger.info("vLLM-Omni (VoiceDesign) awake on port %d", VLLM_PORT)

    @modal.exit()
    def stop(self):
        try:
            _sleep()
        except Exception:
            pass
        if hasattr(self, "vllm_proc") and self.vllm_proc.poll() is None:
            self.vllm_proc.terminate()
            try:
                self.vllm_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.vllm_proc.kill()
        if hasattr(self, "_vllm_log"):
            self._vllm_log.close()

    @modal.method()
    def design(
        self,
        text: str,
        voice_instructions: str,
        language: str = "Portuguese",
        save_as: str = "",
    ) -> dict:
        """Core design logic. Returns dict with audio_bytes, metadata, or error."""
        import soundfile as sf

        if not text.strip():
            return {"error": "Empty text", "status": 400}
        if not voice_instructions.strip():
            return {"error": "voice_instructions is required", "status": 400}

        t0 = time.perf_counter()

        try:
            payload = {
                "model": MODEL_VOICEDESIGN,
                "input": text,
                "voice": "alloy",
                "language": language,
                "task_type": "VoiceDesign",
                "instructions": voice_instructions.strip(),
                "response_format": "wav",
            }

            resp = http_requests.post(
                f"http://localhost:{VLLM_PORT}/v1/audio/speech",
                json=payload,
                timeout=300,
            )

            if resp.status_code != 200:
                self.logger.error(
                    "[VoiceDesign] vLLM-Omni error: %d %s",
                    resp.status_code,
                    resp.text[:500],
                )
                return {"error": resp.text[:500], "status": resp.status_code}

            audio_bytes = resp.content
            elapsed = time.perf_counter() - t0

            duration = 0.0
            sr = 24000
            try:
                buf = io.BytesIO(audio_bytes)
                data, sr = sf.read(buf)
                duration = len(data) / sr
            except Exception:
                duration = len(audio_bytes) / (sr * 2)

            # Optionally save to volume as a voice reference
            saved_as = ""
            if save_as.strip():
                filename = save_as.strip()
                if not filename.endswith(".wav"):
                    filename += ".wav"
                vol_path = os.path.join(VOICE_REFS_PATH, filename)
                with open(vol_path, "wb") as f:
                    f.write(audio_bytes)
                txt_path = os.path.splitext(vol_path)[0] + ".txt"
                with open(txt_path, "w") as f:
                    f.write(text.strip())
                voice_refs_vol.commit()
                saved_as = filename
                self.logger.info("[VoiceDesign] Saved to volume: %s", filename)

            self.logger.info(
                "[VoiceDesign] '%s' -> %.1fs audio in %.1fs (%d bytes)",
                voice_instructions[:60], duration, elapsed, len(audio_bytes),
            )

            return {
                "audio_bytes": base64.b64encode(audio_bytes).decode(),
                "inference_time": round(elapsed, 2),
                "duration": round(duration, 2),
                "sample_rate": sr,
                "saved_as": saved_as,
                "size": len(audio_bytes),
            }
        except Exception as e:
            self.logger.error("[VoiceDesign] Error: %s", e)
            return {"error": str(e), "status": 500}

    @modal.fastapi_endpoint(method="POST")
    def web_design(
        self,
        text: str = fastapi.Form(...),
        voice_instructions: str = fastapi.Form(...),
        language: str = fastapi.Form("Portuguese"),
        save_as: str = fastapi.Form(""),
    ) -> fastapi.Response:
        """HTTP wrapper around design()."""
        result = self.design.local(text, voice_instructions, language, save_as)

        if "error" in result:
            return fastapi.Response(
                content=result["error"],
                status_code=result.get("status", 500),
                media_type="text/plain",
            )

        audio_bytes = base64.b64decode(result["audio_bytes"])
        return fastapi.Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "X-Inference-Time": str(result["inference_time"]),
                "X-Audio-Duration": str(result["duration"]),
                "X-Sample-Rate": str(result["sample_rate"]),
                "X-Saved-As": result.get("saved_as", ""),
            },
        )
