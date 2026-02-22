"""
TTS Service - Kokoro-82M

Sintese de voz local usando Kokoro (82M params).
Suporta vozes PT-BR nativas. RTF < 1.0 em CPU.
"""
import io
import logging
import os
import wave
from typing import Literal

import numpy as np

logger = logging.getLogger(__name__)


# Vozes PT-BR disponiveis no Kokoro
VOICES = {
    "pf_dora": {"description": "Feminina PT-BR", "lang": "p"},
    "pm_santa": {"description": "Masculina PT-BR", "lang": "p"},
}

DEFAULT_VOICE = "pf_dora"


class TTSService:
    """Servico de Text-to-Speech usando Kokoro-82M."""

    DEFAULT_VOICE = DEFAULT_VOICE

    def __init__(self):
        self._pipeline = None
        self._is_available = False

        try:
            import kokoro  # noqa: F401
            self._is_available = True
        except ImportError:
            logger.info("kokoro nao instalado. TTS indisponivel.")

    @property
    def is_available(self) -> bool:
        return self._is_available

    @property
    def is_loaded(self) -> bool:
        return self._pipeline is not None

    def _ensure_loaded(self):
        """Carrega o pipeline Kokoro (lazy, ~16s no primeiro load)."""
        if self._pipeline:
            return

        if not self._is_available:
            raise RuntimeError("TTS nao disponivel. Instale kokoro.")

        from kokoro import KPipeline

        logger.info("Carregando Kokoro pipeline (lang=p)...")
        self._pipeline = KPipeline(lang_code="p")
        logger.info("Kokoro pipeline carregado")

    def synthesize(
        self,
        text: str,
        voice: str | None = None,
        speed: float = 1.0,
        output_format: Literal["wav", "raw"] = "wav",
    ) -> bytes:
        """
        Sintetiza texto em audio.

        Args:
            text: Texto para sintetizar
            voice: Nome da voz (pf_dora, pm_santa)
            speed: Velocidade (0.5 - 2.0)
            output_format: Formato de saida

        Returns:
            Bytes do audio gerado (WAV 24kHz mono 16-bit ou raw float32)
        """
        self._ensure_loaded()

        voice = voice or DEFAULT_VOICE
        if voice not in VOICES:
            raise ValueError(f"Voz desconhecida: {voice}. Disponiveis: {list(VOICES.keys())}")

        speed = max(0.5, min(2.0, speed))

        # Kokoro retorna generator de (graphemes, phonemes, audio_tensor)
        audio_chunks = []
        for _, _, audio in self._pipeline(text, voice=voice, speed=speed):
            audio_chunks.append(audio.numpy() if hasattr(audio, 'numpy') else np.array(audio))

        if not audio_chunks:
            raise RuntimeError("Kokoro nao gerou audio")

        audio_data = np.concatenate(audio_chunks)

        if output_format == "raw":
            return audio_data.tobytes()

        # Converte para WAV 24kHz 16-bit mono
        audio_int16 = (audio_data * 32767).clip(-32768, 32767).astype(np.int16)
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(audio_int16.tobytes())

        return wav_buffer.getvalue()

    def get_voices(self) -> dict:
        """Retorna vozes disponiveis."""
        return VOICES.copy()

    def unload(self):
        """Libera pipeline da memoria."""
        self._pipeline = None
        logger.info("Kokoro pipeline descarregado")
