"""
STT Service - Speech-to-Text com Faster-Whisper

Utiliza Faster-Whisper (CTranslate2) para transcricao local.
Modelo Medium (1.5GB) oferece melhor custo-beneficio para PT-BR.
"""
import base64
import io
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)


# Tipo para tamanhos de modelo disponiveis
ModelSize = Literal["tiny", "base", "small", "medium", "large-v3"]


@dataclass
class TranscriptionResult:
    """Resultado da transcricao."""

    text: str
    language: str
    confidence: float
    duration: float
    segments: list[dict]


class STTService:
    """
    Servico de Speech-to-Text usando Faster-Whisper.

    Atributos:
        model_size: Tamanho do modelo Whisper (tiny, base, small, medium, large-v3)
        device: Dispositivo para inferencia (cpu, cuda, auto)
        compute_type: Tipo de computacao (int8, float16, float32)
    """

    def __init__(
        self,
        model_size: ModelSize = "medium",
        device: str = "auto",
        compute_type: str = "auto",
    ):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None
        self._is_loaded = False

        # Diretorio para cache de modelos
        self.models_dir = Path(os.environ.get(
            "VOICE_AI_MODELS_DIR",
            Path.home() / ".cache" / "voice_ai" / "models"
        ))
        self.models_dir.mkdir(parents=True, exist_ok=True)

    @property
    def is_loaded(self) -> bool:
        """Verifica se o modelo esta carregado."""
        return self._is_loaded

    def _ensure_model_loaded(self):
        """Carrega o modelo se ainda nao estiver carregado (lazy loading)."""
        if self._is_loaded:
            return

        logger.info("Carregando modelo %s...", self.model_size)

        try:
            from faster_whisper import WhisperModel

            # Determina compute_type baseado no device
            if self.compute_type == "auto":
                if self.device == "cuda":
                    compute_type = "float16"
                else:
                    compute_type = "int8"
            else:
                compute_type = self.compute_type

            # Determina device
            if self.device == "auto":
                try:
                    import torch
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                except ImportError:
                    device = "cpu"
            else:
                device = self.device

            self._model = WhisperModel(
                self.model_size,
                device=device,
                compute_type=compute_type,
                download_root=str(self.models_dir),
            )

            self._is_loaded = True
            logger.info("Modelo carregado: %s (%s, %s)", self.model_size, device, compute_type)

        except Exception as e:
            logger.error("Erro ao carregar modelo: %s", e)
            raise RuntimeError(f"Falha ao carregar modelo Whisper: {e}") from e

    def unload(self):
        """Libera o modelo da memoria."""
        if self._model:
            del self._model
            self._model = None
            self._is_loaded = False
            logger.info("Modelo descarregado")

    def _convert_with_ffmpeg(self, input_path: str) -> str:
        """
        Converte audio para WAV 16kHz mono usando ffmpeg.

        Args:
            input_path: Caminho do arquivo de audio original

        Returns:
            Caminho do arquivo WAV convertido (caller deve deletar)
        """
        wav_path = input_path + ".converted.wav"
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", input_path,
                "-ar", "16000",
                "-ac", "1",
                "-f", "wav",
                wav_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg falhou: {result.stderr[:200]}")
        return wav_path

    def _decode_audio(self, audio_base64: str, format: str) -> np.ndarray:
        """
        Decodifica audio de base64 para numpy array.

        Tenta soundfile primeiro. Se o formato nao for suportado (ex: WebM),
        usa ffmpeg para converter para WAV antes de ler.

        Args:
            audio_base64: Audio codificado em base64
            format: Formato do audio (webm, wav, mp3, ogg, m4a)

        Returns:
            Numpy array com audio mono, 16kHz
        """
        # Decodifica base64
        audio_bytes = base64.b64decode(audio_base64)

        # Cria arquivo temporario com extensao correta
        suffix = f".{format}"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        wav_converted = None
        try:
            # Formatos que soundfile nao suporta: usar ffmpeg
            unsupported_by_sf = {"webm", "m4a", "mp4", "opus", "aac"}
            if format.lower() in unsupported_by_sf:
                logger.info("Formato %s nao suportado por soundfile, convertendo com ffmpeg...", format)
                wav_converted = self._convert_with_ffmpeg(tmp_path)
                audio_data, sample_rate = sf.read(wav_converted)
            else:
                try:
                    audio_data, sample_rate = sf.read(tmp_path)
                except Exception:
                    # Fallback: tenta ffmpeg se soundfile falhar
                    logger.info("soundfile falhou para %s, tentando ffmpeg...", format)
                    wav_converted = self._convert_with_ffmpeg(tmp_path)
                    audio_data, sample_rate = sf.read(wav_converted)

            # Converte para mono se necessario
            if len(audio_data.shape) > 1:
                audio_data = audio_data.mean(axis=1)

            # Resample para 16kHz se necessario (Whisper requer 16kHz)
            if sample_rate != 16000:
                duration = len(audio_data) / sample_rate
                target_samples = int(duration * 16000)
                indices = np.linspace(0, len(audio_data) - 1, target_samples)
                audio_data = np.interp(indices, np.arange(len(audio_data)), audio_data)

            # Normaliza para float32 [-1, 1]
            audio_data = audio_data.astype(np.float32)
            if audio_data.max() > 1.0:
                audio_data = audio_data / 32768.0

            return audio_data

        finally:
            # Remove arquivos temporarios
            os.unlink(tmp_path)
            if wav_converted and os.path.exists(wav_converted):
                os.unlink(wav_converted)

    def transcribe(
        self,
        audio_base64: str,
        format: str = "webm",
        language: str | None = "pt",
    ) -> TranscriptionResult:
        """
        Transcreve audio para texto.

        Args:
            audio_base64: Audio codificado em base64
            format: Formato do audio (webm, wav, mp3, ogg)
            language: Codigo do idioma (pt, en, es, etc.) ou None para auto-detect

        Returns:
            TranscriptionResult com texto transcrito e metadados
        """
        # Garante que modelo esta carregado
        self._ensure_model_loaded()

        # Decodifica audio
        logger.info("Decodificando audio (%s)...", format)
        audio_data = self._decode_audio(audio_base64, format)
        duration = len(audio_data) / 16000

        # Diagnostico de amplitude
        rms = float(np.sqrt(np.mean(audio_data**2)))
        peak = float(np.max(np.abs(audio_data)))
        logger.info("Audio: %.1fs, RMS=%.6f, peak=%.6f, samples=%d", duration, rms, peak, len(audio_data))
        if rms < 0.001:
            logger.warning("Audio parece ser silencio (RMS muito baixo)")

        logger.info("Transcrevendo %.1fs de audio...", duration)

        # Transcreve com Whisper
        segments, info = self._model.transcribe(
            audio_data,
            language=language,
            task="transcribe",
            beam_size=5,
            vad_filter=True,  # Remove silencios
            vad_parameters={
                "min_silence_duration_ms": 500,
            },
        )

        # Coleta segmentos
        all_segments = []
        full_text_parts = []

        for segment in segments:
            all_segments.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "confidence": segment.avg_logprob,
            })
            full_text_parts.append(segment.text.strip())

        full_text = " ".join(full_text_parts)

        # Calcula confianca media
        avg_confidence = 0.0
        if all_segments:
            avg_confidence = sum(s["confidence"] for s in all_segments) / len(all_segments)
            # Converte log prob para porcentagem aproximada
            avg_confidence = min(1.0, max(0.0, 1.0 + avg_confidence / 5))

        logger.info("Transcricao completa: %d caracteres", len(full_text))

        return TranscriptionResult(
            text=full_text,
            language=info.language,
            confidence=avg_confidence,
            duration=duration,
            segments=all_segments,
        )
