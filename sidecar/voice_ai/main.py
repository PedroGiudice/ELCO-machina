"""
Voice AI Sidecar - FastAPI Entry Point

Sistema de processamento de voz local-first com refinamento cloud opcional.
Filosofia: "Whisper transcreve, Gemini refina. Privacidade e qualidade."
"""
import logging
import os
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configura logging estruturado para todo o sidecar
from voice_ai.routers import transcribe, synthesize
from voice_ai.services.stt_service import STTService
from voice_ai.services.tts_service import TTSService
from voice_ai.services.tts_modal_client import TTSModalClient

# Configura logging estruturado para todo o sidecar
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# Estado global do aplicativo
class AppState:
    stt_service: STTService | None = None
    tts_service: TTSService | None = None
    modal_client: TTSModalClient | None = None
    models_loaded: bool = False
    startup_error: str | None = None


state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gerencia o ciclo de vida do aplicativo.
    Carrega modelos no startup, libera recursos no shutdown.
    """
    # Startup
    logger.info("Iniciando sidecar...")

    try:
        # Inicializa STT Service (Whisper)
        # Modelo sera carregado lazy na primeira requisicao
        state.stt_service = STTService()

        # Inicializa TTS Service (Piper)
        # Voz sera carregada lazy na primeira requisicao
        state.tts_service = TTSService()
        if state.tts_service.is_available:
            logger.info("TTS (Piper) disponivel")
        else:
            logger.info("TTS (Piper) nao instalado - sintese local desabilitada")

        # Inicializa Modal Client (Chatterbox - clonagem de voz)
        state.modal_client = TTSModalClient()
        if state.modal_client.is_available:
            logger.info("TTS (Modal/Chatterbox) disponivel")
        elif state.modal_client.is_enabled:
            logger.warning("TTS (Modal) habilitado mas credenciais ausentes")
        else:
            logger.info("TTS (Modal) desabilitado (MODAL_ENABLED=false)")

        state.models_loaded = True
        logger.info("Sidecar pronto!")
    except Exception as e:
        state.startup_error = str(e)
        logger.error("Erro no startup: %s", e)

    yield

    # Shutdown
    logger.info("Encerrando sidecar...")
    if state.stt_service:
        state.stt_service.unload()
    if state.tts_service:
        state.tts_service.unload()
    logger.info("Sidecar encerrado.")


# Cria aplicacao FastAPI
app = FastAPI(
    title="Voice AI Sidecar",
    description="STT (Whisper) e TTS (Piper) local com refinamento opcional via Gemini",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS - apenas origens do frontend Tauri e dev server
ALLOWED_ORIGINS = [
    "tauri://localhost",        # Tauri desktop (Linux/Windows/macOS)
    "https://tauri.localhost",  # Tauri mobile (Android/iOS)
    "http://localhost",
    "http://localhost:3000",    # Vite dev server
    "https://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Schemas de resposta tipados para /health
class WhisperModelStatus(BaseModel):
    status: Literal["loaded", "available", "not_loaded"]
    model: str | None = None


class PiperModelStatus(BaseModel):
    status: Literal["loaded", "available", "not_installed", "not_available"]
    voice: str | None = None


class ModalModelStatus(BaseModel):
    status: Literal["available", "credentials_missing", "disabled"]
    engine: str = "chatterbox"


class ModelsStatus(BaseModel):
    whisper: WhisperModelStatus
    piper: PiperModelStatus
    modal: ModalModelStatus


class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded"]
    version: str
    models: ModelsStatus
    error: str | None = None


# Endpoints da raiz
@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Verifica status do sidecar e modelos carregados.

    Retorna:
        - status: "healthy" ou "degraded"
        - version: versao do sidecar
        - models: status de cada modelo (whisper, xtts)
        - error: mensagem de erro se houver
    """
    whisper_status = "not_loaded"
    whisper_model = None

    if state.stt_service:
        if state.stt_service.is_loaded:
            whisper_status = "loaded"
            whisper_model = state.stt_service.model_size
        else:
            whisper_status = "available"
            whisper_model = state.stt_service.model_size

    # Status do TTS (Piper)
    piper_status = "not_available"
    piper_voice = None

    if state.tts_service:
        if state.tts_service.is_available:
            if state.tts_service.is_loaded:
                piper_status = "loaded"
                piper_voice = state.tts_service._current_voice_id
            else:
                piper_status = "available"
        else:
            piper_status = "not_installed"

    # Status do Modal (Chatterbox)
    modal_status = "disabled"
    if state.modal_client:
        if state.modal_client.is_available:
            modal_status = "available"
        elif state.modal_client.is_enabled:
            modal_status = "credentials_missing"

    return HealthResponse(
        status="healthy" if state.models_loaded else "degraded",
        version="0.2.0",
        models=ModelsStatus(
            whisper=WhisperModelStatus(
                status=whisper_status,
                model=whisper_model,
            ),
            piper=PiperModelStatus(
                status=piper_status,
                voice=piper_voice,
            ),
            modal=ModalModelStatus(
                status=modal_status,
            ),
        ),
        error=state.startup_error,
    )


@app.get("/")
async def root():
    """Endpoint raiz com informacoes basicas."""
    return {
        "name": "Voice AI Sidecar",
        "version": "0.2.0",
        "docs": "/docs",
        "endpoints": {
            "stt": "/transcribe",
            "tts": "/synthesize",
        },
    }


# Registra routers
app.include_router(transcribe.router, prefix="/transcribe", tags=["STT"])
app.include_router(synthesize.router, prefix="/synthesize", tags=["TTS"])


# Injeta servicos nos routers
@app.middleware("http")
async def inject_services(request, call_next):
    """Injeta servicos no request state para uso nos endpoints."""
    request.state.stt_service = state.stt_service
    request.state.tts_service = state.tts_service
    request.state.modal_client = state.modal_client
    response = await call_next(request)
    return response


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("VOICE_AI_HOST", "127.0.0.1")
    port = int(os.environ.get("VOICE_AI_PORT", "8765"))
    uvicorn.run(app, host=host, port=port, log_level="info")
