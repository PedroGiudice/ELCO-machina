#!/bin/bash
# publish-android-update.sh - Publica APK no servidor de updates self-hosted
#
# Uso: ./scripts/publish-android-update.sh
#
# Pre-requisitos:
#   - APK debug compilado (bun run tauri android build --debug --target aarch64)
#   - nginx rodando na porta 8090
#   - Diretorio /var/www/updates/proatt/ existente
#
# O que faz:
#   1. Le a versao do tauri.conf.json
#   2. Copia APK para /var/www/updates/proatt/
#   3. Gera latest-android.json com versao e URL
#   4. Corrige contexto SELinux (Oracle Linux)
#   5. Verifica que o servidor esta respondendo

set -euo pipefail

PROJECT_DIR="/home/opc/ELCO-machina"
UPDATES_DIR="/var/www/updates/proatt"
APK_SOURCE="$PROJECT_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
TAILSCALE_IP="100.114.203.28"
PORT="8090"

# Ler versao do tauri.conf.json
VERSION=$(python3 -c "import json; print(json.load(open('$PROJECT_DIR/src-tauri/tauri.conf.json'))['version'])")
echo "[INFO] Versao detectada: $VERSION"

# Verificar se APK existe
if [ ! -f "$APK_SOURCE" ]; then
    echo "[FALHA] APK nao encontrado: $APK_SOURCE"
    echo "Execute primeiro: bun run tauri android build --debug --target aarch64"
    exit 1
fi

APK_SIZE=$(du -h "$APK_SOURCE" | cut -f1)
echo "[INFO] APK encontrado: $APK_SIZE"

# Nome do APK no servidor (com versao para cache-busting)
APK_FILENAME="pro-att-machine_${VERSION}_arm64.apk"
APK_URL="http://${TAILSCALE_IP}:${PORT}/proatt/${APK_FILENAME}"

# Timestamp ISO 8601
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Copiar APK
echo "[INFO] Copiando APK para $UPDATES_DIR..."
cp "$APK_SOURCE" "$UPDATES_DIR/$APK_FILENAME"

# Gerar latest-android.json
cat > "$UPDATES_DIR/latest-android.json" << HEREDOC
{
  "version": "$VERSION",
  "notes": "Pro ATT Machine v$VERSION",
  "pub_date": "$PUB_DATE",
  "url": "$APK_URL"
}
HEREDOC

echo "[INFO] latest-android.json gerado"

# Corrigir SELinux (Oracle Linux)
if command -v chcon &>/dev/null; then
    sudo chcon -R -t httpd_sys_content_t "$UPDATES_DIR/" 2>/dev/null || true
    echo "[INFO] Contexto SELinux corrigido"
fi

# Verificar servidor
echo "[INFO] Verificando servidor..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/proatt/latest-android.json")
if [ "$HTTP_CODE" = "200" ]; then
    SERVED_VERSION=$(curl -s "http://localhost:${PORT}/proatt/latest-android.json" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])")
    echo "[CONCLUIDO] Android v$SERVED_VERSION publicada em http://${TAILSCALE_IP}:${PORT}/proatt/latest-android.json"
    echo "[INFO] APK disponivel em: $APK_URL"
else
    echo "[FALHA] Servidor retornou HTTP $HTTP_CODE"
    exit 1
fi
