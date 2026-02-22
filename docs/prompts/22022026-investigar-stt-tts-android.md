# Retomada: Investigar STT/TTS offline no Android e corrigir

## Contexto rapido

O app ELCO-machina (Tauri + Android) foi instalado no Galaxy S24 via ADB over Tailscale. Corrigimos scroll quebrado, botao coberto pela BottomNav, e habilitamos cleartext HTTP no release build. Tambem tornamos o `safeFetch` mais resiliente (fallback universal para fetch nativo).

Apesar disso, o sidecar Whisper (FastAPI rodando na Contabo, `100.123.73.128:8765`) aparece como **"Sidecar offline"** no app Android. O sidecar esta saudavel (`curl` da VM retorna healthy) e o celular tem conectividade TCP confirmada (`nc` via ADB conecta na porta 8765). O ultimo APK com o fix do safeFetch foi **buildado e assinado mas NAO instalado** (ADB desconectou). E possivel que o fix ja resolva -- mas se nao, precisa de diagnostico mais profundo.

Erros observados nos logs do app:
- `Whisper indisponivel (Tailscale desconectado ou sidecar offline)`
- `Erro ao iniciar gravacao nativa: Command start_audio_recording not found` (fallback Web API funcionou)

## Arquivos principais

- `src/services/VoiceAIClient.ts` -- cliente HTTP do sidecar, `safeFetch()` (linhas 23-34), `health()` (linha 131)
- `src/hooks/useSidecar.ts` -- health check no mount (linhas 61-78), define `sidecarAvailable`
- `src/hooks/useAudioProcessing.ts` -- usa `sidecarAvailable` para decidir se transcreve (linha 117)
- `src/hooks/useTTS.ts` -- hook de TTS, mesma logica de conexao com sidecar
- `src-tauri/gen/android/app/build.gradle.kts` -- `usesCleartextTraffic=true` (ja aplicado)
- `sidecar/voice_ai/main.py` -- CORS middleware (linhas 100-114), ALLOWED_ORIGINS inclui `https://tauri.localhost`
- `docs/contexto/22022026-android-adb-testing-mobile-fixes.md` -- contexto completo da sessao anterior

## Proximos passos (por prioridade)

### 1. Conectar ADB e instalar o APK com safeFetch universal
**Onde:** APK pronto em `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-release-signed.apk`
**O que:** Parear ADB (novo codigo necessario), instalar, testar se sidecar conecta
**Por que:** O ultimo fix (safeFetch fallback universal) pode resolver tudo -- o tauriFetch provavelmente falhava com erro nao previsto no Android e nao fazia fallback
**Verificar:**
```bash
# Parear (pedir dados ao usuario)
adb pair 100.84.227.100:<pairing-port> <code>
adb connect 100.84.227.100:<connection-port>

# Instalar
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-release-signed.apk

# Abrir e verificar tela Sistema
adb shell am start -n com.proatt.machine/.MainActivity
adb exec-out screencap -p > /tmp/screen.png
# STT deve mostrar Engine: Online
```

### 2. Se ainda offline: adicionar logging verboso no health check
**Onde:** `src/hooks/useSidecar.ts:75` (catch vazio) e `src/services/VoiceAIClient.ts:31` (console.warn do safeFetch)
**O que:** O catch na linha 75 do useSidecar engole o erro silenciosamente. Adicionar:
```typescript
} catch (err) {
  console.error('[useSidecar] health check failed:', err);
  setSidecarAvailable(false);
  setSidecarStatus('Sidecar offline');
}
```
**Por que:** Sem o erro real, nao sabemos se e CORS, timeout, DNS, certificado, ou outra coisa
**Verificar:** Rebuildar, instalar, e capturar logs: `adb logcat | grep -iE "chromium|useSidecar|safeFetch"`

### 3. Se for problema de CORS no WebView Android
**Onde:** `sidecar/voice_ai/main.py` linhas 100-106 (ALLOWED_ORIGINS)
**O que:** Verificar qual Origin o WebView Android envia. Pode nao ser `https://tauri.localhost`. Adicionar logging no sidecar:
```python
@app.middleware("http")
async def log_origin(request, call_next):
    origin = request.headers.get("origin", "none")
    print(f"[CORS] Origin: {origin}, Path: {request.url.path}")
    return await call_next(request)
```
**Por que:** CORS testado manualmente com `Origin: https://tauri.localhost` funcionou, mas o WebView real pode enviar Origin diferente
**Verificar:** `ssh opc@100.123.73.128 'journalctl -u voice-ai -f'` enquanto o app tenta conectar

### 4. Se for problema do tauriFetch no Android (plugin-http)
**Onde:** `src-tauri/capabilities/default.json` linhas 38-45 (http scope)
**O que:** O scope permite `http://**` e `https://**`. Mas no Android o tauriFetch pode ter comportamento diferente. Considerar bypassar tauriFetch completamente no Android:
```typescript
async function safeFetch(url, init) {
  // Android WebView: fetch nativo funciona melhor que tauriFetch
  if (window.__TAURI_INTERNALS__?.metadata?.currentPlatform?.os === 'android') {
    return await fetch(url, init);
  }
  try {
    return await tauriFetch(url, init);
  } catch (err) {
    console.warn(`[safeFetch] fallback:`, err);
    return await fetch(url, init);
  }
}
```
**Por que:** O tauriFetch no Android pode ter limitacoes nao documentadas; fetch nativo com cleartext=true deveria funcionar
**Verificar:** Rebuildar, instalar, testar

### 5. Investigar gravacao nativa (mic-recorder)
**Onde:** Plugin `tauri-plugin-mic-recorder` -- verificar se registra o command `start_audio_recording` no Android
**O que:** O app faz fallback para Web API (funciona), mas gravacao nativa pode ter melhor qualidade
**Por que:** Prioridade baixa -- fallback funciona
**Verificar:** Gravar audio, verificar se `Recording captured` aparece nos logs

## Como verificar

```bash
# Sidecar health (da VM)
curl -s http://100.123.73.128:8765/health | python3 -m json.tool

# Logs do sidecar em tempo real (SSH para Contabo)
ssh opc@100.123.73.128 'journalctl -u voice-ai -f'

# ADB: screenshot do celular
adb exec-out screencap -p > /tmp/screen.png

# ADB: logs WebView/console do app
adb logcat -s chromium

# Build + sign + install (ciclo completo)
cd /home/opc/ELCO-machina
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export ANDROID_HOME="/home/opc/Android/Sdk"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
bun run tauri android build --target aarch64
APK_DIR="src-tauri/gen/android/app/build/outputs/apk/universal/release"
$ANDROID_HOME/build-tools/35.0.0/zipalign -f -p 4 "$APK_DIR/app-universal-release-unsigned.apk" "$APK_DIR/app-aligned.apk"
$ANDROID_HOME/build-tools/35.0.0/apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android --out "$APK_DIR/app-release-signed.apk" "$APK_DIR/app-aligned.apk"
adb install -r "$APK_DIR/app-release-signed.apk"
```
