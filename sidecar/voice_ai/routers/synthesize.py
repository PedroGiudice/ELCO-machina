"""
Synthesize Router - Endpoint /synthesize

Endpoint para sintese de texto em audio usando Piper TTS.
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from voice_ai.utils.text_preprocessor import (
    preprocess_for_tts,
    estimate_duration,
    split_into_chunks,
)

router = APIRouter()


class SynthesizeRequest(BaseModel):
    """Request para sintese de audio."""

    text: str = Field(..., min_length=1, max_length=10000, description="Texto para sintetizar")
    voice: str = Field(default="pt-br-faber-medium", description="ID da voz")
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
    Sintetiza texto em audio.

    Args:
        body: Texto e configuracoes

    Returns:
        Audio WAV ou MP3
    """
    tts_service = request.state.tts_service

    if not tts_service or not tts_service.is_available:
        raise HTTPException(
            status_code=503,
            detail="TTS nao disponivel. Verifique se piper-tts esta instalado.",
        )

    try:
        # Preprocessa texto se solicitado
        text = body.text
        if body.preprocess:
            text = preprocess_for_tts(text, read_code=body.read_code)

        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="Texto vazio apos preprocessamento.",
            )

        # Sintetiza
        audio_bytes = tts_service.synthesize(
            text=text,
            voice_id=body.voice,
            speed=body.speed,
            output_format="wav",
        )

        # TODO: Converter para MP3 se solicitado
        # Por enquanto, sempre retorna WAV
        content_type = "audio/wav"
        if body.format == "mp3":
            # Placeholder - implementar conversao com ffmpeg
            content_type = "audio/wav"

        return Response(
            content=audio_bytes,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="speech.{body.format}"',
            },
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na sintese: {e}")


@router.post("/info")
async def synthesize_info(request: Request, body: SynthesizeRequest) -> SynthesizeInfo:
    """
    Retorna informacoes sobre a sintese sem gerar audio.

    Util para estimar duracao e validar texto.
    """
    # Preprocessa texto
    text = body.text
    if body.preprocess:
        text = preprocess_for_tts(text, read_code=body.read_code)

    # Calcula info
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
    """Lista vozes disponiveis."""
    tts_service = request.state.tts_service

    if not tts_service:
        return {"voices": {}, "default": None, "available": False}

    return {
        "voices": tts_service.get_voices(),
        "default": tts_service.DEFAULT_VOICE,
        "available": tts_service.is_available,
    }
