#!/bin/bash
# Script para iniciar o sidecar Voice AI
# Uso: ./start_sidecar.sh [--background]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Carrega variaveis de ambiente do .env se existir
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Fallbacks caso .env nao tenha as variaveis
export VOICE_AI_HOST="${VOICE_AI_HOST:-0.0.0.0}"
export VOICE_AI_PORT="${VOICE_AI_PORT:-8765}"

# Ativa venv
source .venv/bin/activate

# Inicia servidor
if [ "$1" = "--background" ]; then
    nohup python -m uvicorn voice_ai.main:app \
        --host "$VOICE_AI_HOST" \
        --port "$VOICE_AI_PORT" \
        > /tmp/sidecar.log 2>&1 &
    echo "Sidecar iniciado em background (PID: $!)"
    echo "Logs: /tmp/sidecar.log"
else
    exec python -m uvicorn voice_ai.main:app \
        --host "$VOICE_AI_HOST" \
        --port "$VOICE_AI_PORT"
fi
