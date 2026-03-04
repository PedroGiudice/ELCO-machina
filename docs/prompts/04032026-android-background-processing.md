# Retomada: Android Background Processing -- Build e Teste

## Contexto rapido

Implementamos um Android Foreground Service (`AudioProcessingService.kt`) para resolver o problema de processamento STT+refinamento interrompido quando a tela do celular bloqueia. O Service faz o HTTP POST para o sidecar na VM independentemente do WebView, usando WakeLock nativo. Um bridge `NativeAudio` via `@JavascriptInterface` no `MainActivity.kt` conecta o JS ao Service. O frontend (`VoiceAIClient.ts`) detecta automaticamente o bridge e usa o path nativo no Android.

O codigo foi escrito, revisado por dois agentes (rust-developer e frontend-developer), e commitado. TypeScript compila limpo. **Mas nenhum build Android foi feito ainda.** Precisamos compilar, verificar erros de compilacao Kotlin/Gradle, e testar no celular.

Branch: `feature/android-background-processing` (commit `a410f4d9`)

## Arquivos principais

- `src-tauri/gen/android/app/src/main/java/com/proatt/machine/AudioProcessingService.kt` -- Foreground Service
- `src-tauri/gen/android/app/src/main/java/com/proatt/machine/MainActivity.kt` -- NativeAudio bridge
- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` -- permissoes e service declaration
- `src/services/VoiceAIClient.ts` -- `nativeBackgroundTranscribe()`, `checkPendingNativeResult()`
- `src/hooks/useAudioProcessing.ts` -- hook refatorado sem WakeLock web
- `docs/contexto/04032026-android-background-processing.md` -- contexto detalhado
- `docs/plans/2026-03-04-android-background-processing.md` -- plano original

## Proximos passos (por prioridade)

### 1. Verificar MCP plugins ativos
**Onde:** sessao Claude Code
**O que:** confirmar que os MCP servers (tauri, linear, etc.) estao respondendo
**Por que:** garantir que as tools de debug (driver_session, webview_screenshot) funcionam
**Verificar:**
```bash
# Testar health do sidecar
curl -s http://100.123.73.128:8765/health | python3 -m json.tool
```

### 2. Build Android debug
**Onde:** `/home/opc/ELCO-machina`
**O que:** compilar APK debug com o Foreground Service
**Por que:** verificar se AudioProcessingService.kt e MainActivity.kt compilam com Gradle/Tauri
**Verificar:**
```bash
cd /home/opc/ELCO-machina
bun run tauri android build --debug --target aarch64
# APK em: src-tauri/gen/android/app/build/outputs/apk/universal/debug/
```
**Riscos:** `TauriActivity` pode nao expor `onWebViewCreate` na versao do Tauri usada (2.9.5). Se der erro de compilacao, verificar a API disponivel na classe `TauriActivity` do JAR.

### 3. Solicitar permissao POST_NOTIFICATIONS em runtime
**Onde:** `MainActivity.kt` ou frontend JS
**O que:** no Android 13+, pedir permissao de notificacao antes de iniciar Foreground Service
**Por que:** sem essa permissao, `startForeground` pode falhar silenciosamente
**Verificar:** testar em Android 13+ (Galaxy S24 Ultra roda Android 14/15)

### 4. Instalar e testar no celular
**Onde:** Galaxy S24 Ultra (100.84.227.100 via Tailscale)
**O que:** instalar APK, gravar audio, iniciar processamento, bloquear tela, esperar, desbloquear
**Por que:** validar que o Foreground Service sobrevive a tela bloqueada
**Verificar:**
```bash
# Copiar APK para o celular (se USB ou via HTTP)
# Ou servir via HTTP temporario:
cd /home/opc/ELCO-machina && python3 -m http.server 8080
# No celular: http://137.131.201.119:8080/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

# Verificar logs do Service:
adb logcat -s AudioProcessingSvc:*
```

### 5. Commitar ajustes pos-build e mergear
**Onde:** branch `feature/android-background-processing`
**O que:** corrigir erros de compilacao, commitar, mergear na main
**Verificar:**
```bash
git log --oneline feature/android-background-processing
git checkout main && git merge feature/android-background-processing
```

## Como verificar

```bash
# TypeScript
cd /home/opc/ELCO-machina && bun run tsc --noEmit

# Sidecar
curl -s http://100.123.73.128:8765/health

# Build Android
bun run tauri android build --debug --target aarch64

# Logs do Service (com adb conectado)
adb logcat -s AudioProcessingSvc:* ProATT:*
```
