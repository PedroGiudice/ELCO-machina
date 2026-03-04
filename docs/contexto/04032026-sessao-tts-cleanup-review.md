# Contexto: TTS XTTS v2, Log Categorizado, Review Completa e Cleanup

**Data:** 2026-03-04
**Sessao:** branch `corrigir-melhorar-polir`
**Worktree:** `/home/opc/ELCO-machina/.worktrees/corrigir-melhorar-polir`

---

## O que foi feito

### 1. Refiner Output Save
Salvar automaticamente texto refinado pelo Claude em `refiner-output/{data}/{timestamp}_{slug}.md`. Metodo `_save_output()` no `ClaudeRefiner` em `sidecar/voice_ai/services/refiner.py`. Fire-and-forget, nunca falha o request.

### 2. Endpoint Modal XTTS v2
Criado `scripts/modal_xtts_serve.py` com FastAPI via `@modal.fastapi_endpoint()`.
- POST `/synthesize` -- recebe JSON (text, ref_audio_base64, language, speed, temperature, top_k, top_p, repetition_penalty, length_penalty), retorna WAV
- GET `/health` -- status do servidor
- URL: `https://pedrogiudice--xtts-serve-xttsserver-synthesize.modal.run`
- Health: `https://pedrogiudice--xtts-serve-xttsserver-health.modal.run`
- Cold start ~62s, inferencia ~9s para ~3.6s de audio
- Deploy: `modal deploy scripts/modal_xtts_serve.py`

### 3. Frontend TTS XTTS v2 (Tasks 2-5 do plano)
- `useTTS.ts` reescrito: chama Modal diretamente, tipo `VoiceRef { path, base64 }`, estado `ttsStatus`
- `PanelTTS.tsx` reescrito: 6 sliders XTTS v2, upload via `dialog.open()`, health check com `safeFetch`, status visual
- Chatterbox/Piper removidos completamente (frontend e backend)
- `VoiceAIClient.ts` limpo, tipos `XTTSParams` e `TTSSynthesizeRequest`

### 4. Log com Categorias Filtraveis
- `LogEntry` estendido com `category: LogCategory` ('stt'|'tts'|'refiner'|'audio'|'app'|'ipc') e nivel `warning`
- PanelStats com chips de filtro clicaveis e tags coloridas `[STT]`, `[TTS]`, etc.
- 30+ chamadas `addLog` categorizadas e traduzidas PT-BR

### 5. Review Completa + Correcoes
Duas revisoes (rust-developer + frontend-developer) encontraram ~30 problemas. Corrigidos:
- **Bloqueantes:** assinatura `useTTS` errada, props `voiceRef` inexistentes no App.tsx
- **Backend Rust:** versao Cargo.toml sync, `samples_written` nunca incrementado, URL auto-update sem porta 8090, 5 comandos sidecar dead code removidos
- **Backend Python:** `ClaudeRefiner` import morto, `ModalModelStatus` residual, `tts_profiles.py` deletado, `tts_modal_client.py` deletado
- **Frontend:** `<input type="file">` -> `dialog.open()`, `fetch()` -> `safeFetch`, `navigator.clipboard` -> plugin, `prompt()` -> modal React, tipos duplicados unificados, dead code removido (`useVoiceAI`, `stopSidecar`, etc.)

### 6. Migracao localStorage -> plugin-store
Criado `src/services/TauriStore.ts` -- camada unificada com `storeGet/storeSet/storeDelete/migrateKey`. Dois stores: `settings.json` e `data.json`. Fallback para localStorage em dev mode. Migracao automatica de dados existentes. Todos os 8 hooks migrados, zero localStorage fora do TauriStore.

