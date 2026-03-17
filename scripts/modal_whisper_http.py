#!/usr/bin/env python3
"""Modal DEPLOYED worker for Whisper via vLLM -- HTTP server + GPU Snapshot.

Uses vllm serve (HTTP server subprocess) with GPU snapshot for fast cold starts.
Pattern identical to modal_chandra_http.py from extractor-lab.

Pattern:
    1. @modal.enter(snap=True) -- start vllm serve, warm up, sleep. Snapshot taken after.
    2. @modal.enter(snap=False) -- wake vLLM, ready to serve.

Audio >30s is chunked automatically (30s windows, 2s overlap) because
vLLM Whisper has a 30-second-per-prompt architectural limit.

Workflow:
    1. Deploy:  modal deploy scripts/modal_whisper_http.py
    2. Test:    python3 scripts/modal_whisper_http.py --audio docs/Refaudio.wav
    3. First call after deploy: slow (~2-3min, creating snapshot)
    4. Subsequent cold starts: ~10-15s (GPU state restore + wake)

GPU: L4 (24GB). Whisper large-v3 FP16 = ~3GB weights + KV cache.

NOTE: GPU snapshot with vLLM serve + encoder-decoder (Whisper) is experimental.
      If snapshot creation fails, fall back to modal_whisper_offline.py.
"""

import json
import os
import socket
import subprocess
import tempfile
import time

import modal

APP_NAME = "whisper-http"
app = modal.App(APP_NAME, tags={"project": "elco-machina", "model": "whisper", "engine": "vllm-http"})

GPU_TYPE = "L4"
MINUTES = 60
VLLM_PORT = 8000
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
        "requests",
    )
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "VLLM_SERVER_DEV_MODE": "1",
        "TORCHINDUCTOR_COMPILE_THREADS": "1",
        "NCCL_DEBUG": "ERROR",
        "TORCH_NCCL_ENABLE_MONITORING": "0",
        "TORCH_CPP_LOG_LEVEL": "FATAL",
    })
)

vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)
audio_volume = modal.Volume.from_name("audio-uploads", create_if_missing=True)
AUDIO_VOLUME_PATH = "/audio-uploads"

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
    """Warm-up with short audio via /v1/audio/transcriptions endpoint."""
    import io
    import struct

    # Generate 1s WAV file (16kHz, 16-bit, mono, silence)
    sr = 16000
    num_samples = sr
    wav_buf = io.BytesIO()
    # WAV header
    data_size = num_samples * 2  # 16-bit = 2 bytes per sample
    wav_buf.write(b"RIFF")
    wav_buf.write(struct.pack("<I", 36 + data_size))
    wav_buf.write(b"WAVE")
    wav_buf.write(b"fmt ")
    wav_buf.write(struct.pack("<I", 16))  # chunk size
    wav_buf.write(struct.pack("<H", 1))   # PCM
    wav_buf.write(struct.pack("<H", 1))   # mono
    wav_buf.write(struct.pack("<I", sr))  # sample rate
    wav_buf.write(struct.pack("<I", sr * 2))  # byte rate
    wav_buf.write(struct.pack("<H", 2))   # block align
    wav_buf.write(struct.pack("<H", 16))  # bits per sample
    wav_buf.write(b"data")
    wav_buf.write(struct.pack("<I", data_size))
    wav_buf.write(b"\x00" * data_size)  # silence
    wav_bytes = wav_buf.getvalue()

    for _ in range(2):
        resp = requests.post(
            f"http://localhost:{VLLM_PORT}/v1/audio/transcriptions",
            files={"file": ("warmup.wav", wav_bytes, "audio/wav")},
            data={"model": VLLM_MODEL},
            timeout=300,
        )
        resp.raise_for_status()


def _sleep(level: int = 1) -> None:
    requests.post(
        f"http://localhost:{VLLM_PORT}/sleep?level={level}"
    ).raise_for_status()


