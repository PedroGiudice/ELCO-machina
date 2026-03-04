# Retomada: Separar STT/Refiner + TTS Chatterbox/Kokoro no UI

## Contexto rapido

O Modal STT esta 100% funcional (deployado, testado e2e, UI simplificada com toggle VM/Modal). O sidecar carrega credenciais Modal do `.env` automaticamente. Build Android 0.3.0 instalado no Galaxy S24. A UI do PanelConfig foi limpa (removidos controles legados).

Dois problemas arquiteturais identificados precisam de atencao:
1. O pipeline STT+refinamento esta acoplado num unico endpoint -- precisa separar para dar visibilidade de progresso e permitir uso independente do refiner
2. O TTS nao tem opcoes no UI -- Chatterbox (Modal GPU) e Kokoro (local) existem no backend mas o usuario nao pode escolher/configurar

Branch: main (commits ate `a08f1088`)

## Arquivos principais

- `sidecar/voice_ai/routers/transcribe.py` -- endpoint `/transcribe` que faz STT + refinamento acoplados
- `sidecar/voice_ai/services/stt_modal_client.py` -- cliente Modal STT
- `sidecar/voice_ai/services/refiner.py` -- ClaudeRefiner (claude CLI subprocess)
- `src/hooks/useAudioProcessing.ts` -- orquestra chamada ao sidecar e processa resultado
- `src/components/panels/PanelConfig.tsx` -- settings UI (ja limpo, falta TTS)
- `docs/contexto/04032026-modal-e2e-e-ui-cleanup.md` -- contexto detalhado desta sessao
- `docs/plans/2026-03-04-modal-stt-backend.md` -- plano anterior (COMPLETO)

## Proximos passos (por prioridade)

### 1. Separar STT do refinamento no pipeline

**Onde:** `sidecar/voice_ai/routers/transcribe.py` e `src/hooks/useAudioProcessing.ts`
**O que:** Criar endpoint `/refine` separado. O `/transcribe` passa a retornar apenas texto bruto. O frontend chama sequencialmente: transcribe -> refine, mostrando progresso de cada etapa.
**Por que:** O usuario quer (a) saber quanto tempo cada etapa leva, (b) poder refinar texto ja existente sem re-transcrever, (c) ver progresso real no UI.
**Verificar:**
```bash
# Teste STT isolado
curl -s -X POST http://localhost:8765/transcribe -H "Content-Type: application/json" -d @/tmp/transcribe_req.json | python3 -c "import sys,json; r=json.load(sys.stdin); print('text:', r['text'][:100]); print('refined:', r.get('refined_text', 'N/A'))"

# Teste refine isolado
curl -s -X POST http://localhost:8765/refine -H "Content-Type: application/json" -d '{"text": "texto bruto aqui", "system_instruction": "limpe o texto"}' | python3 -m json.tool
```

### 2. Adicionar opcoes TTS ao PanelConfig (Chatterbox/Kokoro)

**Onde:** `src/components/panels/PanelConfig.tsx`, `src/hooks/useSettings.ts`, hooks de TTS
**O que:** Toggle TTS Engine (Kokoro local vs Chatterbox Modal GPU), configuracao de voz/perfil. O usuario esta refatorando o script Chatterbox no Modal -- coordenar com o estado atual de `scripts/` para TTS Modal.
**Por que:** O backend suporta ambos mas o UI nao expoe a escolha.
**Verificar:** `bun run tsc --noEmit` + testar no app

### 3. Testar Foreground Service com tela bloqueada

**Onde:** Galaxy S24 Ultra (APK 0.3.0 ja instalado)
**O que:** Gravar audio -> iniciar processamento -> bloquear tela -> desbloquear -> verificar resultado
**Verificar:** `ssh cmr-auto@100.102.249.9 "adb logcat -d" | grep -iE "AudioProcessing|foreground"`

### 4. POST_NOTIFICATIONS em runtime (Android 13+)

**Onde:** `src-tauri/gen/android/app/src/main/java/com/proatt/machine/MainActivity.kt`
**O que:** Request permissao antes de iniciar Foreground Service
**Por que:** Sem isso, `startForeground` falha silenciosamente em dispositivos sem a permissao

## Como verificar

```bash
# TypeScript
cd /home/opc/ELCO-machina && bun run tsc --noEmit

# Sidecar rodando
curl -s http://localhost:8765/health | python3 -m json.tool

# Modal STT client disponivel
cd /home/opc/ELCO-machina/sidecar && .venv/bin/python -c "from voice_ai.services.stt_modal_client import STTModalClient; c = STTModalClient(); print('available:', c.is_available)"

# Modal app deployada
modal app list | grep whisper-bench
```
