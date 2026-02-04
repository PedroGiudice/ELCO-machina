"""
Modal function para TTS com Chatterbox (voz clonada).

Deploy: modal deploy modal_functions/tts_chatterbox.py
Warmup: modal run modal_functions/tts_chatterbox.py::warmup
Health: modal run modal_functions/tts_chatterbox.py::health_check

Requer: MODAL_TOKEN_ID e MODAL_TOKEN_SECRET configurados.
"""

import io
import tempfile
from pathlib import Path

import modal

# -----------------------------------------------------------------------------
# Configuracao do App Modal
# -----------------------------------------------------------------------------

app = modal.App("elco-tts")

# Imagem com dependencias para Chatterbox
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libsndfile1", "ffmpeg")
    .pip_install(
        "chatterbox-tts",
        "torch>=2.0.0",
        "torchaudio",
        "soundfile",
    )
)

# Volume para cache de modelos (evita re-download)
model_cache = modal.Volume.from_name("elco-tts-cache", create_if_missing=True)

# Caminho do cache dentro do container
CACHE_DIR = "/cache"
MODEL_CACHE_PATH = f"{CACHE_DIR}/chatterbox"


# -----------------------------------------------------------------------------
# Classe TTSEngine com Memory Snapshot
# -----------------------------------------------------------------------------


@app.cls(
    image=image,
    gpu="T4",
    timeout=1800,  # 30 minutos
    volumes={CACHE_DIR: model_cache},
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},  # Reduz cold start de ~2min para ~10s
)
class TTSEngine:
    """
    Engine de TTS usando Chatterbox com suporte a clonagem de voz.

    Usa memory snapshot em duas fases:
    - snap=True: Carrega modelo na CPU (capturado no snapshot)
    - snap=False: Move modelo para GPU (apos restore)

    Referencia: https://github.com/resemble-ai/chatterbox
    """

    @modal.enter(snap=True)
    def load_model_cpu(self):
        """
        Fase 1: Carrega modelo na CPU.
        Este estado eh capturado no memory snapshot.
        """
        import os

        os.environ["HF_HOME"] = MODEL_CACHE_PATH
        os.environ["TORCH_HOME"] = MODEL_CACHE_PATH

        from chatterbox.tts import ChatterboxTTS

        print("[TTSEngine] Carregando Chatterbox na CPU...")
        self.model = ChatterboxTTS.from_pretrained(device="cpu")
        self.sample_rate = self.model.sr
        print(f"[TTSEngine] Modelo carregado na CPU. Sample rate: {self.sample_rate}")

        # Commit do volume para persistir cache
        model_cache.commit()

    @modal.enter(snap=False)
    def move_to_gpu(self):
        """
        Fase 2: Move modelo para GPU apos restore do snapshot.

        Nota: ChatterboxTTS nao tem metodo .to() direto.
        Re-inicializamos com device="cuda" para garantir GPU.
        """
        import os

        os.environ["HF_HOME"] = MODEL_CACHE_PATH
        os.environ["TORCH_HOME"] = MODEL_CACHE_PATH

        from chatterbox.tts import ChatterboxTTS

        print("[TTSEngine] Carregando Chatterbox na GPU...")
        # Re-carrega diretamente na GPU (modelos ficam em cache no volume)
        self.model = ChatterboxTTS.from_pretrained(device="cuda")
        self.sample_rate = self.model.sr
        print(f"[TTSEngine] Modelo pronto na GPU. Sample rate: {self.sample_rate}")

    @modal.method()
    def synthesize(
        self,
        text: str,
        voice_ref_bytes: bytes | None = None,
        temperature: float = 0.8,
        top_p: float = 0.95,
        repetition_penalty: float = 1.2,
    ) -> bytes:
        """
        Sintetiza audio a partir de texto.

        Args:
            text: Texto para sintetizar (suporta tags paralinguisticas como [laugh], [chuckle])
            voice_ref_bytes: Bytes do audio de referencia para clonagem (minimo 5s, ideal 10s)
            temperature: Controle de variabilidade (0.0 - 1.0, default 0.8)
            top_p: Nucleus sampling (0.0 - 1.0, default 0.95)
            repetition_penalty: Penalidade para repeticoes (default 1.2)

        Returns:
            Bytes do audio WAV gerado
        """
        import torchaudio as ta

        audio_prompt_path = None

        # Se tiver audio de referencia, salva em arquivo temporario
        if voice_ref_bytes:
            with tempfile.NamedTemporaryFile(
                suffix=".wav", delete=False
            ) as tmp_file:
                tmp_file.write(voice_ref_bytes)
                audio_prompt_path = tmp_file.name

        try:
            # Gera audio
            text_preview = text[:50] + "..." if len(text) > 50 else text
            print(f"[TTSEngine] Sintetizando: {text_preview}")

            if audio_prompt_path:
                wav = self.model.generate(
                    text,
                    audio_prompt_path=audio_prompt_path,
                )
            else:
                wav = self.model.generate(text)

            # Converte tensor para bytes WAV
            buffer = io.BytesIO()

            # Garante que wav esta no formato correto (CPU)
            if hasattr(wav, "cpu"):
                wav = wav.cpu()

            # Salva usando torchaudio
            ta.save(buffer, wav, self.sample_rate, format="wav")
            buffer.seek(0)

            audio_bytes = buffer.getvalue()
            print(f"[TTSEngine] Audio gerado: {len(audio_bytes)} bytes")
            return audio_bytes

        finally:
            # Limpa arquivo temporario
            if audio_prompt_path:
                Path(audio_prompt_path).unlink(missing_ok=True)

    @modal.method()
    def health(self) -> dict:
        """Retorna status do engine."""
        import torch

        return {
            "status": "healthy",
            "model_loaded": hasattr(self, "model") and self.model is not None,
            "gpu_available": torch.cuda.is_available(),
            "gpu_name": (
                torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
            ),
            "sample_rate": self.sample_rate if hasattr(self, "sample_rate") else None,
        }


