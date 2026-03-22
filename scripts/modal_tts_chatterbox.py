#!/usr/bin/env python3
"""Chatterbox-Multilingual TTS (500M) no Modal (A10G GPU).

Voice cloning multilingual com 3-10s de ref audio. 23 linguas, PT-BR tier 1.
GPU memory snapshot para cold start rapido.

Deploy:  modal deploy scripts/modal_tts_chatterbox.py
Health:  curl https://<url>/web_health
Synth:   curl -X POST https://<url>/web_synthesize -F "text=..." -F "ref_audio_base64=..."
"""

import base64
import io
import time

import fastapi
import modal

APP_NAME = "tts-chatterbox"
GPU_TYPE = "a10g"

app = modal.App(APP_NAME, tags={"project": "elco-machina", "model": "chatterbox-multilingual"})
hf_secret = modal.Secret.from_name("huggingface-secret")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "chatterbox-tts==0.1.6",
        "peft==0.18.0",
        "fastapi[standard]",
    )
)


@app.cls(
    gpu=GPU_TYPE,
    image=image,
    secrets=[hf_secret],
    timeout=600,
    scaledown_window=2,
)
class TTSService:
    @modal.enter()
    def load(self):
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        self.model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
        self.sr = self.model.sr
        print(f"[INIT] Chatterbox-Multilingual loaded, sr={self.sr}")

    @modal.fastapi_endpoint(method="POST")
    def web_synthesize(
        self,
        text: str = fastapi.Form(...),
        ref_audio_base64: str = fastapi.Form(""),
        ref_text: str = fastapi.Form(""),
        language: str = fastapi.Form("pt"),
        exaggeration: float = fastapi.Form(0.5),
        cfg_weight: float = fastapi.Form(0.5),
    ) -> fastapi.Response:
        """Voice cloning TTS. Returns audio WAV bytes."""
        import os
        import subprocess
        import tempfile

        import torchaudio as ta

        if not text.strip():
            return fastapi.Response(content="Empty text", status_code=400, media_type="text/plain")

        t0 = time.perf_counter()

        try:
            gen_kwargs = {
                "text": text,
                "language_id": language,
                "exaggeration": exaggeration,
                "cfg_weight": cfg_weight,
            }

            # Handle ref audio for voice cloning (convert any format to WAV PCM)
            ref_path = None
            if ref_audio_base64.strip():
                ref_bytes = base64.b64decode(ref_audio_base64)
                with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as f:
                    f.write(ref_bytes)
                    tmp_in = f.name

                ref_path = tmp_in + ".wav"
                subprocess.run(
                    ["ffmpeg", "-y", "-i", tmp_in, "-ar", "16000", "-ac", "1",
                     "-sample_fmt", "s16", ref_path],
                    capture_output=True, check=True,
                )
                os.unlink(tmp_in)
                gen_kwargs["audio_prompt_path"] = ref_path

            wav = self.model.generate(**gen_kwargs)

            # Cleanup temp file
            if ref_path:
                os.unlink(ref_path)

            duration = wav.shape[-1] / self.sr
            elapsed = time.perf_counter() - t0

            buf = io.BytesIO()
            ta.save(buf, wav, self.sr, format="wav")
            audio_bytes = buf.getvalue()

            print(f"[TTS] {len(text)} chars -> {duration:.1f}s audio in {elapsed:.1f}s")

            return fastapi.Response(
                content=audio_bytes,
                media_type="audio/wav",
                headers={
                    "X-Inference-Time": f"{elapsed:.2f}",
                    "X-Audio-Duration": f"{duration:.2f}",
                    "X-Sample-Rate": str(self.sr),
                },
            )
        except Exception as e:
            return fastapi.Response(content=str(e), status_code=500, media_type="text/plain")

    @modal.fastapi_endpoint(method="GET")
    def web_health(self) -> dict:
        import torch
        has_model = hasattr(self, "model") and self.model is not None
        return {
            "status": "healthy" if has_model else "degraded",
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "model": "chatterbox-multilingual-500M",
            "backend": "chatterbox-native",
            "sample_rate": getattr(self, "sr", None),
        }
