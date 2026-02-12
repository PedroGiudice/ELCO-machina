"""
TTS Service - Piper TTS Local

Servico de sintese de voz usando Piper TTS (ONNX).
Suporta multiplas vozes PT-BR com baixo uso de recursos.
"""

import io
import logging
import os
import wave
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

# Piper TTS sera importado lazy para evitar erro se nao instalado
_piper_voice = None


class TTSService:
    """Servico de Text-to-Speech usando Piper."""

    # Vozes PT-BR disponiveis
    VOICES = {
        "pt-br-edresson-low": {
            "model": "pt_BR-edresson-low",
            "quality": "low",
            "description": "Voz masculina, baixa qualidade, rapida",
        },
        "pt-br-faber-medium": {
            "model": "pt_BR-faber-medium",
            "quality": "medium",
            "description": "Voz masculina, qualidade media",
        },
    }

    DEFAULT_VOICE = "pt-br-faber-medium"

    def __init__(self, models_dir: str | None = None):
        """
        Inicializa o servico TTS.

        Args:
            models_dir: Diretorio para cache de modelos Piper
        """
        self.models_dir = Path(
            models_dir or os.environ.get("PIPER_MODELS_DIR", "~/.local/share/piper")
        ).expanduser()
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self._voice = None
        self._current_voice_id = None
        self._is_available = False

        # Verifica se Piper esta instalado
        try:
            import piper  # noqa: F401

            self._is_available = True
        except ImportError:
            logger.info("piper-tts nao instalado. TTS indisponivel.")

    @property
    def is_available(self) -> bool:
        """Retorna se TTS esta disponivel."""
        return self._is_available

    @property
    def is_loaded(self) -> bool:
        """Retorna se uma voz esta carregada."""
        return self._voice is not None

    def load_voice(self, voice_id: str | None = None) -> bool:
        """
        Carrega uma voz Piper.

        Args:
            voice_id: ID da voz (default: pt-br-faber-medium)

        Returns:
            True se carregou com sucesso
        """
        if not self._is_available:
            return False

        voice_id = voice_id or self.DEFAULT_VOICE

        if voice_id not in self.VOICES:
            logger.warning("Voz desconhecida: %s", voice_id)
            return False

        # Se ja esta carregada, nao recarrega
        if self._voice and self._current_voice_id == voice_id:
            return True

        try:
            from piper import PiperVoice

            model_name = self.VOICES[voice_id]["model"]
            model_path = self.models_dir / f"{model_name}.onnx"
            config_path = self.models_dir / f"{model_name}.onnx.json"

            # Baixa modelo se necessario
            if not model_path.exists():
                logger.info("Baixando modelo %s...", model_name)
                self._download_model(model_name)

            if not model_path.exists():
                logger.error("Modelo nao encontrado: %s", model_path)
                return False

            logger.info("Carregando voz %s...", voice_id)
            self._voice = PiperVoice.load(str(model_path), str(config_path))
            self._current_voice_id = voice_id
            logger.info("Voz %s carregada!", voice_id)
            return True

        except Exception as e:
            logger.error("Erro ao carregar voz: %s", e)
            return False

    def _download_model(self, model_name: str) -> bool:
        """
        Baixa modelo Piper do repositorio oficial.

        Args:
            model_name: Nome do modelo (ex: pt_BR-faber-medium)

        Returns:
            True se baixou com sucesso
        """
        import urllib.request

        # Estrutura do HuggingFace Piper Voices:
        # https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/pt/pt_BR/{speaker}/{quality}/{model_name}.onnx
        base_url = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"

        # Extrai componentes do model_name (ex: pt_BR-faber-medium)
        # Formato: {lang}_{region}-{speaker}-{quality}
        parts = model_name.split("-")
        if len(parts) != 3:
            logger.error("Formato de modelo invalido: %s", model_name)
            return False

        lang_region = parts[0]  # pt_BR
        speaker = parts[1]  # faber
        quality = parts[2]  # medium

        # Converte pt_BR para pt/pt_BR
        lang = lang_region.split("_")[0]  # pt

        try:
            # Baixa arquivo ONNX
            onnx_url = f"{base_url}/{lang}/{lang_region}/{speaker}/{quality}/{model_name}.onnx"
            onnx_path = self.models_dir / f"{model_name}.onnx"
            logger.info("Baixando %s...", onnx_url)
            urllib.request.urlretrieve(onnx_url, onnx_path)

            # Baixa arquivo de configuracao
            config_url = f"{base_url}/{lang}/{lang_region}/{speaker}/{quality}/{model_name}.onnx.json"
            config_path = self.models_dir / f"{model_name}.onnx.json"
            logger.info("Baixando %s...", config_url)
            urllib.request.urlretrieve(config_url, config_path)

            logger.info("Modelo %s baixado com sucesso!", model_name)
            return True

        except Exception as e:
            logger.error("Erro ao baixar modelo: %s", e)
            return False

    def synthesize(
        self,
        text: str,
        voice_id: str | None = None,
        speed: float = 1.0,
        output_format: Literal["wav", "raw"] = "wav",
    ) -> bytes:
        """
        Sintetiza texto em audio.

        Args:
            text: Texto para sintetizar
            voice_id: ID da voz (carrega se necessario)
            speed: Velocidade (0.5 - 2.0)
            output_format: Formato de saida

        Returns:
            Bytes do audio gerado

        Raises:
            RuntimeError: Se TTS nao disponivel ou erro na sintese
        """
        if not self._is_available:
            raise RuntimeError("TTS nao disponivel. Instale piper-tts.")

        # Carrega voz se necessario
        voice_id = voice_id or self.DEFAULT_VOICE
        if not self._voice or self._current_voice_id != voice_id:
            if not self.load_voice(voice_id):
                raise RuntimeError(f"Falha ao carregar voz: {voice_id}")

        # Valida velocidade
        speed = max(0.5, min(2.0, speed))

        try:
            from piper.config import SynthesisConfig

            # Configura sintese com velocidade
            syn_config = SynthesisConfig(length_scale=1.0 / speed)

            # Sintetiza - piper.synthesize() retorna generator de AudioChunk
            audio_data = b""
            for audio_chunk in self._voice.synthesize(text, syn_config):
                audio_data += audio_chunk.audio_int16_bytes

            if output_format == "raw":
                return audio_data

            # Converte para WAV
            sample_rate = self._voice.config.sample_rate
            wav_buffer = io.BytesIO()

            with wave.open(wav_buffer, "wb") as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(audio_data)

            return wav_buffer.getvalue()

        except Exception as e:
            raise RuntimeError(f"Erro na sintese: {e}")

    def get_voices(self) -> dict:
        """Retorna vozes disponiveis."""
        return self.VOICES.copy()

    def unload(self):
        """Libera recursos da voz carregada."""
        self._voice = None
        self._current_voice_id = None
        logger.info("Voz descarregada.")
