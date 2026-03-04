# Retomada: Teste no Celular e Merge

## Contexto rapido

Branch `corrigir-melhorar-polir` com 31 commits: integracao XTTS v2 completa (endpoint Modal + UI), log categorizado com filtros, review completa com ~30 correcoes (dead code, APIs nativas Tauri, migracao localStorage -> plugin-store, layout). Build passa, versao 0.3.1.

O endpoint Modal XTTS v2 esta deployado em `https://pedrogiudice--xtts-serve-xttsserver-synthesize.modal.run`. Frontend chama diretamente (sem sidecar).

APK foi buildado mas ainda nao testado no celular (celular desconectou). Ha um APK pronto que pode precisar de rebuild se houve mais commits depois.

## Arquivos principais

- `scripts/modal_xtts_serve.py` -- endpoint Modal XTTS v2
- `src/hooks/useTTS.ts` -- hook TTS reescrito
- `src/components/panels/PanelTTS.tsx` -- UI com sliders XTTS v2
- `src/components/panels/PanelStats.tsx` -- log com filtros por categoria
- `src/services/TauriStore.ts` -- camada persistencia Tauri
- `docs/contexto/04032026-sessao-tts-cleanup-review.md` -- contexto detalhado
- `docs/plans/2026-03-04-tts-xtts-v2-integration.md` -- plano TTS (completo)

## Proximos passos (por prioridade)

### 1. Buildar e instalar APK no celular
**Onde:** raiz do worktree
**O que:** rebuild se necessario, instalar via ADB
**Por que:** validar UI no dispositivo real (editor fullscreen, TTS, log)
**Verificar:**
```bash
NO_STRIP=1 bun run tauri android build --debug --target aarch64
scp src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk pedro@100.112.239.110:C:\\Users\\pedro\\Downloads\\pro-att-machine-debug.apk
ssh pedro@100.112.239.110 "C:\\Android\\platform-tools\\adb.exe install C:\\Users\\pedro\\Downloads\\pro-att-machine-debug.apk"
```

### 2. Testar TTS end-to-end
**Onde:** app no celular, aba TTS
**O que:** upload audio referencia (`docs/Refaudio.wav`), sintetizar texto, ouvir resultado
**Por que:** validar que o fluxo completo funciona (upload -> base64 -> Modal -> playback)
**Verificar:** audio reproduz sem erro, cold start mostra mensagem clara

### 3. Testar log categorizado
**Onde:** app no celular, aba Sistema
**O que:** verificar chips de filtro (Todos/STT/TTS/Refiner/Audio/App/IPC), tags coloridas, mensagens PT-BR
**Por que:** validar que erros sao visiveis e filtraveis

### 4. Commitar bump de versao
**Onde:** `src-tauri/tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml`
**O que:** versao esta em 0.3.1, commitar se ainda nao foi
**Verificar:** `grep '"version"' src-tauri/tauri.conf.json package.json`

### 5. Avaliar merge para main
**Onde:** branch `corrigir-melhorar-polir`
**O que:** se testes no celular passarem, fazer PR ou merge para main
**Por que:** 31 commits com features e correcoes significativas

## Como verificar

```bash
# Build frontend
cd /home/opc/ELCO-machina/.worktrees/corrigir-melhorar-polir
bun run build

# Refs residuais (deve retornar vazio)
grep -ri "chatterbox\|piper\|TTSEngine\|TTSCustomParams" src/ sidecar/ --include="*.ts" --include="*.tsx" --include="*.py"

# localStorage fora do TauriStore (deve retornar vazio)
grep -rn "localStorage\." src/ --include="*.ts" --include="*.tsx" | grep -v TauriStore

# Endpoint Modal health
curl -s https://pedrogiudice--xtts-serve-xttsserver-health.modal.run | python3 -m json.tool
```