def _wake_up() -> None:
    requests.post(
        f"http://localhost:{VLLM_PORT}/wake_up"
    ).raise_for_status()


def _chunk_audio_bytes(audio_bytes: bytes) -> tuple[list[bytes], float]:
    """Load audio, chunk if >30s, return (list of WAV bytes, duration)."""
    import io
    import tempfile

    import librosa
    import soundfile as sf

    # Save to temp file so librosa can detect format from extension
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        audio_array, sr = librosa.load(tmp_path, sr=16000, mono=True)
    finally:
        os.unlink(tmp_path)

    total_samples = len(audio_array)
    audio_duration = total_samples / sr
    chunk_samples = CHUNK_SECONDS * sr
    overlap_samples = OVERLAP_SECONDS * sr
    step = chunk_samples - overlap_samples

    if total_samples <= chunk_samples:
        # Re-encode as proper WAV for the API
        buf = io.BytesIO()
        sf.write(buf, audio_array, sr, format="WAV", subtype="PCM_16")
        return [buf.getvalue()], audio_duration

    chunks_wav = []
    start = 0
    while start < total_samples:
        end = min(start + chunk_samples, total_samples)
        chunk = audio_array[start:end]

        buf = io.BytesIO()
        sf.write(buf, chunk, sr, format="WAV", subtype="PCM_16")
        chunks_wav.append(buf.getvalue())

        start += step
        if end == total_samples:
            break

    return chunks_wav, audio_duration


@app.cls(
    image=whisper_image,
    gpu=GPU_TYPE,
    timeout=10 * MINUTES,
    volumes={
        "/root/.cache/vllm": vllm_cache_vol,
        AUDIO_VOLUME_PATH: audio_volume,
    },
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
    secrets=[modal.Secret.from_name("huggingface-secret")],
    scaledown_window=2,
)
class WhisperHTTP:
    @modal.enter(snap=True)
    def start(self):
        import logging

        logging.basicConfig(
            level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
        )
        self.logger = logging.getLogger("whisper-http")

        self.logger.info("Starting vLLM serve for %s...", VLLM_MODEL)

        cmd = [
            "vllm", "serve", VLLM_MODEL,
            "--dtype", "auto",
            "--host", "0.0.0.0",
            "--port", str(VLLM_PORT),
            "--gpu_memory_utilization", "0.90",
            "--enable-sleep-mode",
            "--max-model-len", "448",
            "--max-num-seqs", "16",
            "--uvicorn-log-level", "warning",
            "--disable-log-requests",
        ]

        self._vllm_log = open("/tmp/vllm-stderr.log", "w")
        self.vllm_proc = subprocess.Popen(
            cmd, stdout=self._vllm_log, stderr=subprocess.STDOUT,
        )

        try:
            _wait_ready(self.vllm_proc)
        except (RuntimeError, TimeoutError):
            # Dump stderr so we can see what went wrong
            self._vllm_log.flush()
            with open("/tmp/vllm-stderr.log") as f:
                self.logger.error("vLLM stderr:\n%s", f.read()[-3000:])
            raise
        self.logger.info("vLLM ready on port %d", VLLM_PORT)

        self.logger.info("Running warm-up (2 requests)...")
        _warmup()
        self.logger.info("Warm-up done")

        self.logger.info("Putting vLLM to sleep...")
        _sleep()
        self.logger.info("vLLM sleeping -- snapshot point")

    @modal.enter(snap=False)
    def restore(self):
        """Wake vLLM from sleep mode after restoring from a memory snapshot."""
        _wake_up()

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
    def transcribe(self, audio_bytes: bytes, language: str = "pt",
                   volume_path: str = "") -> dict:
        """Transcribe audio via vLLM HTTP /v1/audio/transcriptions. Auto-chunks >30s."""
        t0 = time.perf_counter()

        # Read from volume or from bytes
        if volume_path:
            full_path = os.path.join(AUDIO_VOLUME_PATH, volume_path)
            self.logger.info("Reading audio from volume: %s", full_path)
            with open(full_path, "rb") as f:
                audio_bytes = f.read()

        # Check vLLM is alive
        if self.vllm_proc.poll() is not None:
            stderr_tail = ""
            try:
                with open("/tmp/vllm-stderr.log") as f:
                    stderr_tail = f.read()[-2000:]
            except Exception:
                pass
            raise RuntimeError(
                f"vLLM process died (exit {self.vllm_proc.returncode}). "
                f"Last stderr:\n{stderr_tail}"
            )

        # Chunk audio if needed
        chunks_wav, audio_duration = _chunk_audio_bytes(audio_bytes)
        num_chunks = len(chunks_wav)
        self.logger.info("Audio: %.1fs, %d chunk(s)", audio_duration, num_chunks)

        # Transcribe each chunk via HTTP
        texts = []
        t_infer = time.perf_counter()

        for i, chunk_wav in enumerate(chunks_wav):
            resp = requests.post(
                f"http://localhost:{VLLM_PORT}/v1/audio/transcriptions",
                files={"file": (f"chunk_{i}.wav", chunk_wav, "audio/wav")},
                data={
                    "model": VLLM_MODEL,
                    "language": language,
                    "temperature": "0",
                },
                timeout=300,
            )
            resp.raise_for_status()
            result = resp.json()
            text = result.get("text", "").strip()
            if text:
                texts.append(text)

        infer_time = time.perf_counter() - t_infer
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
            "chunks": num_chunks,
            "source": "volume" if volume_path else "bytes",
            "mode": "http-snapshot",
        }

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
            "mode": "http-snapshot",
        }


