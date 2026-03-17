#!/usr/bin/env python3
"""Modal RUN worker for Whisper via vLLM -- offline batch API.

Uses vllm.LLM (offline batch API) for maximum throughput. No HTTP server,
no subprocess, no snapshot. Logs and output go directly to terminal.

Pattern identical to modal_chandra_gpu_snapshot.py from extractor-lab.

Audio >30s is chunked automatically (30s windows, 2s overlap) because
vLLM Whisper has a 30-second-per-prompt architectural limit.

Usage:
    modal run scripts/modal_whisper_offline.py --audio docs/Refaudio.wav
    modal run scripts/modal_whisper_offline.py --audio docs/Refaudio.wav --language en
    modal run scripts/modal_whisper_offline.py --audio docs/Refaudio.wav --use-volume

GPU: L4 (24GB). Whisper large-v3 FP16 = ~3GB weights + KV cache.
"""

import json
import os
import time

import modal

APP_NAME = "whisper-offline"
app = modal.App(APP_NAME, tags={"project": "elco-machina", "model": "whisper", "engine": "vllm-offline"})

GPU_TYPE = "L4"
MINUTES = 60
VLLM_MODEL = "openai/whisper-large-v3"
CHUNK_SECONDS = 30
OVERLAP_SECONDS = 2

whisper_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12"
    )
    .entrypoint([])
    .apt_install(["ffmpeg"])
    .uv_pip_install(
        "vllm==0.8.5.post1",
        "transformers==4.52.4",
        "huggingface-hub>=0.28.0",
        "librosa",
        "soundfile",
    )
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "TORCHINDUCTOR_COMPILE_THREADS": "1",
        "NCCL_DEBUG": "ERROR",
        "TORCH_NCCL_ENABLE_MONITORING": "0",
        "TORCH_CPP_LOG_LEVEL": "FATAL",
    })
)

vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)
audio_volume = modal.Volume.from_name("audio-uploads", create_if_missing=True)
AUDIO_VOLUME_PATH = "/audio-uploads"


def _chunk_audio(audio_array, sr: int) -> list[tuple]:
    """Split audio into <=30s chunks with overlap. Returns list of (array, sr) tuples."""
    import numpy as np

    total_samples = len(audio_array)
    chunk_samples = CHUNK_SECONDS * sr
    overlap_samples = OVERLAP_SECONDS * sr
    step = chunk_samples - overlap_samples

    if total_samples <= chunk_samples:
        return [(audio_array, sr)]

    chunks = []
    start = 0
    while start < total_samples:
        end = min(start + chunk_samples, total_samples)
        chunks.append((audio_array[start:end], sr))
        start += step
        if end == total_samples:
            break

    return chunks


@app.cls(
    image=whisper_image,
    gpu=GPU_TYPE,
    timeout=10 * MINUTES,
    volumes={
        "/root/.cache/vllm": vllm_cache_vol,
        AUDIO_VOLUME_PATH: audio_volume,
    },
    secrets=[modal.Secret.from_name("huggingface-secret")],
    scaledown_window=2,
)
class WhisperOffline:
    @modal.enter()
    def start(self):
        import logging

        import vllm

        logging.basicConfig(
            level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
        )
        self.logger = logging.getLogger("whisper-offline")

        self.logger.info("Loading vLLM engine for %s...", VLLM_MODEL)

        self.llm = vllm.LLM(
            model=VLLM_MODEL,
            max_model_len=448,
            max_num_seqs=400,
            limit_mm_per_prompt={"audio": 1},
            kv_cache_dtype="fp8",
            gpu_memory_utilization=0.90,
        )

        self.logger.info("vLLM engine loaded. Running warm-up...")

        # Warm-up with 1s of silence
        import numpy as np
        from vllm import SamplingParams

        silence = np.zeros(16000, dtype=np.float32)
        warmup_prompts = [{
            "prompt": "<|startoftranscript|>",
            "multi_modal_data": {"audio": (silence, 16000)},
        }]
        self.llm.generate(warmup_prompts, SamplingParams(temperature=0, max_tokens=16))
        self.logger.info("Warm-up done")

    @modal.exit()
    def stop(self):
        if hasattr(self, "llm"):
            del self.llm

    @modal.method()
    def transcribe(self, audio_bytes: bytes, language: str = "pt",
                   volume_path: str = "") -> dict:
        """Transcribe audio via offline vLLM. Auto-chunks audio >30s."""
        import io

        import librosa
        import numpy as np
        from vllm import SamplingParams

        t0 = time.perf_counter()

        # Read from volume or from bytes
        if volume_path:
            full_path = os.path.join(AUDIO_VOLUME_PATH, volume_path)
            self.logger.info("Reading audio from volume: %s", full_path)
            audio_array, sr = librosa.load(full_path, sr=16000, mono=True)
        else:
            audio_array, sr = librosa.load(io.BytesIO(audio_bytes), sr=16000, mono=True)

        audio_duration = len(audio_array) / sr
        self.logger.info("Audio: %.1fs, %d samples, sr=%d", audio_duration, len(audio_array), sr)

        # Chunk if >30s
        chunks = _chunk_audio(audio_array, sr)
        self.logger.info("Chunks: %d (%.0fs each, %ds overlap)",
                         len(chunks), CHUNK_SECONDS, OVERLAP_SECONDS if len(chunks) > 1 else 0)

        # Build prompts for each chunk
        prompts = [
            {
                "prompt": "<|startoftranscript|>",
                "multi_modal_data": {"audio": chunk},
            }
            for chunk in chunks
        ]

        sampling_params = SamplingParams(
            temperature=0,
            top_p=1.0,
            max_tokens=200,
        )

        t_infer = time.perf_counter()
        outputs = self.llm.generate(prompts, sampling_params)
        infer_time = time.perf_counter() - t_infer

        # Concatenate transcriptions
        texts = [output.outputs[0].text.strip() for output in outputs]
        full_text = " ".join(texts)

        elapsed = time.perf_counter() - t0

        self.logger.info(
            "Transcribed %.1fs audio in %.1fs (infer %.1fs, RTF %.3f)",
            audio_duration, elapsed, infer_time,
            elapsed / audio_duration if audio_duration > 0 else 0,
        )

        return {
            "text": full_text,
            "language": language,
            "duration_audio_s": round(audio_duration, 1),
            "inference_s": round(infer_time, 2),
            "total_s": round(elapsed, 2),
            "rtf": round(elapsed / audio_duration, 3) if audio_duration > 0 else 0,
            "chunks": len(chunks),
            "source": "volume" if volume_path else "bytes",
            "mode": "offline",
        }


