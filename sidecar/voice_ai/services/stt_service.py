"""
STT Service - Speech-to-Text com whisper-server HTTP + fallback Faster-Whisper

Suporta multiplos modelos via whisper-server instances (cada uma em porta propria).
Fallback: Faster-Whisper (CTranslate2) se nenhum whisper-server disponivel.
"""
import base64
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

WHISPER_SERVER_TIMEOUT = int(os.environ.get("WHISPER_SERVER_TIMEOUT", "300"))

# Modelos disponiveis via whisper-server (model_id -> URL)
# Cada instancia roda em porta separada com modelo fixo.
WHISPER_SERVERS: dict[str, str] = {
    "large-v3-turbo": os.environ.get("WHISPER_SERVER_URL", "http://127.0.0.1:8178"),
    "small": os.environ.get("WHISPER_SERVER_SMALL_URL", "http://127.0.0.1:8179"),
}

DEFAULT_MODEL = os.environ.get("WHISPER_DEFAULT_MODEL", "large-v3-turbo")


@dataclass
class TranscriptionResult:
    """Resultado da transcricao."""

    text: str
    language: str
    confidence: float
    duration: float
    segments: list[dict]


@dataclass
class ModelInfo:
    """Info sobre um modelo STT disponivel."""
    model_id: str
    backend: str  # "whisper-server" ou "faster-whisper"
    url: str | None = None  # URL do whisper-server (se aplicavel)
    warm: bool = False  # modelo carregado em RAM