### 7. Fix Layout Editor
O batch 3 removeu `min-h-0` e `flex flex-col` do `AppLayout.tsx`, causando o editor encolher. Restaurado.

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `scripts/modal_xtts_serve.py` | Criado -- endpoint Modal XTTS v2 |
| `src/services/TauriStore.ts` | Criado -- camada persistencia Tauri |
| `sidecar/voice_ai/services/refiner.py` | Modificado -- _save_output() |
| `sidecar/voice_ai/main.py` | Modificado -- limpo dead code Modal |
| `sidecar/voice_ai/schemas/tts_profiles.py` | Deletado -- dead code |
| `sidecar/voice_ai/services/tts_modal_client.py` | Deletado -- dead code |
| `src/hooks/useTTS.ts` | Reescrito -- XTTS v2 direto ao Modal |
| `src/components/panels/PanelTTS.tsx` | Reescrito -- sliders XTTS v2 |
| `src/components/panels/PanelStats.tsx` | Modificado -- filtros por categoria |
| `src/components/layout/AppLayout.tsx` | Modificado -- fix layout editor |
| `src-tauri/src/lib.rs` | Modificado -- removidos 5 comandos dead code |
| `src-tauri/src/audio.rs` | Modificado -- fix samples_written |
| `src-tauri/tauri.conf.json` | Modificado -- URL auto-update corrigida |
| `src-tauri/Cargo.toml` | Modificado -- versao sync, deps limpas |
| `App.tsx` | Modificado -- props TTS, modal context, clipboard |
| Todos hooks em `src/hooks/` | Modificados -- migracao localStorage |

## Commits desta sessao

```
04553a29 fix(layout): restaurar min-h-0 e flex-col no editor fullscreen
724863c0 fix(cargo): restaurar tauri-plugin-log em [dependencies] para Android
fe5af881..abc47b13 (8 commits) refactor: migrar localStorage para TauriStore
4a7fd305 refactor(lib): remover 5 comandos sidecar dead code
67558404 fix(updater): corrigir URL auto-update para Tailscale porta 8090
1410bf08 fix(audio): usar state.samples_written nos closures CPAL
957b3768 fix(ui): substituir prompt() nativo por modal React
b9f7e977 refactor(frontend): remover dead code, APIs nativas, unificar tipos
6d6bf752 fix(backend): limpar dead code e sync versao Cargo.toml
35385bc1 fix(tts): corrigir assinatura useTTS e props voiceRef
a081af94..845024eb (3 commits) feat(log): categorias filtraveis
e842671d fix(tts): usar APIs nativas Tauri
96e5bbdb..d42eec5f (4 commits) feat/refactor(tts): XTTS v2 completo
12bd5623 feat(tts): endpoint Modal XTTS v2
1b60f027 feat(refiner): salvar output refinado
102c9a49..96d195b9 (4 commits anteriores a esta sessao)
```

Total: 31 commits, 65 arquivos, +1983 -4859 linhas.

## Pendencias identificadas

1. **APK v0.3.1 buildando** -- build Android rodando em background, precisa instalar no celular para testar UI (editor fullscreen, TTS, log). Build pode ja ter terminado.
2. **Testar TTS end-to-end no celular** -- upload audio referencia -> sintetizar -> ouvir resultado
3. **Testar log categorizado no celular** -- verificar chips e filtros na aba Sistema
4. **Multiplos audios de referencia** -- usuario mencionou querer trocar rapido entre audios de ref ("moods"). Atualmente suporta 1. Feature futura: lista de favoritos.
5. **Versao 0.3.1** -- bumpada para superar version code 3000 no celular. Commitar bump.

## Decisoes tomadas

- **XTTS v2 nao usa texto de referencia como parametro:** a clonagem e feita apenas via audio. O texto de referencia e relevante apenas para qualidade (texto de teste deve ser similar ao estilo do audio).
- **localStorage migrado para plugin-store:** criada camada `TauriStore.ts` com migracao automatica. Fallback para dev mode web.
- **tts_profiles.py deletado:** frontend envia parametros diretamente ao Modal. Profiles nomeados nao fazem mais sentido.
- **5 comandos Tauri sidecar removidos:** vestigios da arquitetura onde o sidecar era empacotado no app. Sidecar roda como servico na VM.
- **prompt() nativo substituido por modal React:** Tauri dialog nao suporta input de texto livre.
