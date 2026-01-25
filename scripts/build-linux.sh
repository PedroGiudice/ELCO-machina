#!/bin/bash
# Build script para Linux
set -e

echo "=== Pro ATT Machine - Build Linux ==="

# Instalar dependencias
echo "Instalando dependencias..."
bun install

# Build
echo "Gerando build..."
bun run tauri build

# Listar artefatos
echo ""
echo "=== Artefatos gerados ==="
ls -lh src-tauri/target/release/bundle/deb/*.deb 2>/dev/null || true
ls -lh src-tauri/target/release/bundle/rpm/*.rpm 2>/dev/null || true

echo ""
echo "Build concluido!"
echo ""
echo "NOTA: Para gerar artefatos de auto-update assinados, configure:"
echo "  export TAURI_SIGNING_PRIVATE_KEY=\$(cat ~/.tauri/elco-machina.key)"
echo "  E habilite createUpdaterArtifacts: true no tauri.conf.json"
