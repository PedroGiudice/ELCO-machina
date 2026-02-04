"""
Voice AI Sidecar - FastAPI Entry Point

Sistema de processamento de voz local-first com refinamento cloud opcional.
Filosofia: "Whisper transcreve, Gemini refina. Privacidade e qualidade."
"""
import os
import sys
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from voice_ai.routers import transcribe, synthesize
from voice_ai.services.stt_service import STTService
from voice_ai.services.tts_service import TTSService


# Estado global do aplicativo
class AppState:
    stt_service: STTService | None = None
    tts_service: TTSService | None = None
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
    print("[VoiceAI] Iniciando sidecar...")

    try:
        # Inicializa STT Service (Whisper)
        # Modelo sera carregado lazy na primeira requisicao
        state.stt_service = STTService()

        # Inicializa TTS Service (Piper)
        # Voz sera carregada lazy na primeira requisicao
        state.tts_service = TTSService()
        if state.tts_service.is_available:
            print("[VoiceAI] TTS (Piper) disponivel")
        else:
            print("[VoiceAI] TTS (Piper) nao instalado - sintese desabilitada")

        state.models_loaded = True
        print("[VoiceAI] Sidecar pronto!")
    except Exception as e:
        state.startup_error = str(e)
        print(f"[VoiceAI] Erro no startup: {e}", file=sys.stderr)

    yield

    # Shutdown
    print("[VoiceAI] Encerrando sidecar...")
    if state.stt_service:
        state.stt_service.unload()
    if state.tts_service:
        state.tts_service.unload()
    print("[VoiceAI] Sidecar encerrado.")


# Cria aplicacao FastAPI
app = FastAPI(
    title="Voice AI Sidecar",
    description="STT (Whisper) e TTS (Piper) local com refinamento opcional via Gemini",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS - permite requisicoes do frontend Tauri
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tauri usa tauri://localhost ou http://localhost
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Schemas de resposta
class HealthResponse(BaseModel):
    status: str
    version: str
    models: dict[str, Any]
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

    return HealthResponse(
        status="healthy" if state.models_loaded else "degraded",
        version="0.2.0",
        models={
            "whisper": {
                "status": whisper_status,
                "model": whisper_model,
            },
            "piper": {
                "status": piper_status,
                "voice": piper_voice,
            },
        },
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
    response = await call_next(request)
    return response


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("VOICE_AI_HOST", "127.0.0.1")
    port = int(os.environ.get("VOICE_AI_PORT", "8765"))
    uvicorn.run(app, host=host, port=port, log_level="info")
