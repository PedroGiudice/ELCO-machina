# Retomada: Modal STT Backend -- Tasks 6-8 + Teste Android

## Contexto rapido

Implementamos o Modal como backend STT alternativo no sidecar e no frontend. O codigo esta mergeado na main. O build Android debug compilou e o APK foi instalado no Galaxy S24. Faltam 3 tasks do plano: instalar modal SDK no venv, deployer a app Modal, e testar end-to-end. O Foreground Service Android tambem precisa de teste real no celular.

Branch: main (commits ate `3cc5aa66`)

## Arquivos principais

- `sidecar/voice_ai/services/stt_modal_client.py` -- cliente Modal (usa `modal.Cls.from_name`)
- `sidecar/voice_ai/routers/transcribe.py` -- roteamento por `stt_backend`
- `scripts/modal_whisper_bench.py` -- app Modal com classe Whisper (NAO alterar)
- `docs/plans/2026-03-04-modal-stt-backend.md` -- plano completo (parado na Task 6)
- `docs/contexto/04032026-modal-stt-backend-e-android-build.md` -- contexto detalhado

## Proximos passos (por prioridade)

### 1. Instalar modal SDK no venv do sidecar
**Onde:** `/home/opc/ELCO-machina/sidecar/`
**O que:** `uv pip install --python .venv/bin/python modal`
**Por que:** STTModalClient faz `import modal` -- sem o SDK, fallback para "nao disponivel"
**Verificar:**
```bash
cd /home/opc/ELCO-machina/sidecar
.venv/bin/python -c "import modal; print(modal.__version__)"
```

### 2. Deploy da app Modal
**Onde:** raiz do projeto
**O que:** `modal deploy scripts/modal_whisper_bench.py`
**Por que:** `modal.Cls.from_name("whisper-bench", "Whisper")` so funciona com app deployada
**Verificar:**
```bash
modal app list | grep whisper-bench
```

### 3. Restart sidecar e teste end-to-end
**Onde:** VM (sidecar na porta 8765)
**O que:** restart sidecar, testar transcricao com `stt_backend=modal` via curl
**Verificar:**
```bash
pkill -f "uvicorn voice_ai"
cd /home/opc/ELCO-machina/sidecar
nohup .venv/bin/uvicorn voice_ai.main:app --host 0.0.0.0 --port 8765 > /tmp/sidecar.log 2>&1 &
sleep 3

# Health
curl -s http://localhost:8765/health | python3 -m json.tool

# Teste Modal
AUDIO_B64=$(base64 -w0 /home/opc/ELCO-machina/TesteModal.m4a)
curl -s -X POST http://localhost:8765/transcribe \
  -H "Content-Type: application/json" \
  -d "{\"audio\": \"$AUDIO_B64\", \"format\": \"m4a\", \"language\": \"pt\", \"stt_backend\": \"modal\"}" \
  | python3 -m json.tool | head -20
```

### 4. Testar Foreground Service no Galaxy S24
**Onde:** Galaxy S24 Ultra (APK debug ja instalado)
**O que:** gravar audio -> iniciar processamento -> bloquear tela -> desbloquear -> verificar resultado
**Verificar:**
```bash
ssh cmr-auto@100.102.249.9 "adb logcat -s AudioProcessingSvc:* ProATT:*"
```

### 5. Solicitar POST_NOTIFICATIONS em runtime (codigo)
**Onde:** `src-tauri/gen/android/app/src/main/java/com/proatt/machine/MainActivity.kt`
**O que:** adicionar request de permissao Android 13+ antes de iniciar Service
**Por que:** sem isso, `startForeground` pode falhar silenciosamente (concedido via ADB por agora)

## Como verificar

```bash
# TypeScript
cd /home/opc/ELCO-machina && bun run tsc --noEmit

# Sidecar
curl -s http://100.123.73.128:8765/health | python3 -m json.tool

# Modal SDK
cd /home/opc/ELCO-machina/sidecar && .venv/bin/python -c "from voice_ai.services.stt_modal_client import STTModalClient; c = STTModalClient(); print('available:', c.is_available)"
```
