"""
Synthesize Router - Endpoint /synthesize

Endpoint para sintese de texto em audio usando Piper TTS (local)
ou Chatterbox via Modal (clonagem de voz).
"""

import base64
import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from voice_ai.utils.text_preprocessor import (
    preprocess_for_tts,
    estimate_duration,
    split_into_chunks,
)
from voice_ai.schemas.tts_profiles import (
    TTSParameters,
    get_profile,
    BUILTIN_PROFILES,
    PARAM_DESCRIPTIONS,
)

router = APIRouter()

# Cache para referencia PT-BR gerada pelo Piper
_default_ptbr_ref: bytes | None = None

# Texto para gerar referencia PT-BR (cobre fonemas variados do portugues)
_PTBR_REF_TEXT = (
    "A comunicacao clara e objetiva e fundamental em qualquer contexto profissional. "
    "Quando organizamos nossas ideias de forma logica, conseguimos transmitir "
    "a mensagem com precisao e eficiencia, evitando mal-entendidos."
)


def _get_default_ptbr_ref(tts_service) -> bytes | None:
    """
    Gera (e cacheia) uma referencia PT-BR usando Piper local.
    Usada como voice_ref default para Chatterbox quando o usuario
    nao fornece amostra de voz propria.
    """
    global _default_ptbr_ref

    if _default_ptbr_ref is not None:
        return _default_ptbr_ref

    if not tts_service or not tts_service.is_available:
        return None

    try:
        ref_bytes = tts_service.synthesize(
            text=_PTBR_REF_TEXT,
            voice_id="pt-br-faber-medium",
            speed=1.0,
            output_format="wav",
        )
        _default_ptbr_ref = ref_bytes
        logger.info("Referencia PT-BR gerada: %d bytes", len(ref_bytes))
        return ref_bytes
    except Exception as e:
        logger.error("Falha ao gerar referencia PT-BR: %s", e)
        return None


class SynthesizeRequest(BaseModel):
    """Request para sintese de audio."""

    text: str = Field(..., min_length=1, max_length=10000, description="Texto para sintetizar")
    voice: str = Field(default="pt-br-faber-medium", description="ID da voz ou 'cloned' para Modal")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Velocidade (0.5-2.0, so Piper)")
    format: Literal["wav", "mp3"] = Field(default="wav", description="Formato de saida")
    preprocess: bool = Field(default=True, description="Preprocessar Markdown")
    read_code: bool = Field(default=False, description="Ler blocos de codigo")

    # Campos para clonagem de voz (Modal/Chatterbox)
    voice_ref: Optional[str] = Field(
        default=None,
        description="Audio de referencia em base64 (minimo 5s, ideal 10s)"
    )

    # Campos para configuracao TTS (Chatterbox)
    profile: Optional[str] = Field(default="standard", description="Profile pre-definido")
    params: Optional[TTSParameters] = Field(default=None, description="Parametros custom (sobrescreve profile)")


class SynthesizeInfo(BaseModel):
    """Info sobre sintese (sem audio)."""

    text_length: int
    preprocessed_length: int
    estimated_duration: float
    chunks: int
    voice: str


class ModalStatus(BaseModel):
    """Status do servico Modal."""

    enabled: bool
    available: bool
    status: str
    error: Optional[str] = None


