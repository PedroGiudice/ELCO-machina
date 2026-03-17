#!/usr/bin/env python3
"""Modal DEPLOYED worker for Whisper via vLLM -- GPU Snapshot.

Uses vllm serve (HTTP server subprocess) with GPU snapshot for fast cold starts.
Pattern identical to modal_chandra_http.py from extractor-lab.

Pattern:
    1. @modal.enter(snap=True) -- start vllm serve, warm up, sleep. Snapshot taken after.
    2. @modal.enter(snap=False) -- wake vLLM, ready to serve.

Workflow:
    1. Deploy:  modal deploy scripts/modal_whisper_vllm.py
    2. Test:    python3 scripts/modal_whisper_vllm.py --audio docs/Refaudio.wav
    3. First call after deploy: slow (~2-3min, creating snapshot)
    4. Subsequent cold starts: ~10-15s (GPU state restore + wake)

GPU: L4 (24GB). Whisper large-v3 FP16 = ~3GB weights.
"""

import json
import os
import socket
import subprocess
import tempfile
import time

import modal

APP_NAME = "whisper-vllm"
app = modal.App(APP_NAME, tags={"project": "elco-machina", "model": "whisper", "engine": "vllm"})

GPU_TYPE = "L4"
MINUTES = 60
VLLM_PORT = 8000
VLLM_MODEL = "openai/whisper-large-v3"
MODEL_CACHE = "/models"

whisper_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12"
    )
    .entrypoint([])
    .apt_install(["ffmpeg"])
    .uv_pip_install(
        "vllm>=0.7.3",
        "huggingface-hub>=0.36.0",
        "librosa",
        "soundfile",
        "requests",
    )
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "VLLM_SERVER_DEV_MODE": "1",
        "TORCHINDUCTOR_COMPILE_THREADS": "1",
        "NCCL_DEBUG": "ERROR",
        "TORCH_NCCL_ENABLE_MONITORING": "0",
        "TORCH_CPP_LOG_LEVEL": "FATAL",
        "HF_HUB_CACHE": MODEL_CACHE,
    })
)

model_volume = modal.Volume.from_name("whisper-vllm-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)

with whisper_image.imports():
    import requests


def _wait_ready(proc: subprocess.Popen, timeout: int = 5 * MINUTES) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            socket.create_connection(("localhost", VLLM_PORT), timeout=1).close()
            return
        except OSError:
            if proc.poll() is not None:
                raise RuntimeError(f"vLLM exited with {proc.returncode}")
            time.sleep(1)
    raise TimeoutError(f"vLLM not ready within {timeout}s")


def _warmup() -> None:
    """Warm-up with a dummy transcription request."""
    import librosa
    import numpy as np

    # Generate 1s of silence as warm-up audio
    sr = 16000
    silence = np.zeros(sr, dtype=np.float32)

    payload = {
        "model": VLLM_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": __import__("base64").b64encode(
                                silence.tobytes()
                            ).decode(),
                            "format": "wav",
                        },
                    }
                ],
            }
        ],
        "max_tokens": 16,
    }

    for _ in range(2):
        requests.post(
            f"http://localhost:{VLLM_PORT}/v1/chat/completions",
            json=payload,
            timeout=300,
        ).raise_for_status()


def _sleep(level: int = 1) -> None:
    requests.post(
        f"http://localhost:{VLLM_PORT}/sleep?level={level}"
    ).raise_for_status()


def _wake_up() -> None:
    requests.post(
        f"http://localhost:{VLLM_PORT}/wake_up"
    ).raise_for_status()


