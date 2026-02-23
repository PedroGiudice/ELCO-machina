"""
Transcribe Router - Endpoints de Speech-to-Text

POST /transcribe: Transcreve audio para texto
"""
import asyncio
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from voice_ai.services.refiner import ClaudeRefiner

logger = logging.getLogger(__name__)

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
    stt_model: str | None = Field(
        default=None,
        description="Modelo Whisper (large-v3-turbo, small). None usa default do server.",
    )
    refine: bool = Field(
        default=False,
        description="Se deve refinar texto com Claude CLI",
    )
    system_instruction: str | None = Field(
        default=None,
        description="Prompt do sistema para refinamento (estilo de output)",
    )
    model: str | None = Field(
        default=None,
        description="Modelo para refinamento. None usa default do backend ativo.",
    )
    temperature: float = Field(
        default=0.3,
        ge=0.0,
        le=2.0,
        description="Temperatura de geracao para refinamento (0.0 - 2.0)",
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
        description="Texto refinado pelo Claude CLI",
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
    model_used: str | None = Field(
        default=None,
        description="Modelo usado no refinamento",
    )
    refine_backend: str | None = Field(
        default=None,
        description="Backend usado (claude)",
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
    3. Se refine=true e system_instruction presente, Claude CLI refina o texto
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
        # 1. Transcreve com Whisper (CPU-bound, roda em thread separada
        #    para nao bloquear o event loop durante inferencia ~2-5s)
        result = await asyncio.to_thread(
            stt_service.transcribe,
            audio_base64=body.audio,
            format=body.format,
            language=body.language,
            model=body.stt_model,
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

        # 2. Refina com Claude CLI se solicitado
        if body.refine and result.text and body.system_instruction:
            refiner = ClaudeRefiner()
            refine_result = await refiner.refine(
                text=result.text,
                system_instruction=body.system_instruction,
                model=body.model or "sonnet",
            )
            response.refined_text = refine_result.refined_text
            response.refine_success = refine_result.success
            response.refine_error = refine_result.error
            response.model_used = refine_result.model_used
            response.refine_backend = "claude"
        elif body.refine and result.text and not body.system_instruction:
            logger.warning(
                "Refinamento solicitado mas system_instruction ausente. "
                "Retornando texto bruto."
            )

        return response

    except Exception as e:
        logger.error("Erro na transcricao: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Erro na transcricao: {str(e)}",
        )


@router.get("/models")
async def list_stt_models(request: Request) -> dict:
    """Lista modelos STT disponiveis e seus status (warm/cold)."""
    stt_service = getattr(request.state, "stt_service", None)

    if not stt_service:
        return {"models": [], "default": None}

    return {
        "models": stt_service.available_models,
        "default": stt_service.model_size,
    }
