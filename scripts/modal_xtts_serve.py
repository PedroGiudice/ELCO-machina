"""Modal XTTS v2 Server -- endpoint HTTP para sintese TTS.

Deploy:
    modal deploy scripts/modal_xtts_serve.py

Uso:
    curl -X POST https://<modal-url>/synthesize \
      -H "Content-Type: application/json" \
      -d '{"text": "Ola mundo", "ref_audio_base64": "<base64>"}'

Health:
    curl https://<modal-url>/health
"""

import base64
import io
import os
import tempfile
import time

import modal
from fastapi import Response
from pydantic import BaseModel, Field

app = modal.App("xtts-serve")

hf_secret = modal.Secret.from_name("huggingface-secret")

GPU_CONFIG = "L4"
MODEL_DIR = "/models/xtts-v2"


def download_model():
    """Baixa XTTS v2 do HuggingFace no build da imagem."""
    from huggingface_hub import snapshot_download

    print("[BUILD] Baixando XTTS v2 de coqui/XTTS-v2...")
    snapshot_download("coqui/XTTS-v2", local_dir=MODEL_DIR)
    print("[BUILD] XTTS v2 baixado.")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "coqui-tts==0.26.0",
        "transformers>=4.43.0,<4.50.0",
        "torch>=2.1.0",
        "torchaudio>=2.1.0",
        "soundfile",
        "numpy<2.0",
        "huggingface_hub>=0.20.0",
        "torchcodec",
        "fastapi[standard]",
    )
    .run_function(download_model, secrets=[hf_secret])
)


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    ref_audio_base64: str = Field(..., min_length=1, description="WAV base64")
    language: str = Field(default="pt")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    temperature: float = Field(default=0.75, ge=0.1, le=0.8)
    top_k: int = Field(default=20, ge=1, le=100)
    top_p: float = Field(default=0.75, ge=0.1, le=1.0)
    repetition_penalty: float = Field(default=2.0, ge=1.0, le=5.0)
    length_penalty: float = Field(default=1.0, ge=0.5, le=2.0)


@app.cls(
    image=image,
    gpu=GPU_CONFIG,
    scaledown_window=300,
    max_containers=1,
    timeout=300,
)
class XTTSServer:
    @modal.enter()
    def load(self):
        from TTS.tts.configs.xtts_config import XttsConfig
        from TTS.tts.models.xtts import Xtts

        t0 = time.perf_counter()
        config = XttsConfig()
        config.load_json(f"{MODEL_DIR}/config.json")
        self.model = Xtts.init_from_config(config)
        self.model.load_checkpoint(config, checkpoint_dir=MODEL_DIR, use_deepspeed=False)
        self.model.cuda()
        self.load_time = time.perf_counter() - t0
        print(f"[INIT] XTTS v2 carregado na GPU em {self.load_time:.1f}s")

    @modal.fastapi_endpoint(method="POST")
    def synthesize(self, body: SynthesizeRequest) -> Response:
        import soundfile as sf
        import torch

        t0 = time.perf_counter()

        # Decode ref audio
        ref_bytes = base64.b64decode(body.ref_audio_base64)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(ref_bytes)
            ref_file = f.name

        try:
            gpt_cond_latent, speaker_embedding = self.model.get_conditioning_latents(
                audio_path=[ref_file]
            )

            print(
                f"[TTS] language={body.language} speed={body.speed} "
                f"temp={body.temperature} top_k={body.top_k} top_p={body.top_p} "
                f"rep_pen={body.repetition_penalty} len_pen={body.length_penalty}"
            )

            output = self.model.inference(
                text=body.text,
                language=body.language,
                gpt_cond_latent=gpt_cond_latent,
                speaker_embedding=speaker_embedding,
                speed=body.speed,
                temperature=body.temperature,
                top_k=body.top_k,
                top_p=body.top_p,
                repetition_penalty=body.repetition_penalty,
                length_penalty=body.length_penalty,
                enable_text_splitting=True,
            )

            wav = output["wav"]
            sr = 24000
            duration = len(wav) / sr
            elapsed = time.perf_counter() - t0

            print(f"[TTS] {len(body.text)} chars -> {duration:.1f}s audio em {elapsed:.1f}s")

            # WAV bytes para response
            buf = io.BytesIO()
            sf.write(buf, wav, sr, format="WAV")
            audio_bytes = buf.getvalue()

            return Response(
                content=audio_bytes,
                media_type="audio/wav",
                headers={
                    "X-Inference-Time": f"{elapsed:.2f}",
                    "X-Audio-Duration": f"{duration:.2f}",
                    "X-Model-Load-Time": f"{self.load_time:.2f}",
                },
            )
        finally:
            os.unlink(ref_file)

    @modal.fastapi_endpoint(method="GET")
    def health(self):
        import torch

        return {
            "status": "healthy",
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "model_load_s": round(self.load_time, 2),
        }
