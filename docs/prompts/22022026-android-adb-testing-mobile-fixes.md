# Retomada: Fix STT/TTS offline no Android + Mobile Polish

## Contexto rapido

Sessao anterior conectou ADB wireless ao Galaxy S24 via Tailscale e identificou/corrigiu bugs de layout mobile (scroll quebrado, botao coberto pela BottomNav). O sidecar Whisper (Contabo, `100.123.73.128:8765`) esta saudavel e acessivel via TCP do celular, mas o app mostra "Sidecar offline". Tres fixes foram aplicados mas o ultimo (safeFetch universal fallback) nao foi testado -- o APK esta buildado e assinado mas nao instalado (ADB desconectou).

## Arquivos principais

- `src/services/VoiceAIClient.ts` -- cliente do sidecar, `safeFetch()` com fallback
- `src/hooks/useSidecar.ts` -- hook que faz health check e define `sidecarAvailable`
- `src/components/layout/AppLayout.tsx` -- layout raiz, fix de scroll e padding
- `src-tauri/gen/android/app/build.gradle.kts` -- cleartext traffic habilitado
- `docs/contexto/22022026-android-adb-testing-mobile-fixes.md` -- contexto detalhado

## Proximos passos (por prioridade)

### 1. Instalar APK com fix do safeFetch e testar STT

**Onde:** APK ja buildado em `/home/opc/ELCO-machina/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-release-signed.apk`
**O que:** Conectar ADB ao celular e instalar. Testar se o sidecar conecta.
**Por que:** O safeFetch restritivo era a causa mais provavel do "Sidecar offline" -- tauriFetch falhava no Android com erro nao previsto e nao fazia fallback.
**Verificar:**
```bash
# Conectar ADB (pedir nova porta ao usuario)
adb pair 100.84.227.100:<pairing-port> <code>
adb connect 100.84.227.100:<connection-port>

# Instalar
adb install -r /home/opc/ELCO-machina/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-release-signed.apk

# Abrir e screenshot
adb shell am start -n com.proatt.machine/.MainActivity
adb exec-out screencap -p > /tmp/screen.png

# Verificar se sidecar conectou na tela Sistema
# STT deve mostrar Engine: Online (ou similar)
```

### 2. Se STT ainda offline: diagnosticar via console remoto

**Onde:** `src/services/VoiceAIClient.ts:23-37` (safeFetch) e `src/hooks/useSidecar.ts:61-78` (health check)
**O que:** Adicionar logging mais verboso no health check para capturar o erro exato. Injetar `console.error` no catch e verificar via `adb logcat | grep chromium`.
**Por que:** Sem log do erro real, estamos no escuro. O TCP funciona (testado com `nc`), CORS esta correto, cleartext habilitado -- algo especifico do WebView Android esta rejeitando.
**Verificar:** `adb logcat -s chromium` para ver console.log/error do WebView

### 3. Corrigir gravacao nativa (mic-recorder)

**Onde:** Plugin `tauri-plugin-mic-recorder` -- verificar se registra commands no Android
**O que:** O command `start_audio_recording` nao foi encontrado. O app faz fallback para Web API (funciona). Investigar se o plugin suporta Android.
**Por que:** Web API de gravacao funciona mas pode ter limitacoes (qualidade, background recording).
**Verificar:** Gravar audio e verificar logs -- se `Recording captured` aparece, funciona via fallback.

### 4. Commit das mudancas

**O que:** 3 arquivos modificados, nenhum commitado. Commitar quando STT funcionar.
**Arquivos:**
- `src/components/layout/AppLayout.tsx` -- fix scroll + padding
- `src/services/VoiceAIClient.ts` -- safeFetch universal
- `src-tauri/gen/android/app/build.gradle.kts` -- cleartext true

## Como verificar

```bash
# Health check do sidecar (da VM)
curl -s http://100.123.73.128:8765/health | jq .status

# Conectividade do celular para sidecar (via ADB)
adb shell "echo GET /health | nc -w 3 100.123.73.128 8765"

# Build APK (se precisar rebuildar)
cd /home/opc/ELCO-machina
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export ANDROID_HOME="/home/opc/Android/Sdk"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
bun run tauri android build --target aarch64

# Assinar APK (apksigner, NAO jarsigner)
APK_DIR="src-tauri/gen/android/app/build/outputs/apk/universal/release"
zipalign -f -p 4 "$APK_DIR/app-universal-release-unsigned.apk" "$APK_DIR/app-aligned.apk"
apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android \
  --ks-key-alias androiddebugkey --key-pass pass:android \
  --out "$APK_DIR/app-release-signed.apk" "$APK_DIR/app-aligned.apk"
```

## Nota sobre ADB via Tailscale

O ADB wireless debugging funciona via Tailscale mas a sessao expira frequentemente. Cada reconexao requer:
1. No celular: Opcoes de desenvolvedor > Depuracao sem fio > Parear dispositivo
2. Pegar IP Tailscale (100.84.227.100), porta de pareamento, e codigo de 6 digitos
3. `adb pair 100.84.227.100:<pair-port> <code>`
4. Porta de CONEXAO e diferente da de pareamento -- pegar na tela principal de "Depuracao sem fio"
5. `adb connect 100.84.227.100:<conn-port>`

**NAO usar `adb shell input tap`** -- causa travamento de touch no app.
