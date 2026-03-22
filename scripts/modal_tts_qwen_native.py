#!/usr/bin/env python3
"""Qwen3-TTS 1.7B Base via qwen-tts SDK no Modal (A10G GPU).

Voice cloning com 3s de ref audio. Usa SDPA (flash-attn nao e dep do qwen-tts).

Deploy:  modal deploy scripts/modal_tts_qwen_native.py
Health:  curl https://<url>/web_health
Synth:   curl -X POST https://<url>/web_synthesize -F "text=..." -F "ref_audio_base64=..."
"""

import base64
import io
import time

import fastapi
import modal

APP_NAME = "tts-serve"
MODEL_NAME = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
GPU_TYPE = "A10G"

app = modal.App(APP_NAME, tags={"project": "elco-machina", "model": "qwen3-tts"})
hf_secret = modal.Secret.from_name("huggingface-secret")


def download_model_weights():
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL_NAME)


FLASH_ATTN_WHEEL = (
    "https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/"
    "flash_attn-2.8.3+cu12torch2.8cxx11abiFALSE-cp312-cp312-linux_x86_64.whl"
)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libsndfile1", "sox")
    .pip_install(
        "torch==2.8.0",
        "torchaudio==2.8.0",
        FLASH_ATTN_WHEEL,
        find_links="https://download.pytorch.org/whl/cu126",
    )
    .pip_install(
        "qwen-tts>=0.1.0",
        "soundfile",
        "huggingface_hub",
        "numpy",
        "fastapi[standard]",
    )
    .run_function(download_model_weights, secrets=[hf_secret])
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
        import torch
        from qwen_tts import Qwen3TTSModel

        self.model = Qwen3TTSModel.from_pretrained(
            MODEL_NAME,
            device_map="cuda",
            attn_implementation="flash_attention_2",
            dtype=torch.bfloat16,
        )
        print("[INIT] Qwen3-TTS loaded with Flash Attention 2")

    @modal.fastapi_endpoint(method="POST")
    def web_synthesize(
        self,
        text: str = fastapi.Form(...),
        ref_audio_base64: str = fastapi.Form(...),
        ref_text: str = fastapi.Form(""),
        language: str = fastapi.Form("Portuguese"),
    ) -> fastapi.Response:
        """Voice cloning TTS. Returns audio WAV bytes."""
        import os
        import subprocess
        import tempfile

        import numpy as np
        import soundfile as sf

        if not text.strip():
            return fastapi.Response(content="Empty text", status_code=400, media_type="text/plain")

        t0 = time.perf_counter()

        try:
            # Decode and convert ref audio to WAV PCM (accepts any ffmpeg format)
            ref_bytes = base64.b64decode(ref_audio_base64)
            with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as tmp_in:
                tmp_in.write(ref_bytes)
                tmp_in_path = tmp_in.name

            tmp_wav_path = tmp_in_path + ".wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_in_path, "-ar", "16000", "-ac", "1",
                 "-sample_fmt", "s16", tmp_wav_path],
                capture_output=True, check=True,
            )
            os.unlink(tmp_in_path)

            ref_data, ref_sr = sf.read(tmp_wav_path)
            os.unlink(tmp_wav_path)
            ref_audio_tuple = (ref_data.astype(np.float32), ref_sr)

            gen_kwargs = {
                "text": text,
                "language": language,
                "ref_audio": ref_audio_tuple,
            }

            if ref_text.strip():
                gen_kwargs["ref_text"] = ref_text
            else:
                gen_kwargs["x_vector_only_mode"] = True

            wavs, sr = self.model.generate_voice_clone(**gen_kwargs)

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
        import torch
        has_model = hasattr(self, "model") and self.model is not None
        return {
            "status": "healthy" if has_model else "degraded",
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "model": MODEL_NAME,
            "backend": "qwen-tts-native",
        }
