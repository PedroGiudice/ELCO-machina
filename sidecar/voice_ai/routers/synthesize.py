"""
Synthesize Router - Endpoint /synthesize

Endpoint para sintese de texto em audio usando Kokoro TTS (local).
Clonagem de voz (XTTS v2) e feita diretamente pelo frontend via Modal.
"""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from voice_ai.utils.text_preprocessor import (
    preprocess_for_tts,
    estimate_duration,
    split_into_chunks,
)

router = APIRouter()


class SynthesizeRequest(BaseModel):
    """Request para sintese de audio local (Kokoro)."""

    text: str = Field(..., min_length=1, max_length=10000, description="Texto para sintetizar")
    voice: str = Field(default="pf_dora", description="Nome da voz (pf_dora, pm_santa)")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Velocidade (0.5-2.0)")
    format: Literal["wav", "mp3"] = Field(default="wav", description="Formato de saida")
    preprocess: bool = Field(default=True, description="Preprocessar Markdown")
    read_code: bool = Field(default=False, description="Ler blocos de codigo")


class SynthesizeInfo(BaseModel):
    """Info sobre sintese (sem audio)."""

    text_length: int
    preprocessed_length: int
    estimated_duration: float
    chunks: int
    voice: str


@router.post("")
async def synthesize(request: Request, body: SynthesizeRequest) -> Response:
    """
    Sintetiza texto em audio usando Kokoro TTS local.

    Para clonagem de voz (XTTS v2), o frontend chama o endpoint Modal diretamente.

    Args:
        body: Texto e configuracoes

    Returns:
        Audio WAV ou MP3
    """
    # Preprocessa texto se solicitado
    text = body.text
    if body.preprocess:
        text = preprocess_for_tts(text, read_code=body.read_code)

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="Texto vazio apos preprocessamento.",
        )

    return await _synthesize_with_kokoro(request, text, body)


async def _synthesize_with_kokoro(
    request: Request,
    text: str,
    body: SynthesizeRequest
) -> Response:
    """Sintetiza usando Kokoro TTS local."""
    tts_service = request.state.tts_service

    if not tts_service or not tts_service.is_available:
        raise HTTPException(
            status_code=503,
            detail="TTS local (Kokoro) nao disponivel. Verifique se kokoro esta instalado.",
        )

    try:
        audio_bytes = tts_service.synthesize(
            text=text,
            voice=body.voice,
            speed=body.speed,
            output_format="wav",
        )

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": f'attachment; filename="speech.{body.format}"',
                "X-TTS-Engine": "kokoro",
            },
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na sintese Kokoro: {e}")


@router.post("/info")
async def synthesize_info(request: Request, body: SynthesizeRequest) -> SynthesizeInfo:
    """
    Retorna informacoes sobre a sintese sem gerar audio.

    Util para estimar duracao e validar texto.
    """
    text = body.text
    if body.preprocess:
        text = preprocess_for_tts(text, read_code=body.read_code)

    chunks = split_into_chunks(text)
    duration = estimate_duration(text)

    return SynthesizeInfo(
        text_length=len(body.text),
        preprocessed_length=len(text),
        estimated_duration=duration,
        chunks=len(chunks),
        voice=body.voice,
    )


@router.get("/voices")
async def list_voices(request: Request) -> dict:
    """Lista vozes disponiveis (locais)."""
    tts_service = request.state.tts_service

    local_voices = {}
    local_available = False
    local_default = None

    if tts_service:
        local_voices = tts_service.get_voices()
        local_available = tts_service.is_available
        local_default = tts_service.DEFAULT_VOICE

    return {
        "local": {
            "voices": local_voices,
            "default": local_default,
            "available": local_available,
        },
        # Retrocompatibilidade
        "voices": local_voices,
        "default": local_default,
        "available": local_available,
    }
