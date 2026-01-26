#!/bin/bash
# Script para rodar o sidecar em modo desenvolvimento
# Usa uvicorn com hot-reload

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[Dev] Iniciando Voice AI Sidecar em modo desenvolvimento..."

# 1. Verifica/cria virtual environment
VENV_DIR="$SCRIPT_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "[Dev] Criando virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# 2. Instala dependencias se necessario
if [ ! -f "$VENV_DIR/.deps-installed" ]; then
    echo "[Dev] Instalando dependencias..."
    pip install --quiet --upgrade pip
    pip install --quiet -r "$SCRIPT_DIR/requirements.txt"
    touch "$VENV_DIR/.deps-installed"
fi

# 3. Define porta (default 8765)
PORT="${VOICE_AI_PORT:-8765}"

# 4. Inicia servidor
echo "[Dev] Servidor iniciando em http://localhost:$PORT"
echo "[Dev] Docs: http://localhost:$PORT/docs"
echo "[Dev] Ctrl+C para parar"
echo ""

cd "$SCRIPT_DIR"
uvicorn voice_ai.main:app --host 127.0.0.1 --port "$PORT" --reload
