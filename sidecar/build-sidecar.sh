#!/bin/bash
# Script para buildar o sidecar Python com PyInstaller
# Gera executavel standalone para bundling com Tauri

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/src-tauri/binaries"

echo "[Build] Iniciando build do Voice AI Sidecar..."

# 1. Verifica ambiente Python
if ! command -v python3 &> /dev/null; then
    echo "[Erro] Python3 nao encontrado. Instale o Python 3.10+."
    exit 1
fi

# 2. Cria/ativa virtual environment
VENV_DIR="$SCRIPT_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "[Build] Criando virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# 3. Instala dependencias
echo "[Build] Instalando dependencias..."
pip install --quiet --upgrade pip
pip install --quiet -r "$SCRIPT_DIR/requirements.txt"
pip install --quiet pyinstaller

# 4. Determina target triple (necessario para Tauri)
ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

case "$ARCH" in
    x86_64)
        TARGET_ARCH="x86_64"
        ;;
    aarch64|arm64)
        TARGET_ARCH="aarch64"
        ;;
    *)
        echo "[Erro] Arquitetura nao suportada: $ARCH"
        exit 1
        ;;
esac

case "$OS" in
    linux)
        TARGET_TRIPLE="${TARGET_ARCH}-unknown-linux-gnu"
        EXE_SUFFIX=""
        ;;
    darwin)
        TARGET_TRIPLE="${TARGET_ARCH}-apple-darwin"
        EXE_SUFFIX=""
        ;;
    mingw*|msys*|cygwin*|windows*)
        TARGET_TRIPLE="${TARGET_ARCH}-pc-windows-msvc"
        EXE_SUFFIX=".exe"
        ;;
    *)
        echo "[Erro] Sistema operacional nao suportado: $OS"
        exit 1
        ;;
esac

echo "[Build] Target: $TARGET_TRIPLE"

# 5. Build com PyInstaller
echo "[Build] Executando PyInstaller..."
cd "$SCRIPT_DIR"

pyinstaller \
    --distpath "$SCRIPT_DIR/dist" \
    --workpath "$SCRIPT_DIR/build" \
    --clean \
    --noconfirm \
    "$SCRIPT_DIR/voice_ai.spec"

# 6. Copia para diretorio de binarios com target triple
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$OUTPUT_DIR/voice-ai-sidecar-${TARGET_TRIPLE}${EXE_SUFFIX}"
cp "$SCRIPT_DIR/dist/voice-ai-sidecar${EXE_SUFFIX}" "$OUTPUT_FILE"

echo "[Build] Sidecar criado: $OUTPUT_FILE"
echo "[Build] Tamanho: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo "[Build] Concluido!"

# Cleanup
deactivate 2>/dev/null || true
