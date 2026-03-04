"""
STT Modal Client -- Transcreve audio via Modal (faster-whisper GPU).

Usa a mesma app Modal definida em scripts/modal_whisper_bench.py.
O script ja tem a imagem com modelo cacheado no snapshot.

Requisito: MODAL_TOKEN_ID e MODAL_TOKEN_SECRET no ambiente.
"""
import base64
import logging
import os
import time

logger = logging.getLogger(__name__)


class STTModalClient:
    """
    Cliente para transcricao via Modal.

    Chama Whisper().transcribe.remote(audio_bytes, language) e retorna
    resultado no mesmo formato que STTService.TranscriptionResult.
    """

    def __init__(self):
        self._available = False
        try:
            import modal  # noqa: F401
            # Verifica credenciais
            token_id = os.environ.get("MODAL_TOKEN_ID")
            token_secret = os.environ.get("MODAL_TOKEN_SECRET")
            if token_id and token_secret:
                self._available = True
                logger.info("STT Modal client disponivel")
            else:
                logger.info("STT Modal client: credenciais ausentes (MODAL_TOKEN_ID/SECRET)")
        except ImportError:
            logger.info("STT Modal client: modal SDK nao instalado")

    @property
    def is_available(self) -> bool:
        return self._available

    def transcribe(
        self,
        audio_base64: str,
        format: str = "webm",
        language: str | None = "pt",
    ) -> dict:
        """
        Transcreve audio via Modal GPU.

        Args:
            audio_base64: Audio codificado em base64
            format: Formato do audio (webm, wav, mp3, ogg, m4a)
            language: Codigo do idioma ou None para auto-detect

        Returns:
            dict com keys: text, language, confidence, duration, segments
        """
        if not self._available:
            raise RuntimeError("Modal STT nao disponivel (credenciais ou SDK ausentes)")

        import modal

        audio_bytes = base64.b64decode(audio_base64)

        # Lookup da classe Whisper na app whisper-bench (ja deployada)
        Whisper = modal.Cls.from_name("whisper-bench", "Whisper")

        t0 = time.perf_counter()
        result = Whisper().transcribe.remote(audio_bytes, language or "pt")
        wall_time = time.perf_counter() - t0

        logger.info(
            "Modal STT: %.1fs wall, %.1fs inference, %.1fs audio, RTF %.3f",
            wall_time, result["inference_s"], result["duration_audio_s"], result["rtf"],
        )

        # Converte para formato compativel com TranscriptionResult
        segments = [
            {
                "start": s["start"],
                "end": s["end"],
                "text": s["text"],
                "confidence": 0.95,
            }
            for s in result.get("segments", [])
        ]

        return {
            "text": result["text"],
            "language": result.get("language", language or "pt"),
            "confidence": 0.95,
            "duration": result.get("duration_audio_s", 0.0),
            "segments": segments,
        }
