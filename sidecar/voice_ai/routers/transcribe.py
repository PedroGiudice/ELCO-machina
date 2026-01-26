"""
Transcribe Router - Endpoints de Speech-to-Text

POST /transcribe: Transcreve audio para texto
"""
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from voice_ai.services.refiner import OutputStyle, get_refiner


router = APIRouter()


class TranscribeRequest(BaseModel):
    """Request body para transcricao."""

    audio: str = Field(
        ...,
        description="Audio codificado em base64",
    )
    format: Literal["webm", "wav", "mp3", "ogg", "m4a"] = Field(
        default="webm",
        description="Formato do audio",
    )
    language: str | None = Field(
        default="pt",
        description="Codigo do idioma (pt, en, es) ou null para auto-detect",
    )
    refine: bool = Field(
        default=False,
        description="Se deve refinar texto com Gemini",
    )
    style: OutputStyle = Field(
        default="verbatim",
        description="Estilo de output para refinamento",
    )


class TranscriptionSegment(BaseModel):
    """Segmento individual de transcricao."""

    start: float
    end: float
    text: str
    confidence: float


class TranscribeResponse(BaseModel):
    """Response da transcricao."""

    # Texto transcrito (bruto do Whisper)
    text: str = Field(
        ...,
        description="Texto transcrito pelo Whisper",
    )

    # Texto refinado (se refine=true)
    refined_text: str | None = Field(
        default=None,
        description="Texto refinado pelo Gemini (se solicitado)",
    )

    # Metadados
    language: str = Field(
        ...,
        description="Idioma detectado ou especificado",
    )
    confidence: float = Field(
        ...,
        description="Confianca media da transcricao (0-1)",
    )
    duration: float = Field(
        ...,
        description="Duracao do audio em segundos",
    )

    # Segmentos detalhados
    segments: list[TranscriptionSegment] = Field(
        default_factory=list,
        description="Segmentos individuais com timestamps",
    )

    # Status do refinamento
    refine_success: bool | None = Field(
        default=None,
        description="Se refinamento foi bem sucedido",
    )
    refine_error: str | None = Field(
        default=None,
        description="Erro do refinamento, se houver",
    )


@router.post("", response_model=TranscribeResponse)
async def transcribe_audio(
    request: Request,
    body: TranscribeRequest,
) -> TranscribeResponse:
    """
    Transcreve audio para texto usando Whisper local.

    Fluxo:
    1. Audio chega como base64
    2. Whisper transcreve localmente (2-5 segundos)
    3. Se refine=true, Gemini formata o texto
    4. Retorna texto bruto + refinado

    Args:
        body: Dados da requisicao (audio base64, formato, idioma, opcoes)

    Returns:
        Transcricao com texto bruto, refinado (opcional) e metadados
    """
    # Obtem servico STT injetado
    stt_service = getattr(request.state, "stt_service", None)

    if not stt_service:
        raise HTTPException(
            status_code=503,
            detail="Servico STT nao disponivel",
        )

    try:
        # 1. Transcreve com Whisper
        result = stt_service.transcribe(
            audio_base64=body.audio,
            format=body.format,
            language=body.language,
        )

        # Prepara resposta base
        response = TranscribeResponse(
            text=result.text,
            language=result.language,
            confidence=result.confidence,
            duration=result.duration,
            segments=[
                TranscriptionSegment(
                    start=s["start"],
                    end=s["end"],
                    text=s["text"],
                    confidence=s["confidence"],
                )
                for s in result.segments
            ],
        )

        # 2. Refina com Gemini se solicitado
        if body.refine and result.text:
            refiner = get_refiner()
            refine_result = refiner.refine(
                text=result.text,
                style=body.style,
            )

            response.refined_text = refine_result.refined_text
            response.refine_success = refine_result.success
            response.refine_error = refine_result.error

        return response

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro na transcricao: {str(e)}",
        )
