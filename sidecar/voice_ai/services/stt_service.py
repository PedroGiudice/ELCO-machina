"""
STT Service - Speech-to-Text via whisper.cpp CLI (subprocess)

Sem Ollama, sem Gemini, sem fallbacks. whisper.cpp CLI e a unica engine.
Decisao baseada em benchmark exaustivo (2026-02-23):
- CLI subprocess: RTF 0.346 (2x mais rapido que whisper-server HTTP)
- Modelo default: small q5_1 (190MB, RTF ~0.44)
- Sem --prompt (custo +37% latencia, sem beneficio real)
- Sem VAD (so agressivo ajuda, mas quebra termos)
"""
import base64
import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

WHISPER_CLI = os.environ.get(
    "WHISPER_CLI",
    str(Path.home() / ".local" / "share" / "whisper.cpp" / "whisper-cli"),
)

MODELS_DIR = Path(os.environ.get(
    "WHISPER_MODELS_DIR",
    Path.home() / ".local" / "share" / "whisper.cpp" / "models",
))

# Modelos disponiveis: model_id -> filename
MODELS: dict[str, str] = {
    "small": "ggml-small-q5_1.bin",
    "large-v3-turbo": "ggml-large-v3-turbo-q5_0.bin",
}

DEFAULT_MODEL = os.environ.get("WHISPER_DEFAULT_MODEL", "small")
WHISPER_THREADS = int(os.environ.get("WHISPER_THREADS", "4"))
WHISPER_TIMEOUT = int(os.environ.get("WHISPER_TIMEOUT", "300"))


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
    Speech-to-Text via whisper.cpp CLI.

    Chama whisper-cli via subprocess com output JSON.
    Modelo default: small q5_1 (benchmark winner).
    """

    def __init__(self):
        self._cli = WHISPER_CLI
        self._models_dir = MODELS_DIR
        self._available_models: dict[str, Path] = {}

        # Valida binario
        if not Path(self._cli).is_file():
            logger.error("whisper-cli nao encontrado: %s", self._cli)
        else:
            logger.info("whisper-cli: %s", self._cli)

        # Detecta modelos disponiveis
        for model_id, filename in MODELS.items():
            model_path = self._models_dir / filename
            if model_path.is_file():
                self._available_models[model_id] = model_path
                logger.info("STT model '%s': %s (%.0fMB)",
                            model_id, filename, model_path.stat().st_size / 1e6)
            else:
                logger.warning("STT model '%s' nao encontrado: %s", model_id, model_path)

    @property
    def is_loaded(self) -> bool:
        return bool(self._available_models) and Path(self._cli).is_file()

    @property
    def backend(self) -> str:
        return "whisper-cli"

    @property
    def model_size(self) -> str:
        return DEFAULT_MODEL

    @property
    def available_models(self) -> list[dict]:
        return [
            {
                "id": model_id,
                "backend": "whisper-cli",
                "warm": False,
                "default": model_id == DEFAULT_MODEL,
            }
            for model_id in self._available_models
        ]

    def unload(self):
        """Noop — CLI nao mantem estado."""
        pass

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

    def _get_duration(self, wav_path: str) -> float:
        """Obtem duracao do audio via ffprobe."""
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", wav_path],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
        return 0.0

    def _transcribe_cli(
        self, wav_path: str, duration: float, language: str | None, model: str,
    ) -> TranscriptionResult:
        """Transcreve usando whisper-cli via subprocess com output JSON."""
        model_path = self._available_models.get(model)
        if not model_path:
            raise RuntimeError(
                f"Modelo '{model}' nao disponivel. "
                f"Disponiveis: {list(self._available_models.keys())}"
            )

        # Output JSON para arquivo temp
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp_out:
            output_base = tmp_out.name.removesuffix(".json")

        cmd = [
            self._cli,
            "-m", str(model_path),
            "-t", str(WHISPER_THREADS),
            "-np",              # no prints (so resultado)
            "-oj",              # output JSON
            "-of", output_base, # output file base (gera .json)
            wav_path,
        ]

        if language:
            cmd.extend(["-l", language])

        logger.info(
            "Transcrevendo %.1fs com whisper-cli '%s'...", duration, model,
        )

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=WHISPER_TIMEOUT,
            )

            if result.returncode != 0:
                raise RuntimeError(
                    f"whisper-cli falhou (exit {result.returncode}): "
                    f"{result.stderr[:300]}"
                )

            # Parse JSON output
            json_path = output_base + ".json"
            try:
                with open(json_path) as f:
                    data = json.load(f)
            finally:
                # Cleanup
                for ext in [".json"]:
                    p = output_base + ext
                    if os.path.exists(p):
                        os.unlink(p)

            # Extrai texto e segmentos do formato whisper.cpp JSON
            # offsets.from/to em milissegundos
            transcription = data.get("transcription", [])
            text_parts = []
            segments = []

            for seg in transcription:
                seg_text = seg.get("text", "").strip()
                if seg_text:
                    text_parts.append(seg_text)
                    offsets = seg.get("offsets", {})
                    segments.append({
                        "start": offsets.get("from", 0) / 1000.0,
                        "end": offsets.get("to", 0) / 1000.0,
                        "text": seg_text,
                        "confidence": 0.0,
                    })

            full_text = " ".join(text_parts)
            detected_lang = data.get("result", {}).get("language", language or "pt")

            return TranscriptionResult(
                text=full_text,
                language=detected_lang,
                confidence=0.95,
                duration=duration,
                segments=segments,
            )

        except subprocess.TimeoutExpired:
            raise RuntimeError(
                f"whisper-cli timeout ({WHISPER_TIMEOUT}s) para audio de {duration:.1f}s"
            )

    def transcribe(
        self,
        audio_base64: str,
        format: str = "webm",
        language: str | None = "pt",
        model: str | None = None,
    ) -> TranscriptionResult:
        """
        Transcreve audio para texto via whisper.cpp CLI.

        Args:
            audio_base64: Audio codificado em base64
            format: Formato do audio (webm, wav, mp3, ogg)
            language: Codigo do idioma (pt, en, es, etc.) ou None para auto-detect
            model: ID do modelo (small, large-v3-turbo). None usa default (small).
        """
        if not self.is_loaded:
            raise RuntimeError("STT nao disponivel: whisper-cli ou modelos ausentes")

        model = model or DEFAULT_MODEL

        # Decode base64 -> arquivo temp -> WAV 16kHz
        audio_bytes = base64.b64decode(audio_base64)
        suffix = f".{format}"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            wav_path = self._convert_to_wav16k(tmp_path)
        finally:
            os.unlink(tmp_path)

        try:
            duration = self._get_duration(wav_path)
            return self._transcribe_cli(wav_path, duration, language, model)
        finally:
            if os.path.exists(wav_path):
                os.unlink(wav_path)
