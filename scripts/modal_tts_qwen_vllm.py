#!/usr/bin/env python3
"""Qwen3-TTS via vLLM-Omni no Modal (A10G GPU).

Voice cloning com ref audio via OpenAI-compatible /v1/audio/speech endpoint.
GPU snapshot via enable_sleep_mode (experimental com vLLM-Omni).

API spec (from vLLM-Omni docs):
    POST /v1/audio/speech
    {
        "input": "text",
        "task_type": "Base",
        "language": "Portuguese",
        "ref_audio": "data:audio/wav;base64,...",
        "ref_text": "transcript"
    }
    Returns: binary audio (WAV)

Deploy:
    modal deploy scripts/modal_tts_qwen_vllm.py

Health:
    curl https://<url>/web_health
"""

import base64
import io
import socket
import subprocess
import time

import fastapi
import modal

APP_NAME = "tts-serve-vllm"
MODEL_NAME = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
GPU_TYPE = "a10g"
VLLM_PORT = 8091

app = modal.App(APP_NAME, tags={"project": "elco-machina", "model": "qwen3-tts-vllm"})

hf_cache_vol = modal.Volume.from_name("hf-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)
hf_secret = modal.Secret.from_name("huggingface-secret")

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12"
    )
    .entrypoint([])
    .apt_install("ffmpeg", "libsndfile1")
    .uv_pip_install(
        "vllm",
        "vllm-omni",
        "soundfile",
        "numpy",
        "httpx",
        "fastapi[standard]",
    )
    .pip_install("flash-attn", extra_options="--no-build-isolation")
    .env({
        "VLLM_SERVER_DEV_MODE": "1",
        "TORCHINDUCTOR_COMPILE_THREADS": "1",
        "NCCL_DEBUG": "ERROR",
        "TORCH_NCCL_ENABLE_MONITORING": "0",
        "TORCH_CPP_LOG_LEVEL": "FATAL",
    })
)


def _wait_ready(proc, timeout=180):
    """Wait for vLLM-Omni to be ready."""
    import httpx

    t0 = time.time()
    while time.time() - t0 < timeout:
        if proc.poll() is not None:
            raise RuntimeError(f"vLLM-Omni exited with code {proc.returncode}")
        try:
            socket.create_connection(("localhost", VLLM_PORT), timeout=1).close()
            r = httpx.get(f"http://localhost:{VLLM_PORT}/health", timeout=5)
            if r.status_code == 200:
                return
        except (ConnectionRefusedError, OSError, Exception):
            pass
        time.sleep(2)
    raise RuntimeError(f"vLLM-Omni not ready after {timeout}s")


def _sleep():
    import requests as req
    req.post(f"http://localhost:{VLLM_PORT}/sleep?level=2")


def _wake_up():
    import requests as req
    req.post(f"http://localhost:{VLLM_PORT}/wake_up").raise_for_status()


with image.imports():
    import httpx


@app.cls(
    image=image,
    gpu=GPU_TYPE,
    memory=32768,
    timeout=600,
    secrets=[hf_secret],
    volumes={
        "/root/.cache/huggingface": hf_cache_vol,
        "/root/.cache/vllm": vllm_cache_vol,
    },
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
    scaledown_window=60,
)
class TTSService:
    @modal.enter(snap=True)
    def start(self):
        """Start vLLM-Omni serve, warm up, sleep for snapshot."""
        import logging

        logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
        self.logger = logging.getLogger("tts-vllm")

        # Find stage configs path inside vllm_omni package
        import vllm_omni
        omni_path = vllm_omni.__path__[0]
        stage_config = f"{omni_path}/model_executor/stage_configs/qwen3_tts.yaml"

        cmd = [
            "vllm", "serve", MODEL_NAME,
            "--stage-configs-path", stage_config,
            "--omni",
            "--port", str(VLLM_PORT),
            "--trust-remote-code",
            "--enforce-eager",
            "--gpu-memory-utilization", "0.90",
        ]

        self.logger.info(f"Starting vLLM-Omni: {' '.join(cmd)}")
        self.vllm_proc = subprocess.Popen(cmd, stderr=subprocess.STDOUT)

        _wait_ready(self.vllm_proc)
        self.logger.info(f"vLLM-Omni ready on port {VLLM_PORT}")

        # Warm up with a simple synthesis
        self.logger.info("Warm-up synthesis...")
        try:
            r = httpx.post(
                f"http://localhost:{VLLM_PORT}/v1/audio/speech",
                json={
                    "input": "Teste de aquecimento.",
                    "voice": "Chelsie",
                    "language": "Portuguese",
                },
                timeout=120,
            )
            self.logger.info(f"Warm-up done, status={r.status_code}")
        except Exception as e:
            self.logger.warning(f"Warm-up failed: {e}")

        # Sleep for snapshot
        self.logger.info("Putting vLLM to sleep...")
        try:
            _sleep()
            self.logger.info("vLLM sleeping -- snapshot point")
        except Exception as e:
            self.logger.warning(f"Sleep not supported by vLLM-Omni: {e}")

    @modal.enter(snap=False)
    def restore(self):
        """Wake after snapshot restore."""
        import logging

        if not hasattr(self, "logger"):
            logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
            self.logger = logging.getLogger("tts-vllm")

        try:
            _wake_up()
            _wait_ready(self.vllm_proc, timeout=60)
            self.logger.info(f"vLLM-Omni awake on port {VLLM_PORT}")
        except Exception as e:
            self.logger.warning(f"Wake failed: {e}")

    @modal.exit()
    def stop(self):
        if hasattr(self, "vllm_proc") and self.vllm_proc.poll() is None:
            self.vllm_proc.terminate()
            try:
                self.vllm_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.vllm_proc.kill()

    @modal.fastapi_endpoint(method="POST")
    def web_synthesize(
        self,
        text: str = fastapi.Form(...),
        ref_audio_base64: str = fastapi.Form(""),
        ref_text: str = fastapi.Form(""),
        language: str = fastapi.Form("Portuguese"),
        voice: str = fastapi.Form("Chelsie"),
    ) -> fastapi.Response:
        """Synthesize via HTTP. Returns audio WAV bytes.

        For voice cloning: provide ref_audio_base64 + ref_text
        For preset voices: provide voice name
        """
        t0 = time.perf_counter()

        payload = {
            "input": text,
            "language": language,
            "response_format": "wav",
        }

        if ref_audio_base64.strip():
            # Voice cloning mode (Base model)
            payload["task_type"] = "Base"
            payload["ref_audio"] = f"data:audio/wav;base64,{ref_audio_base64}"
            if ref_text.strip():
                payload["ref_text"] = ref_text
        else:
            # Preset voice mode (CustomVoice model -- won't work with Base)
            payload["voice"] = voice

        try:
            r = httpx.post(
                f"http://localhost:{VLLM_PORT}/v1/audio/speech",
                json=payload,
                timeout=300,
            )
            r.raise_for_status()
            elapsed = time.perf_counter() - t0

            return fastapi.Response(
                content=r.content,
                media_type="audio/wav",
                headers={
                    "X-Inference-Time": f"{elapsed:.2f}",
                },
            )
        except Exception as e:
            return fastapi.Response(content=str(e), status_code=500, media_type="text/plain")

    @modal.fastapi_endpoint(method="GET")
    def web_health(self) -> dict:
        """Health check."""
        vllm_alive = hasattr(self, "vllm_proc") and self.vllm_proc.poll() is None
        return {
            "status": "healthy" if vllm_alive else "degraded",
            "vllm_alive": vllm_alive,
            "model": MODEL_NAME,
            "backend": "vllm-omni",
        }
