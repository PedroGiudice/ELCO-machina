# Contexto: Modal STT Backend + Android Build Validado

**Data:** 2026-03-04
**Sessao:** feature/android-background-processing (mergeada na main)
**Branch atual:** main

---

## O que foi feito

### 1. Build Android debug -- compilacao validada

Build Android debug com Foreground Service (`AudioProcessingService.kt`) e bridge NativeAudio (`MainActivity.kt`) compilou sem erros. O `onWebViewCreate` do TauriActivity funciona na versao 2.9.5. APK instalado no Galaxy S24 Ultra via ADB (cmr-auto -> Tailscale). Permissao POST_NOTIFICATIONS concedida via `adb shell pm grant`.

- APK: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
- Comando: `bun run tauri android build --debug --target aarch64`
- Instalacao: `scp` para cmr-auto + `adb install` (precisou `adb uninstall` primeiro por diferenca de assinatura debug vs release)

### 2. Modal como backend STT alternativo

Implementado toggle VM/Modal no app. O usuario pode escolher onde processar o STT:
- **VM:** whisper.cpp CLI (CPU, ~84s para 3min50s de audio)
- **Modal:** faster-whisper GPU T4 (9s warm, 17s cold)

O refinamento (Claude CLI subprocess) continua sempre na VM.

**Fluxo:**
```
app -> POST /transcribe { stt_backend: "vm"|"modal", audio, ... }
  -> sidecar roteia:
     - "vm": STTService (whisper.cpp CLI)
     - "modal": STTModalClient -> modal.Cls.from_name("whisper-bench", "Whisper").transcribe.remote()
  -> refinamento: ClaudeRefiner (claude CLI subprocess, sempre local)
  -> response
```

**Arquivos criados/modificados (backend):**
- `sidecar/voice_ai/services/stt_modal_client.py` -- cliente Modal com `modal.Cls.from_name()`
- `sidecar/voice_ai/routers/transcribe.py` -- campo `stt_backend`, roteamento condicional
- `sidecar/voice_ai/main.py` -- instanciacao e injecao do STTModalClient

**Arquivos modificados (frontend):**
- `src/hooks/useSettings.ts` -- tipo `SttBackend`, estado persistido em localStorage
- `src/services/VoiceAIClient.ts` -- campo `stt_backend` no `TranscribeRequest`
- `src/hooks/useAudioProcessing.ts` -- propaga `sttBackend` do config ao request
- `src/components/panels/PanelConfig.tsx` -- toggle VM/Modal no UI
- `App.tsx` -- conecta sttBackend do settings ao hook e PanelConfig

### 3. Decisao arquitetural: sidecar Python se mantem

O sidecar Python e necessario mesmo com Modal porque o refinamento usa `claude` CLI como subprocess (`asyncio.create_subprocess_exec`). O claude CLI so roda na VM. Python e adequado: ecossistema ML e Python-first, o gargalo e inferencia/rede (nao overhead Python), e o sidecar roda na VM (nao no dispositivo).

## Commits desta sessao

```
3cc5aa66 merge: feature/android-background-processing -> main
5d0db19a feat: add Modal como backend STT alternativo (VM/Modal toggle)
9e11e1bc docs(sessao): contexto e prompt de retomada -- background processing
a410f4d9 feat(android): Foreground Service para processamento em background
```

## Pendencias identificadas

1. **Instalar modal SDK no venv do sidecar** (Task 6 do plano) -- `uv pip install --python .venv/bin/python modal`
2. **Deploy da app Modal** (Task 7) -- `modal deploy scripts/modal_whisper_bench.py` (necessario para `modal.Cls.from_name()` funcionar)
3. **Teste end-to-end** (Task 8) -- restart sidecar, testar via curl com `stt_backend=modal`, testar no app
4. **Teste do Foreground Service no celular** -- APK instalado mas fluxo nao testado (gravar -> processar -> bloquear tela -> verificar resultado)
5. **Solicitar POST_NOTIFICATIONS em runtime** -- no Android 13+ precisa request explicito; feito via ADB mas nao no codigo
6. **Editor.tsx e AppLayout.tsx** -- mudancas pre-existentes nao commitadas (nao relacionadas)

## Decisoes tomadas

- **Sincrono primeiro para Modal:** opcao 1 (chamada sincrona via `transcribe.remote()`) em vez de webhook/polling. Webhook so faz sentido se processamento passar de 30s+.
- **Sidecar se mantem em Python:** refinamento depende de claude CLI (subprocess). Reescrever em Rust nao traria beneficio (gargalo e rede/inferencia).
- **Toggle no UI:** usuario controla onde o STT roda, parametro trafega no body JSON em todos os paths (desktop, Android NativeAudio).
- **Foreground Service preservado:** mesmo com endpoint publico do Modal, Samsung DOZE pode matar conexoes de 30s+. Service e seguro.
