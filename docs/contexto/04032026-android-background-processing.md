# Contexto: Android Background Processing -- Foreground Service

**Data:** 2026-03-04
**Sessao:** feature/android-background-processing
**Branch:** `feature/android-background-processing` (nao mergeada, sem PR)

---

## O que foi feito

### 1. Diagnostico do problema de tela bloqueada

O app Android perdia o resultado do processamento STT+refinamento quando a tela bloqueava. Causa raiz: o `proxy_fetch` (reqwest no Rust, dentro do processo do app) e o WebView JS sao suspensos pelo Android quando a tela bloqueia. O sidecar na VM termina o processamento mas a resposta HTTP se perde (socket TCP congelado no celular).

O prototipo Gemini nao tinha o problema porque usava API publica (Google) com fetch nativo do WebView -- o Android trata conexoes a IPs publicos diferentemente de IPs privados Tailscale (100.x).

### 2. Implementacao do Foreground Service

Criado `AudioProcessingService.kt` -- Android Foreground Service que:
- Faz HTTP POST para o sidecar **independentemente do WebView**
- Usa `PARTIAL_WAKE_LOCK` nativo (impede suspensao da CPU)
- Exibe notificacao persistente ("Processando audio...")
- Guarda resultado no `companion object` com `CountDownLatch`
- Rejeita chamadas concorrentes (`@Synchronized startProcessing`)
- Reseta estado no `onDestroy` (protege contra kill pelo OS)
- `connectTimeout = 30s` (Tailscale cold start), `readTimeout = 5min`

### 3. Bridge JS <-> Kotlin (NativeAudio)

Modificado `MainActivity.kt` para override `onWebViewCreate(webView)` e registrar `NativeAudio` via `@JavascriptInterface`. Expoe:
- `startProcessing(body, url)` -- inicia Foreground Service + aguarda via CountDownLatch
- `getStatus()` -- "idle" | "processing" | "completed" | "error"
- `getResult()` / `getError()` -- acesso ao resultado armazenado

O JSON da resposta do sidecar e passado direto ao JS (sem re-parse via `JSON.parse('...')`) para evitar problemas de escaping.

### 4. Refatoracao do frontend

- `VoiceAIClient.ts`: adicionado `nativeBackgroundTranscribe()` que usa `window.NativeAudio.startProcessing()`. O metodo `transcribe()` detecta automaticamente se NativeAudio esta disponivel e usa o path nativo no Android.
- `useAudioProcessing.ts`: removido WakeLock web (substituido pelo nativo). Adicionada reconciliacao de estado no mount (`checkPendingNativeResult()`) para recuperar resultado de processamento anterior se app foi fechado/reaberto.
- Export de `isAndroid` e `checkPendingNativeResult` para uso no hook.

### 5. Fix TS pre-existente

Corrigido erros TypeScript em `PanelStats.tsx` e `PromptManagerModal.tsx` -- componentes `LogLine` e `TemplateRow` nao declaravam `key` no tipo de props (React 19).

### 6. Code review por dois agentes

Rust-developer e frontend-developer revisaram. Principais achados corrigidos:
- Race condition no companion object -> `@Synchronized` + `CountDownLatch`
- Escaping manual de JSON -> JSON passado direto
- Polling com `Thread.sleep` -> `CountDownLatch.await(10, MINUTES)`
- Estado stale se Service morto -> `resetState()` no `onDestroy`
- `webView` sem `@Volatile` -> adicionado
- `connectTimeout` curto (15s) -> aumentado para 30s
- `stopWithTask="true"` no manifesto -> adicionado

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `src-tauri/gen/android/app/src/main/java/com/proatt/machine/AudioProcessingService.kt` | Criado -- Foreground Service completo |
| `src-tauri/gen/android/app/src/main/java/com/proatt/machine/MainActivity.kt` | Modificado -- NativeAudio bridge via JavascriptInterface |
| `src-tauri/gen/android/app/src/main/AndroidManifest.xml` | Modificado -- permissoes + service declaration |
| `src/services/VoiceAIClient.ts` | Modificado -- nativeBackgroundTranscribe + checkPendingNativeResult |
| `src/hooks/useAudioProcessing.ts` | Modificado -- remove WakeLock web, reconciliacao no mount |
| `src/components/panels/PanelStats.tsx` | Modificado -- fix key prop type |
| `src/components/panels/PromptManagerModal.tsx` | Modificado -- fix key prop type |
| `docs/plans/2026-03-04-android-background-processing.md` | Criado -- plano original (parcialmente executado) |

## Commits desta sessao

```
a410f4d9 feat(android): Foreground Service para processamento em background
```

## Pendencias identificadas

1. **Build Android debug nao foi executado** -- precisa compilar e verificar se AudioProcessingService.kt e MainActivity.kt compilam com o Gradle do Tauri. Risco: imports do Tauri (`TauriActivity`) podem precisar de ajustes.

2. **Permissao POST_NOTIFICATIONS nao e solicitada em runtime** -- no Android 13+ essa permissao requer solicitacao explicita. Sem ela, o `startForeground` pode falhar silenciosamente. Precisa adicionar request de permissao no frontend ou no onCreate da Activity.

3. **Teste no dispositivo fisico** -- nenhum teste real foi feito. Fluxo a testar: gravar audio -> iniciar processamento -> bloquear tela -> desbloquear -> verificar resultado.

4. **`foregroundServiceType="dataSync"` pode ser rejeitado no Google Play** -- alternativa: `"shortService"` (max 3min) ou `"specialUse"`. Para uso pessoal nao e problema.

5. **Editor.tsx e AppLayout.tsx tem mudancas nao commitadas** -- nao relacionadas a esta feature (pre-existentes).

## Decisoes tomadas

- **JavascriptInterface em vez de plugin Tauri mobile**: mais simples, nao requer crate Rust separada. O `onWebViewCreate` do TauriActivity expoe o WebView diretamente. Pode migrar para plugin formal no futuro se necessario.
- **CountDownLatch em vez de polling**: elimina busy-wait e thread leak. Timeout de 10min alinhado com WakeLock.
- **JSON passado direto ao evaluateJavascript**: a resposta do sidecar ja e JSON valido. Evita escaping manual fragil.
- **Reconciliacao de estado no mount**: se o app fecha e reabre durante processamento, o hook verifica `NativeAudio.getStatus()` e recupera o resultado.
