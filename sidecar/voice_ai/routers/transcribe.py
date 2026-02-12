"""
Transcribe Router - Endpoints de Speech-to-Text

POST /transcribe: Transcreve audio para texto
"""
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from voice_ai.services.refiner import GeminiRestRefiner

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
    refine: bool = Field(
        default=False,
        description="Se deve refinar texto com Gemini",
    )
    # Novos campos — o frontend envia o prompt e modelo desejados
    system_instruction: str | None = Field(
        default=None,
        description="Prompt do sistema para refinamento (estilo de output)",
    )
    model: str = Field(
        default="gemini-2.5-flash",
        description="ID do modelo Gemini para refinamento",
    )
    temperature: float = Field(
        default=0.4,
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
    model_used: str | None = Field(
        default=None,
        description="Modelo Gemini usado no refinamento",
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
    3. Se refine=true e system_instruction presente, Gemini formata o texto via REST
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

        # 2. Refina com Gemini REST se solicitado
        if body.refine and result.text and body.system_instruction:
            refiner = GeminiRestRefiner()
            refine_result = await refiner.refine(
                text=result.text,
                system_instruction=body.system_instruction,
                model=body.model,
                temperature=body.temperature,
            )

            response.refined_text = refine_result.refined_text
            response.refine_success = refine_result.success
            response.refine_error = refine_result.error
            response.model_used = refine_result.model_used
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