# -----------------------------------------------------------------------------
# Funcoes de CLI (modal run)
# -----------------------------------------------------------------------------


@app.function(image=image)
def warmup():
    """
    Faz warmup do engine para criar memory snapshot.
    Executar apos deploy: modal run modal_functions/tts_chatterbox.py::warmup
    """
    engine = TTSEngine()
    result = engine.health.remote()
    print(f"Warmup completo: {result}")
    return result


@app.function(image=image)
def health_check():
    """
    Verifica saude do servico.
    Executar: modal run modal_functions/tts_chatterbox.py::health_check
    """
    engine = TTSEngine()
    result = engine.health.remote()
    print(f"Health check: {result}")
    return result


@app.function(image=image)
def test_synthesis(text: str = "Ola, este eh um teste de sintese de voz."):
    """
    Testa sintese basica (sem clonagem).
    Executar: modal run modal_functions/tts_chatterbox.py::test_synthesis
    """
    engine = TTSEngine()
    audio_bytes = engine.synthesize.remote(text)
    print(f"Audio gerado: {len(audio_bytes)} bytes")

    # Salva arquivo de teste
    output_path = Path("/tmp/tts_test_output.wav")
    output_path.write_bytes(audio_bytes)
    print(f"Audio salvo em: {output_path}")

    return {"success": True, "audio_size": len(audio_bytes)}


# -----------------------------------------------------------------------------
# Entrypoint Local
# -----------------------------------------------------------------------------


@app.local_entrypoint()
def main(
    action: str = "health",
    text: str = "Ola, este eh um teste de sintese de voz com Chatterbox.",
):
    """
    Entrypoint local para CLI.

    Uso:
        modal run modal_functions/tts_chatterbox.py --action health
        modal run modal_functions/tts_chatterbox.py --action test --text "Seu texto"
        modal run modal_functions/tts_chatterbox.py --action warmup
    """
    if action == "health":
        result = health_check.remote()
        print(f"\nResultado: {result}")

    elif action == "warmup":
        result = warmup.remote()
        print(f"\nWarmup completo: {result}")

    elif action == "test":
        result = test_synthesis.remote(text)
        print(f"\nTeste completo: {result}")

    else:
        print(f"Acao desconhecida: {action}")
        print("Acoes disponiveis: health, warmup, test")