# ---------------------------------------------------------------------------
# Client mode (call deployed service)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import hashlib

    parser = argparse.ArgumentParser(description="Call deployed Whisper HTTP service")
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--language", default="pt", help="Language code")
    parser.add_argument("--use-volume", action="store_true",
                        help="Upload audio to Modal Volume first (recommended for large files)")
    parser.add_argument("--debug", action="store_true", help="Show raw container logs")
    args = parser.parse_args()

    if args.debug:
        modal.enable_output()

    t0 = time.time()
    print(f"Reading {args.audio}...")
    with open(args.audio, "rb") as f:
        audio_bytes = f.read()
    print(f"  {len(audio_bytes) / 1e6:.1f}MB")

    volume_path = ""
    if args.use_volume:
        print("Uploading to Modal Volume...")
        t_upload = time.time()
        vol = modal.Volume.from_name("audio-uploads", create_if_missing=True)
        file_hash = hashlib.sha256(audio_bytes).hexdigest()[:12]
        volume_name = f"{file_hash}_{os.path.basename(args.audio)}"
        with vol.batch_upload(force=True) as batch:
            batch.put_file(args.audio, f"/{volume_name}")
        print(f"  Uploaded in {time.time() - t_upload:.1f}s")
        volume_path = volume_name
        audio_bytes = b""  # Don't send bytes via gRPC

    print("PROGRESS:status:loading_vllm", flush=True)
    print("Connecting to deployed service...")
    ServiceCls = modal.Cls.from_name(APP_NAME, "WhisperHTTP")
    service = ServiceCls()

    print("PROGRESS:status:transcribing", flush=True)
    print("Transcribing...")
    result = service.transcribe.remote(audio_bytes, args.language, volume_path=volume_path)
    wall = time.time() - t0

    print(f"RESULT:" + json.dumps(result), flush=True)

    print(f"\nWall time:      {wall:.1f}s")
    print(f"Inference:      {result['inference_s']}s")
    print(f"Audio duration: {result['duration_audio_s']}s")
    print(f"RTF:            {result['rtf']}")
    print(f"Chunks:         {result['chunks']}")
    print(f"Source:         {result['source']}")
    print(f"Mode:           {result['mode']}")
    print(f"\nTexto:\n{result['text']}")