@router.post("")
async def synthesize(request: Request, body: SynthesizeRequest) -> Response:
    """
    Sintetiza texto em audio.

    Modos:
    - voice="pt-br-*": Usa Piper TTS local (rapido, sem clonagem)
    - voice="cloned": Usa Chatterbox via Modal (GPU, com clonagem)

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

    # Decide qual servico usar
    if body.voice == "cloned":
        return await _synthesize_with_modal(request, text, body)
    else:
        return await _synthesize_with_piper(request, text, body)


async def _synthesize_with_piper(
    request: Request,
    text: str,
    body: SynthesizeRequest
) -> Response:
    """Sintetiza usando Piper TTS local."""
    tts_service = request.state.tts_service

    if not tts_service or not tts_service.is_available:
        raise HTTPException(
            status_code=503,
            detail="TTS local (Piper) nao disponivel. Verifique se piper-tts esta instalado.",
        )

    try:
        audio_bytes = tts_service.synthesize(
            text=text,
            voice_id=body.voice,
            speed=body.speed,
            output_format="wav",
        )

        content_type = "audio/wav"
        # TODO: Converter para MP3 se solicitado

        return Response(
            content=audio_bytes,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="speech.{body.format}"',
                "X-TTS-Engine": "piper",
            },
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na sintese Piper: {e}")


async def _synthesize_with_modal(
    request: Request,
    text: str,
    body: SynthesizeRequest
) -> Response:
    """Sintetiza usando Chatterbox via Modal (GPU)."""
    modal_client = request.state.modal_client

    if not modal_client or not modal_client.is_available:
        raise HTTPException(
            status_code=503,
            detail="TTS com clonagem (Modal) nao disponivel. "
                   "Verifique MODAL_ENABLED=true e credenciais.",
        )

    try:
        # Resolve parametros: custom > profile > default
        if body.params:
            params = body.params
        else:
            params = get_profile(body.profile or "standard")

        # Decodifica audio de referencia se fornecido
        voice_ref_bytes = None
        if body.voice_ref:
            try:
                voice_ref_bytes = base64.b64decode(body.voice_ref)
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail="voice_ref invalido. Deve ser audio em base64.",
                )

        # Se nao tem voice_ref do usuario, usa referencia PT-BR default
        # Sem referencia, Chatterbox usa voz default inglesa (sotaque americano)
        if voice_ref_bytes is None:
            tts_service = request.state.tts_service
            voice_ref_bytes = _get_default_ptbr_ref(tts_service)
            if voice_ref_bytes:
                logger.info("Usando referencia PT-BR default (Piper)")

        # Chama Modal com parametros
        audio_bytes = modal_client.synthesize(
            text=text,
            voice_ref_bytes=voice_ref_bytes,
            params=params,
        )

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": f'attachment; filename="speech.{body.format}"',
                "X-TTS-Engine": "modal-chatterbox",
                "X-TTS-Profile": body.profile or "standard",
            },
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na sintese Modal: {e}")


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
    """Lista vozes disponiveis (locais e Modal)."""
    tts_service = request.state.tts_service
    modal_client = request.state.modal_client

    local_voices = {}
    local_available = False
    local_default = None

    if tts_service:
        local_voices = tts_service.get_voices()
        local_available = tts_service.is_available
        local_default = tts_service.DEFAULT_VOICE

    modal_available = modal_client.is_available if modal_client else False

    return {
        "local": {
            "voices": local_voices,
            "default": local_default,
            "available": local_available,
        },
        "cloned": {
            "available": modal_available,
            "description": "Clonagem de voz via Modal/Chatterbox (requer voice_ref)",
        },
        # Retrocompatibilidade
        "voices": local_voices,
        "default": local_default,
        "available": local_available,
    }


@router.get("/modal/status")
async def modal_status(request: Request) -> ModalStatus:
    """Retorna status do servico Modal."""
    modal_client = request.state.modal_client

    if not modal_client:
        return ModalStatus(
            enabled=False,
            available=False,
            status="not_configured",
        )

    if not modal_client.is_enabled:
        return ModalStatus(
            enabled=False,
            available=False,
            status="disabled",
        )

    if not modal_client.is_available:
        return ModalStatus(
            enabled=True,
            available=False,
            status="credentials_missing",
        )

    # Tenta health check
    try:
        health = modal_client.health()
        return ModalStatus(
            enabled=True,
            available=True,
            status=health.get("status", "unknown"),
        )
    except Exception as e:
        return ModalStatus(
            enabled=True,
            available=False,
            status="error",
            error=str(e),
        )


@router.get("/profiles")
async def list_profiles() -> dict:
    """Lista profiles TTS disponiveis e descricoes dos parametros."""
    return {
        "builtin": {
            name: profile.model_dump()
            for name, profile in BUILTIN_PROFILES.items()
        },
        "default": "standard",
        "descriptions": PARAM_DESCRIPTIONS,
    }