# ---------------------------------------------------------------------------
# Local entrypoint (modal run)
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(
    audio: str,
    language: str = "pt",
    use_volume: bool = False,
    benchmark: bool = False,
):
    import hashlib
    import sys

    t0 = time.time()

    def log(msg: str):
        elapsed = time.time() - t0
        print(f"[{elapsed:6.1f}s] {msg}", file=sys.stderr, flush=True)

    log(f"Reading {audio}...")
    with open(audio, "rb") as f:
        audio_bytes = f.read()
    log(f"  {len(audio_bytes) / 1e6:.1f}MB")

    print(f"PROGRESS:status:loading_vllm", flush=True)

    volume_path = ""
    if use_volume:
        log("Uploading to Modal Volume...")
        t_upload = time.time()
        vol = modal.Volume.from_name("audio-uploads", create_if_missing=True)
        file_hash = hashlib.sha256(audio_bytes).hexdigest()[:12]
        volume_name = f"{file_hash}_{os.path.basename(audio)}"
        with vol.batch_upload(force=True) as batch:
            batch.put_file(audio, f"/{volume_name}")
        log(f"  Uploaded in {time.time() - t_upload:.1f}s")
        volume_path = volume_name
        audio_bytes = b""

    service = WhisperOffline()

    if benchmark:
        # Run 1: cold start
        log("--- Run 1 (cold start) ---")
        print("PROGRESS:status:transcribing_cold", flush=True)
        t1 = time.perf_counter()
        result = service.transcribe.remote(audio_bytes, language, volume_path=volume_path)
        wall1 = time.perf_counter() - t1
        log(f"  Wall: {wall1:.1f}s | Inference: {result['inference_s']}s | RTF: {result['rtf']}")
        log(f"  Chunks: {result['chunks']} | Audio: {result['duration_audio_s']}s")
        log(f"  Text ({len(result['text'])} chars): {result['text'][:200]}...")

        # Run 2: warm
        log("--- Run 2 (warm) ---")
        print("PROGRESS:status:transcribing_warm", flush=True)
        if use_volume:
            r2 = service.transcribe.remote(b"", language, volume_path=volume_path)
        else:
            r2 = service.transcribe.remote(audio_bytes, language)
        log(f"  Inference: {r2['inference_s']}s | RTF: {r2['rtf']}")

        # Cost estimate
        cost_per_hour = 0.73  # L4
        cost_per_sec = cost_per_hour / 3600
        inference_cost = r2['inference_s'] * cost_per_sec
        log(f"--- Cost (L4 @ ${cost_per_hour}/h) ---")
        log(f"  Per transcription (warm): ${inference_cost:.5f}")
        log(f"  Per 1000 transcriptions:  ${inference_cost * 1000:.2f}")
        if result['duration_audio_s'] > 0:
            log(f"  Per hour of audio:        ${(3600 / result['duration_audio_s']) * inference_cost:.3f}")
    else:
        print("PROGRESS:status:transcribing", flush=True)
        result = service.transcribe.remote(audio_bytes, language, volume_path=volume_path)
        wall = time.time() - t0

        print(f"RESULT:" + json.dumps(result), flush=True)

        log(f"Wall: {wall:.1f}s | Inference: {result['inference_s']}s")
        log(f"Audio: {result['duration_audio_s']}s | RTF: {result['rtf']}")
        log(f"Chunks: {result['chunks']} | Source: {result['source']}")
        log(f"\nTexto:\n{result['text']}")
