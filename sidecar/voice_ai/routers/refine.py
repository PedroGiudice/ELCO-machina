"""
Refine Router - Endpoint de refinamento de texto via Claude CLI

POST /refine: Refina texto usando Claude CLI headless
"""
import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from voice_ai.services.refiner import ClaudeRefiner

logger = logging.getLogger(__name__)

router = APIRouter()

refiner = ClaudeRefiner()


class RefineRequest(BaseModel):
    """Request body para refinamento."""

    text: str = Field(..., description="Texto a refinar")
    system_instruction: str = Field(..., description="System prompt para o Claude")
    model: str = Field(default="sonnet", description="Modelo Claude")
    temperature: float | None = Field(default=None, description="Temperatura (0.0-2.0)")


class RefineResponse(BaseModel):
    """Response do refinamento."""

    refined_text: str
    success: bool
    model_used: str
    error: str | None = None


@router.post("", response_model=RefineResponse)
async def refine_text(req: RefineRequest) -> RefineResponse:
    """Refina texto usando Claude CLI."""
    if not req.text.strip():
        return RefineResponse(
            refined_text="",
            success=False,
            model_used=req.model,
            error="Texto vazio",
        )

    result = await refiner.refine(
        text=req.text,
        system_instruction=req.system_instruction,
        model=req.model,
    )

    return RefineResponse(
        refined_text=result.refined_text,
        success=result.success,
        model_used=result.model_used,
        error=result.error,
    )
