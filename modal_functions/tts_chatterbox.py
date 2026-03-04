"""
Modal function para TTS com Chatterbox (voz clonada).

Deploy: modal deploy modal_functions/tts_chatterbox.py
Teste:  modal run modal_functions/tts_chatterbox.py --action test --text "Seu texto"
Health: modal run modal_functions/tts_chatterbox.py --action health

Modelo baixado no build da imagem (snapshot cacheado). Sem Volume.
Cold start real: boot container + load GPU (~5s).
"""

import io
import tempfile
import time
from pathlib import Path

import modal

app = modal.App("elco-tts")

hf_secret = modal.Secret.from_name("huggingface-secret")

MODEL_DIR = "/models/chatterbox"


def download_model():
    """Baixa Chatterbox no build da imagem."""
    import os
    os.environ["HF_HOME"] = MODEL_DIR
    os.environ["TORCH_HOME"] = MODEL_DIR

    from chatterbox.tts import ChatterboxTTS
    print("[BUILD] Baixando Chatterbox...")
    ChatterboxTTS.from_pretrained(device="cpu")
    print("[BUILD] Modelo baixado.")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libsndfile1", "ffmpeg")
    .pip_install(
        "chatterbox-tts",
        "torch>=2.0.0",
        "torchaudio",
        "soundfile",
    )
    .run_function(download_model, secrets=[hf_secret])
)


@app.cls(
    image=image,
    gpu="T4",
    timeout=300,
    scaledown_window=2,
    max_containers=1,
)
class TTSEngine:
    """TTS com Chatterbox. Modelo na imagem, carrega direto na GPU."""

    @modal.enter()
    def load(self):
        import os
        os.environ["HF_HOME"] = MODEL_DIR
        os.environ["TORCH_HOME"] = MODEL_DIR

        from chatterbox.tts import ChatterboxTTS

        t0 = time.perf_counter()
        self.model = ChatterboxTTS.from_pretrained(device="cuda")
        self.sample_rate = self.model.sr
        self.load_time = time.perf_counter() - t0
        print(f"[INIT] Modelo carregado na GPU em {self.load_time:.1f}s")

    @modal.method()
    def synthesize(
        self,
        text: str,
        voice_ref_bytes: bytes | None = None,
        exaggeration: float = 0.5,
        speed: float = 1.0,
        stability: float = 0.5,
        steps: int = 10,
        sentence_silence: float = 0.2,
        cfg_weight: float = 0.5,
        embedding_scale: float = 1.0,
        temperature: float = 0.1,
        repetition_penalty: float = 1.1,
        top_p: float = 0.9,
        seed: int | None = None,
    ) -> bytes:
        """Sintetiza audio a partir de texto. Retorna bytes WAV."""
        import torch
        import torchaudio as ta

        t0 = time.perf_counter()
        audio_prompt_path = None

        if seed is not None:
            torch.manual_seed(seed)

        if voice_ref_bytes:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(voice_ref_bytes)
                audio_prompt_path = tmp.name

        try:
            gen_kwargs = {
                "exaggeration": exaggeration,
                "cfg_weight": cfg_weight,
            }

            if audio_prompt_path:
                wav = self.model.generate(
                    text,
                    audio_prompt_path=audio_prompt_path,
                    **gen_kwargs,
                )
            else:
                wav = self.model.generate(text, **gen_kwargs)

            if hasattr(wav, "cpu"):
                wav = wav.cpu()

            buffer = io.BytesIO()
            ta.save(buffer, wav, self.sample_rate, format="wav")
            buffer.seek(0)
            audio_bytes = buffer.getvalue()

            elapsed = time.perf_counter() - t0
            print(f"[TTS] {len(text)} chars -> {len(audio_bytes)} bytes em {elapsed:.1f}s")
            return audio_bytes

        finally:
            if audio_prompt_path:
                Path(audio_prompt_path).unlink(missing_ok=True)

    @modal.method()
    def health(self) -> dict:
        import torch
        return {
            "status": "healthy",
            "model_loaded": hasattr(self, "model") and self.model is not None,
            "gpu_available": torch.cuda.is_available(),
            "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "sample_rate": getattr(self, "sample_rate", None),
            "model_load_s": getattr(self, "load_time", None),
        }


@app.local_entrypoint()
def main(
    action: str = "health",
    text: str = "Ola, este e um teste de sintese de voz com Chatterbox.",
):
    """
    modal run modal_functions/tts_chatterbox.py --action health
    modal run modal_functions/tts_chatterbox.py --action test --text "Texto"
    """
    engine = TTSEngine()

    if action == "health":
        result = engine.health.remote()
        print(f"\n{result}")

    elif action == "test":
        print(f"Sintetizando: {text[:80]}...")
        t0 = time.time()
        audio_bytes = engine.synthesize.remote(text)
        wall = time.time() - t0
        print(f"Wall time: {wall:.1f}s")
        print(f"Audio: {len(audio_bytes)} bytes")

        out = Path("/tmp/tts_test_output.wav")
        out.write_bytes(audio_bytes)
        print(f"Salvo em: {out}")

    else:
        print(f"Acoes: health, test")