@app.cls(
    image=whisper_image,
    gpu=GPU_TYPE,
    timeout=10 * MINUTES,
    volumes={
        MODEL_CACHE: model_volume,
        "/root/.cache/vllm": vllm_cache_vol,
    },
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
    secrets=[modal.Secret.from_name("huggingface-secret")],
    scaledown_window=2,
)
class WhisperService:
    @modal.enter(snap=True)
    def start(self):
        import logging

        logging.basicConfig(
            level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
        )
        self.logger = logging.getLogger("whisper-vllm")

        self.logger.info("Starting vLLM for %s...", VLLM_MODEL)

        cmd = [
            "vllm", "serve", VLLM_MODEL,
            "--dtype", "auto",
            "--host", "0.0.0.0",
            "--port", str(VLLM_PORT),
            "--gpu_memory_utilization", "0.90",
            "--enable-sleep-mode",
            "--max-model-len", "448",
            "--max-num-seqs", "16",
            "--kv-cache-dtype", "fp8",
            "--uvicorn-log-level", "error",
            "--disable-uvicorn-access-log",
            "--disable-log-requests",
        ]

        self._vllm_log = open("/tmp/vllm-stderr.log", "w")
        self.vllm_proc = subprocess.Popen(cmd, stderr=self._vllm_log)

        _wait_ready(self.vllm_proc)
        self.logger.info("vLLM ready on port %d", VLLM_PORT)

        self.logger.info("Running warm-up...")
        _warmup()
        self.logger.info("Warm-up done")

        self.logger.info("Putting vLLM to sleep...")
        _sleep()
        self.logger.info("vLLM sleeping -- snapshot point")

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
                level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
            )
            self.logger = logging.getLogger("whisper-vllm")

        self.logger.info("Waking vLLM...")
        _wake_up()
        _wait_ready(self.vllm_proc, timeout=MINUTES)
        self.logger.info("vLLM awake on port %d", VLLM_PORT)

    @modal.exit()
    def stop(self):
        if hasattr(self, "vllm_proc") and self.vllm_proc.poll() is None:
            self.vllm_proc.terminate()
            try:
                self.vllm_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.vllm_proc.kill()
        if hasattr(self, "_vllm_log"):
            self._vllm_log.close()

    @modal.method()
    def transcribe(self, audio_bytes: bytes, language: str = "pt") -> dict:
        """Transcribe audio bytes via vLLM Whisper. Returns text + metrics."""
        import base64
        import soundfile as sf
        import io

        t0 = time.perf_counter()

        # Save to temp file to read with soundfile for duration
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        try:
            info = sf.info(tmp_path)
            audio_duration = info.duration

            # Encode audio as base64 for vLLM
            audio_b64 = base64.b64encode(audio_bytes).decode()

            payload = {
                "model": VLLM_MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "data": audio_b64,
                                    "format": "wav",
                                },
                            }
                        ],
                    }
                ],
                "temperature": 0,
                "top_p": 1.0,
                "max_tokens": 448,
            }

            resp = requests.post(
                f"http://localhost:{VLLM_PORT}/v1/chat/completions",
                json=payload,
                timeout=300,
            )
            resp.raise_for_status()
            result = resp.json()

            text = result["choices"][0]["message"]["content"].strip()
            elapsed = time.perf_counter() - t0

            self.logger.info(
                "Transcribed %.1fs audio in %.1fs (RTF %.3f)",
                audio_duration, elapsed, elapsed / audio_duration if audio_duration > 0 else 0,
            )

            return {
                "text": text,
                "language": language,
                "duration_audio_s": round(audio_duration, 1),
                "inference_s": round(elapsed, 2),
                "rtf": round(elapsed / audio_duration, 3) if audio_duration > 0 else 0,
            }
        finally:
            os.unlink(tmp_path)

    @modal.method()
    def health(self) -> dict:
        """Health check."""
        import torch

        vllm_alive = hasattr(self, "vllm_proc") and self.vllm_proc.poll() is None
        return {
            "status": "healthy" if vllm_alive else "degraded",
            "vllm_alive": vllm_alive,
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "model": VLLM_MODEL,
        }


# ---------------------------------------------------------------------------
# Client mode (call deployed service)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Call deployed Whisper vLLM service")
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--language", default="pt", help="Language code")
    args = parser.parse_args()

    t0 = time.time()
    print(f"Reading {args.audio}...")
    with open(args.audio, "rb") as f:
        audio_bytes = f.read()
    print(f"  {len(audio_bytes) / 1e6:.1f}MB")

    print("Connecting to deployed service...")
    ServiceCls = modal.Cls.from_name(APP_NAME, "WhisperService")
    service = ServiceCls()

    print("Transcribing...")
    result = service.transcribe.remote(audio_bytes, args.language)
    wall = time.time() - t0

    print(f"\nWall time:      {wall:.1f}s")
    print(f"Inference:      {result['inference_s']}s")
    print(f"Audio duration: {result['duration_audio_s']}s")
    print(f"RTF:            {result['rtf']}")
    print(f"\nTexto:\n{result['text']}")
