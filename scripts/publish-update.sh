#!/bin/bash
# publish-update.sh - Publica nova versão no servidor de updates self-hosted
#
# Uso: ./scripts/publish-update.sh
#
# Pré-requisitos:
#   - Build concluído com sucesso (bun run tauri build)
#   - nginx rodando na porta 8090
#   - Diretório /var/www/updates/ existente e acessível
#
# O que faz:
#   1. Lê a versão do tauri.conf.json
#   2. Copia AppImage + assinatura para /var/www/updates/
#   3. Gera latest.json com a versão, assinatura e URL corretas
#   4. Corrige contexto SELinux (Oracle Linux)
#   5. Verifica que o servidor está respondendo

set -euo pipefail

PROJECT_DIR="/home/opc/ELCO-machina"
UPDATES_DIR="/var/www/updates"
BUNDLE_DIR="$PROJECT_DIR/src-tauri/target/release/bundle"
TAILSCALE_IP="100.114.203.28"
PORT="8090"

# Ler versao do tauri.conf.json
VERSION=$(python3 -c "import json; print(json.load(open('$PROJECT_DIR/src-tauri/tauri.conf.json'))['version'])")
echo "[INFO] Versao detectada: $VERSION"

# Caminhos dos artefatos
APPIMAGE="$BUNDLE_DIR/appimage/Pro ATT Machine_${VERSION}_amd64.AppImage"
APPIMAGE_SIG="$APPIMAGE.sig"

# Verificar se artefatos existem
if [ ! -f "$APPIMAGE" ]; then
    echo "[FALHA] AppImage nao encontrado: $APPIMAGE"
    echo "Execute primeiro: bun run tauri build"
    exit 1
fi

if [ ! -f "$APPIMAGE_SIG" ]; then
    echo "[FALHA] Assinatura nao encontrada: $APPIMAGE_SIG"
    echo "Verifique TAURI_SIGNING_PRIVATE_KEY e TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
    exit 1
fi

# Ler assinatura
SIGNATURE=$(cat "$APPIMAGE_SIG")
echo "[INFO] Assinatura lida (${#SIGNATURE} bytes)"

# Timestamp ISO 8601
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# URL do AppImage (com %20 para espacos)
FILENAME="Pro%20ATT%20Machine_${VERSION}_amd64.AppImage"
URL="http://${TAILSCALE_IP}:${PORT}/${FILENAME}"

# Corrigir compatibilidade cross-distro (OL10 -> Ubuntu)
# libgcrypt.so.20 do OL10 precisa de libgpg-error.so.0 do OL10
echo "[INFO] Corrigindo AppImage para compatibilidade cross-distro..."
TMPDIR=$(mktemp -d)
cd "$TMPDIR"
APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGE" --appimage-extract >/dev/null 2>&1
cp /lib64/libgpg-error.so.0 squashfs-root/usr/lib/
APPIMAGETOOL_DIR=$(mktemp -d)
cd "$APPIMAGETOOL_DIR"
APPIMAGE_EXTRACT_AND_RUN=1 ~/.cache/tauri/linuxdeploy-plugin-appimage.AppImage --appimage-extract >/dev/null 2>&1
FIXED_APPIMAGE="$TMPDIR/Pro ATT Machine_${VERSION}_amd64.AppImage"
ARCH=x86_64 NO_STRIP=true "$APPIMAGETOOL_DIR/squashfs-root/usr/bin/appimagetool" "$TMPDIR/squashfs-root" "$FIXED_APPIMAGE" >/dev/null 2>&1
cd "$PROJECT_DIR"

# Re-assinar o AppImage corrigido
echo "[INFO] Re-assinando AppImage..."
TAURI_SIGNING_PRIVATE_KEY="${TAURI_SIGNING_PRIVATE_KEY:-$(cat ~/.tauri/proatt.key 2>/dev/null)}"
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-x}"
bun run tauri signer sign "$FIXED_APPIMAGE" -k "$TAURI_SIGNING_PRIVATE_KEY" -p "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" >/dev/null 2>&1
APPIMAGE="$FIXED_APPIMAGE"
APPIMAGE_SIG="$FIXED_APPIMAGE.sig"

# Ler assinatura atualizada
SIGNATURE=$(cat "$APPIMAGE_SIG")
echo "[INFO] Assinatura atualizada (${#SIGNATURE} bytes)"

# Copiar artefatos
echo "[INFO] Copiando artefatos para $UPDATES_DIR..."
cp "$APPIMAGE" "$UPDATES_DIR/Pro ATT Machine_${VERSION}_amd64.AppImage"
cp "$APPIMAGE_SIG" "$UPDATES_DIR/Pro ATT Machine_${VERSION}_amd64.AppImage.sig"

# Limpar temporários
rm -rf "$TMPDIR" "$APPIMAGETOOL_DIR"

# Gerar latest.json
cat > "$UPDATES_DIR/latest.json" << HEREDOC
{
  "version": "$VERSION",
  "notes": "Pro ATT Machine v$VERSION",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "linux-x86_64": {
      "signature": "$SIGNATURE",
      "url": "$URL"
    }
  }
}
HEREDOC

echo "[INFO] latest.json gerado"

# Corrigir SELinux (Oracle Linux)
if command -v chcon &>/dev/null; then
    sudo chcon -R -t httpd_sys_content_t "$UPDATES_DIR/" 2>/dev/null || true
    echo "[INFO] Contexto SELinux corrigido"
fi

# Verificar servidor
echo "[INFO] Verificando servidor..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/latest.json")
if [ "$HTTP_CODE" = "200" ]; then
    SERVED_VERSION=$(curl -s "http://localhost:${PORT}/latest.json" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])")
    echo "[CONCLUIDO] Versao $SERVED_VERSION publicada em http://${TAILSCALE_IP}:${PORT}/latest.json"
else
    echo "[FALHA] Servidor retornou HTTP $HTTP_CODE"
    exit 1
fi
