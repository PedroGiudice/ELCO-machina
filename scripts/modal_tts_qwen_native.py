#!/usr/bin/env python3
"""Qwen3-TTS via qwen-tts SDK nativo no Modal (A10G GPU).

Voice cloning com 3s de ref audio. Memory snapshot para cold start rapido.

Deploy:
    modal deploy scripts/modal_tts_qwen_native.py

Test:
    curl -X POST https://<url>/web_synthesize \
      -F "text=Ola mundo" -F "ref_audio_base64=<base64>" -F "language=Portuguese"

Health:
    curl https://<url>/web_health
"""

import base64
import io
import time

import fastapi
import modal

APP_NAME = "tts-serve"
MODEL_NAME = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
GPU_TYPE = "a10g"

app = modal.App(APP_NAME, tags={"project": "elco-machina", "model": "qwen3-tts"})

hf_cache_vol = modal.Volume.from_name("hf-cache", create_if_missing=True)
hf_secret = modal.Secret.from_name("huggingface-secret")

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12"
    )
    .entrypoint([])
    .apt_install("ffmpeg", "libsndfile1")
    .uv_pip_install(
        "qwen-tts",
        "torch>=2.1",
        "torchaudio>=2.1",
        "soundfile",
        "numpy",
        "fastapi[standard]",
    )
    .pip_install("flash-attn", extra_options="--no-build-isolation")
)


@app.cls(
    image=image,
    gpu=GPU_TYPE,
    memory=16384,
    timeout=300,
    secrets=[hf_secret],
    volumes={"/root/.cache/huggingface": hf_cache_vol},
    enable_memory_snapshot=True,
    scaledown_window=60,
)
class TTSService:
    @modal.enter(snap=True)
    def load(self):
        """Load model and snapshot."""
        import torch
        from qwen_tts import Qwen3TTSModel

        self.model = Qwen3TTSModel.from_pretrained(
            MODEL_NAME,
            device_map="cuda:0",
            dtype=torch.bfloat16,
            attn_implementation="flash_attention_2",
        )

        # Warm up
        wavs, sr = self.model.generate_voice_clone(
            text="Teste de aquecimento.",
            language="Portuguese",
            ref_audio="https://qianwen-res.oss-cn-beijing.aliyuncs.com/Qwen3-TTS-Repo/clone.wav",
            ref_text="Okay. Yeah.",
        )
        self.sr = sr
        print(f"[INIT] Qwen3-TTS loaded, sample_rate={sr}")

    @modal.enter(snap=False)
    def restore(self):
        """Post-snapshot restore."""
        print("[RESTORE] Qwen3-TTS restored from snapshot")

    @modal.fastapi_endpoint(method="POST")
    def web_synthesize(
        self,
        text: str = fastapi.Form(...),
        ref_audio_base64: str = fastapi.Form(...),
        ref_text: str = fastapi.Form(""),
        language: str = fastapi.Form("Portuguese"),
    ) -> fastapi.Response:
        """Synthesize via HTTP. Returns audio WAV bytes.

        Form fields:
            text: Text to synthesize
            ref_audio_base64: Reference audio as base64 (WAV)
            ref_text: Transcript of reference audio (optional but recommended)
            language: Portuguese, English, Spanish, etc.
        """
        import numpy as np
        import soundfile as sf

        if not text.strip():
            return fastapi.Response(content="Empty text", status_code=400, media_type="text/plain")

        t0 = time.perf_counter()

        try:
            ref_bytes = base64.b64decode(ref_audio_base64)
            ref_data, ref_sr = sf.read(io.BytesIO(ref_bytes))
            ref_audio_tuple = (ref_data.astype(np.float32), ref_sr)

            wavs, sr = self.model.generate_voice_clone(
                text=text,
                language=language,
                ref_audio=ref_audio_tuple,
                ref_text=ref_text if ref_text.strip() else None,
            )

            wav = wavs[0]
            duration = len(wav) / sr
            elapsed = time.perf_counter() - t0

            buf = io.BytesIO()
            sf.write(buf, wav, sr, format="WAV")
            audio_bytes = buf.getvalue()

            print(f"[TTS] {len(text)} chars -> {duration:.1f}s audio in {elapsed:.1f}s")

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
            return fastapi.Response(content=str(e), status_code=500, media_type="text/plain")

    @modal.fastapi_endpoint(method="GET")
    def web_health(self) -> dict:
        """Health check."""
        import torch

        has_model = hasattr(self, "model") and self.model is not None
        return {
            "status": "healthy" if has_model else "degraded",
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "model": MODEL_NAME,
            "sample_rate": getattr(self, "sr", None),
            "backend": "qwen-tts-native",
        }
