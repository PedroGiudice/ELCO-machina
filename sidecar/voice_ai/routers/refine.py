"""
Refine Router - Endpoint /refine

POST /refine: Refina texto usando Claude CLI (independente do STT).
Permite refinar texto ja transcrito sem re-transcrever.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from voice_ai.services.refiner import ClaudeRefiner

logger = logging.getLogger(__name__)

router = APIRouter()


class RefineRequest(BaseModel):
    """Request para refinamento de texto."""

    text: str = Field(
        ...,
        min_length=1,
        description="Texto para refinar",
    )
    system_instruction: str = Field(
        ...,
        min_length=1,
        description="Prompt do sistema (estilo de output)",
    )
    model: str = Field(
        default="sonnet",
        description="Modelo Claude (sonnet, opus, haiku)",
    )
    temperature: float = Field(
        default=0.3,
        ge=0.0,
        le=2.0,
        description="Temperatura de geracao (0.0 - 2.0)",
    )


class RefineResponse(BaseModel):
    """Response do refinamento."""

    refined_text: str = Field(
        ...,
        description="Texto refinado",
    )
    success: bool = Field(
        ...,
        description="Se refinamento foi bem sucedido",
    )
    model_used: str = Field(
        ...,
        description="Modelo usado no refinamento",
    )
    error: str | None = Field(
        default=None,
        description="Erro do refinamento, se houver",
    )


@router.post("", response_model=RefineResponse)
async def refine_text(body: RefineRequest) -> RefineResponse:
    """
    Refina texto usando Claude CLI.

    Endpoint independente do STT. Recebe texto bruto e retorna refinado.
    Permite usar o refiner isoladamente (ex: texto ja transcrito, copiado, etc).
    """
    try:
        refiner = ClaudeRefiner()
        result = await refiner.refine(
            text=body.text,
            system_instruction=body.system_instruction,
            model=body.model,
        )

        return RefineResponse(
            refined_text=result.refined_text,
            success=result.success,
            model_used=result.model_used,
            error=result.error,
        )

    except Exception as e:
        logger.error("Erro no refinamento: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Erro no refinamento: {str(e)}",
        )
