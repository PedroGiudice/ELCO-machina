"""
STT Service - Speech-to-Text com Faster-Whisper

Utiliza Faster-Whisper (CTranslate2) para transcricao local.
Modelo Medium (1.5GB) oferece melhor custo-beneficio para PT-BR.
"""
import base64
import io
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
import soundfile as sf


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

        print(f"[STT] Carregando modelo {self.model_size}...")

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
            print(f"[STT] Modelo carregado: {self.model_size} ({device}, {compute_type})")

        except Exception as e:
            print(f"[STT] Erro ao carregar modelo: {e}")
            raise RuntimeError(f"Falha ao carregar modelo Whisper: {e}") from e

    def unload(self):
        """Libera o modelo da memoria."""
        if self._model:
            del self._model
            self._model = None
            self._is_loaded = False
            print("[STT] Modelo descarregado")

    def _decode_audio(self, audio_base64: str, format: str) -> np.ndarray:
        """
        Decodifica audio de base64 para numpy array.

        Args:
            audio_base64: Audio codificado em base64
            format: Formato do audio (webm, wav, mp3, ogg)

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

        try:
            # Le audio com soundfile
            audio_data, sample_rate = sf.read(tmp_path)

            # Converte para mono se necessario
            if len(audio_data.shape) > 1:
                audio_data = audio_data.mean(axis=1)

            # Resample para 16kHz se necessario (Whisper requer 16kHz)
            if sample_rate != 16000:
                # Resample simples usando interpolacao
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
            # Remove arquivo temporario
            os.unlink(tmp_path)

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
        print(f"[STT] Decodificando audio ({format})...")
        audio_data = self._decode_audio(audio_base64, format)
        duration = len(audio_data) / 16000

        print(f"[STT] Transcrevendo {duration:.1f}s de audio...")

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

        print(f"[STT] Transcricao completa: {len(full_text)} caracteres")

        return TranscriptionResult(
            text=full_text,
            language=info.language,
            confidence=avg_confidence,
            duration=duration,
            segments=all_segments,
        )
