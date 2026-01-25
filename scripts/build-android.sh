#!/bin/bash
# Build script para Android
set -e

echo "=== Pro ATT Machine - Build Android ==="

# Verificar ANDROID_HOME
if [ -z "$ANDROID_HOME" ]; then
    echo "Erro: ANDROID_HOME nao configurado"
    echo "Configure com: export ANDROID_HOME=~/Android/Sdk"
    exit 1
fi

# Instalar dependencias
echo "Instalando dependencias..."
bun install

# Build Android release
echo "Gerando APK release..."
bun run tauri android build

# Listar artefatos
echo ""
echo "=== APKs gerados ==="
find src-tauri/gen/android -name "*.apk" 2>/dev/null

echo ""
echo "Build concluido!"
echo ""
echo "NOTA: O APK release esta unsigned. Para assinar:"
echo "  1. Gere uma keystore: keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias"
echo "  2. Assine o APK: apksigner sign --ks my-release-key.jks --out app-signed.apk app-universal-release-unsigned.apk"
echo ""
echo "Para instalar no dispositivo conectado via ADB:"
echo "  adb install src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