class STTService:
    """
    Servico de Speech-to-Text com suporte a multiplos modelos.

    Cada modelo pode estar warm (whisper-server) ou cold (faster-whisper fallback).
    O usuario escolhe o modelo por request; default configuravel via env.
    """

    def __init__(
        self,
        device: str = "auto",
        compute_type: str = "auto",
    ):
        self.device = device
        self.compute_type = compute_type
        self._fw_model = None
        self._available_models: dict[str, ModelInfo] = {}
        self._has_faster_whisper = False

        self.models_dir = Path(os.environ.get(
            "VOICE_AI_MODELS_DIR",
            Path.home() / ".cache" / "voice_ai" / "models"
        ))
        self.models_dir.mkdir(parents=True, exist_ok=True)

        # Detecta whisper-server instances disponiveis
        for model_id, url in WHISPER_SERVERS.items():
            if self._check_server(url):
                self._available_models[model_id] = ModelInfo(
                    model_id=model_id,
                    backend="whisper-server",
                    url=url,
                    warm=True,
                )
                logger.info("STT model '%s': whisper-server warm (%s)", model_id, url)

        # Detecta faster-whisper como fallback
        try:
            from faster_whisper import WhisperModel  # noqa: F401
            self._has_faster_whisper = True
            logger.info("STT fallback: faster-whisper disponivel")
        except ImportError:
            pass

        if not self._available_models and not self._has_faster_whisper:
            logger.error("Nenhum backend STT disponivel")

    @staticmethod
    def _check_server(url: str) -> bool:
        """Verifica se um whisper-server esta acessivel."""
        try:
            with httpx.Client(timeout=5) as client:
                resp = client.get(url)
                return resp.status_code < 500
        except Exception:
            return False

    @property
    def is_loaded(self) -> bool:
        return bool(self._available_models) or self._has_faster_whisper

    @property
    def backend(self) -> str | None:
        if self._available_models:
            return "whisper-server"
        if self._has_faster_whisper:
            return "faster-whisper"
        return None

    @property
    def model_size(self) -> str:
        return DEFAULT_MODEL

    @property
    def available_models(self) -> list[dict]:
        """Lista modelos disponiveis com status warm/cold."""
        models = []
        for model_id, info in self._available_models.items():
            models.append({
                "id": model_id,
                "backend": info.backend,
                "warm": info.warm,
                "default": model_id == DEFAULT_MODEL,
            })
        return models

    def unload(self):
        """Libera modelo faster-whisper da memoria."""
        if self._fw_model:
            del self._fw_model
            self._fw_model = None
            logger.info("Modelo faster-whisper descarregado")

    def _convert_to_wav16k(self, input_path: str) -> str:
        """Converte audio para WAV 16kHz 16-bit mono via ffmpeg."""
        wav_path = input_path + ".16k.wav"
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1",
             "-sample_fmt", "s16", "-f", "wav", wav_path],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg falhou: {result.stderr[:200]}")
        return wav_path

    def _decode_audio_to_file(self, audio_base64: str, format: str) -> tuple[str, float]:
        """
        Decodifica audio base64 para arquivo WAV 16kHz no disco.
        Retorna (path_wav, duration_seconds). Caller deve deletar o arquivo.
        """
        audio_bytes = base64.b64decode(audio_base64)

        suffix = f".{format}"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            wav_path = self._convert_to_wav16k(tmp_path)
        finally:
            os.unlink(tmp_path)

        # Calcula duracao
        data, sr = sf.read(wav_path)
        duration = len(data) / sr

        return wav_path, duration

    def _decode_audio_to_array(self, audio_base64: str, format: str) -> tuple[np.ndarray, float]:
        """Decodifica audio base64 para numpy array float32 16kHz mono."""
        wav_path, duration = self._decode_audio_to_file(audio_base64, format)
        try:
            data, sr = sf.read(wav_path)
            if len(data.shape) > 1:
                data = data.mean(axis=1)
            return data.astype(np.float32), duration
        finally:
            os.unlink(wav_path)

    def _transcribe_via_server(self, wav_path: str, duration: float, language: str | None, server_url: str | None = None) -> TranscriptionResult:
        """Transcreve usando whisper-server via HTTP POST multipart."""
        base_url = server_url or WHISPER_SERVERS.get(DEFAULT_MODEL, "http://127.0.0.1:8178")
        url = f"{base_url}/inference"

        with open(wav_path, "rb") as f:
            files = {"file": ("audio.wav", f, "audio/wav")}
            data = {
                "response_format": "json",
            }
            if language:
                data["language"] = language

            with httpx.Client(timeout=WHISPER_SERVER_TIMEOUT) as client:
                resp = client.post(url, files=files, data=data)
                resp.raise_for_status()

        result = resp.json()
        text = result.get("text", "").strip()

        return TranscriptionResult(
            text=text,
            language=language or "pt",
            confidence=0.95,
            duration=duration,
            segments=[],
        )

    def _ensure_fw_model(self):
        """Carrega faster-whisper model."""
        if self._fw_model:
            return

        from faster_whisper import WhisperModel

        if self.compute_type == "auto":
            compute_type = "int8"
        else:
            compute_type = self.compute_type

        if self.device == "auto":
            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                device = "cpu"
        else:
            device = self.device

        logger.info("Carregando faster-whisper %s (%s, %s)...", self.model_size, device, compute_type)
        self._fw_model = WhisperModel(
            self.model_size,
            device=device,
            compute_type=compute_type,
            download_root=str(self.models_dir),
        )
        logger.info("faster-whisper carregado")

    def _transcribe_faster_whisper(self, audio_data: np.ndarray, duration: float, language: str | None) -> TranscriptionResult:
        """Transcreve usando faster-whisper."""
        self._ensure_fw_model()

        segments_iter, info = self._fw_model.transcribe(
            audio_data,
            language=language,
            task="transcribe",
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )

        all_segments = []
        text_parts = []
        for seg in segments_iter:
            all_segments.append({
                "start": seg.start,
                "end": seg.end,
                "text": seg.text.strip(),
                "confidence": seg.avg_logprob,
            })
            text_parts.append(seg.text.strip())

        avg_confidence = 0.0
        if all_segments:
            avg_confidence = sum(s["confidence"] for s in all_segments) / len(all_segments)
            avg_confidence = min(1.0, max(0.0, 1.0 + avg_confidence / 5))

        return TranscriptionResult(
            text=" ".join(text_parts),
            language=info.language,
            confidence=avg_confidence,
            duration=duration,
            segments=all_segments,
        )

    def transcribe(
        self,
        audio_base64: str,
        format: str = "webm",
        language: str | None = "pt",
        model: str | None = None,
    ) -> TranscriptionResult:
        """
        Transcreve audio para texto.

        Args:
            audio_base64: Audio codificado em base64
            format: Formato do audio (webm, wav, mp3, ogg)
            language: Codigo do idioma (pt, en, es, etc.) ou None para auto-detect
            model: ID do modelo (large-v3-turbo, small). None usa default.

        Returns:
            TranscriptionResult com texto transcrito e metadados
        """
        if not self.is_loaded:
            raise RuntimeError("Nenhum backend STT disponivel")

        model = model or DEFAULT_MODEL

        # Tenta whisper-server para o modelo solicitado
        model_info = self._available_models.get(model)

        if model_info:
            wav_path, duration = self._decode_audio_to_file(audio_base64, format)
            try:
                logger.info("Transcrevendo %.1fs com whisper-server '%s'...", duration, model)
                return self._transcribe_via_server(wav_path, duration, language, server_url=model_info.url)
            except Exception as e:
                logger.warning("whisper-server '%s' falhou (%s), tentando faster-whisper...", model, e)
                if self._has_faster_whisper:
                    try:
                        audio_data, _ = sf.read(wav_path)
                        if len(audio_data.shape) > 1:
                            audio_data = audio_data.mean(axis=1)
                        return self._transcribe_faster_whisper(audio_data.astype(np.float32), duration, language)
                    except Exception:
                        raise
                raise
            finally:
                if os.path.exists(wav_path):
                    os.unlink(wav_path)

        # Modelo nao tem server warm — fallback para faster-whisper
        if self._has_faster_whisper:
            audio_data, duration = self._decode_audio_to_array(audio_base64, format)
            logger.info("Transcrevendo %.1fs com faster-whisper (modelo '%s' sem server warm)...", duration, model)
            return self._transcribe_faster_whisper(audio_data, duration, language)

        raise RuntimeError(f"Modelo '{model}' nao disponivel. Disponiveis: {list(self._available_models.keys())}")
