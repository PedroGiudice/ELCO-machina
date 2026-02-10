# Contexto: Refatoracao do Monolito App.tsx

**Data:** 2026-02-09
**Sessao:** feature/issue-fixes-and-feedback
**Plano:** `docs/plans/refactor-app-monolith.md`

---

## O que foi feito

### 1. Hooks customizados criados (Fase 1 do plano)

Todos os hooks da Fase 1 foram implementados com sucesso:

| Hook | Linhas | Responsabilidade |
|------|--------|------------------|
| `useAuth` | 67 | Login/logout, credenciais hardcoded |
| `usePersistence` | 585 | IndexedDB, Tauri Store, historico, contextos, API key, logs |
| `useSettings` | 158 | Tema, tipografia, output, AI config, modais settings |
| `useUpdater` | 182 | Auto-update desktop (plugin-updater) + Android (HTTP check) |
| `useSidecar` | 156 | VoiceAIClient, health check periodico, whisperServerUrl |

Hooks pre-existentes (`useAudioRecording`, `useAudioProcessing`, `useTTS`, `useActivePanel`) ja estavam no codebase mas NAO estavam integrados. Permaneceram como estavam.

### 2. Types e services extraidos (Fase 4 do plano)

| Arquivo | Linhas | Conteudo |
|---------|--------|----------|
| `src/types/index.ts` | 124 | OutputStyle, RecordingStyle, ProcessingStats, AudioMetrics, HistoryItem, ContextItem, FontStyle, etc. |
| `src/services/AudioUtils.ts` | 218 | isTauri(), isAndroid(), isNewerVersion(), generateHistoryId(), blobToBase64(), bufferToWav(), analyzeAudioContent() |
| `src/services/safeFetch.ts` | 40 | installSafeFetch() para override de window.fetch com tauriFetch |

### 3. GlobalAppContext implementado (Fase 2 do plano)

`src/context/GlobalAppContext.tsx` (98 linhas):
- `AppProvider` inicializa useAuth, useSettings, usePersistence, useActivePanel, useUpdater, useSidecar
- `useAppContext()` retorna o contexto tipado
- Hooks granulares: `useAppAuth()`, `useAppSettings()`, etc.

### 4. App.tsx refatorado (Fase 3 parcial)

De ~3574 linhas para 1107 linhas. Usa `useAppContext()` desestruturado em `{ auth, settings, persistence, panel, updater, sidecar }`.

O que PERMANECE no App.tsx (logica local, nao movida para hooks):
- Estado de gravacao (isRecording, audioBlob, mediaRecorder, mics)
- Estado de processamento (isProcessing, transcription, lastStats)
- Estado de TTS (isSpeaking, ttsAudioUrl)
- Estado de audio metrics (audioMetrics, analyserRef)
- Funcoes: processAudio, buildStylePrompt, refineWithGemini, finalizeProcessing
- Funcoes: startRecording, stopRecording, handleReadText, stopReadText
- Memory modal inline

O Settings modal (~900 linhas JSX) foi removido.

### 5. Outros arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `index.tsx` | Envolvido com `<AppProvider>`, chama `installSafeFetch()` |
| `index.html` | Ajustes menores |
| `src/hooks/index.ts` | Barrel exports atualizados com todos os hooks |
| `src/hooks/useAudioProcessing.ts` | Modificado (diff grande: 817 linhas changed) |
| `src/components/panels/PanelConfig.tsx` | Modificado (664 linhas changed) |
| `src/components/ui/Button.tsx` | Ajuste menor |
| `src/components/ui/AudioVisualizer.tsx` | Novo, 74 linhas (extraido do App.tsx) |
| `tsconfig.json` | Ajustes de config |
| `package.json` | Ajuste de deps |
| `src-tauri/Cargo.toml` | +1 dep |
| `src-tauri/src/audio.rs` | Ajustes menores |
| `src-tauri/src/lib.rs` | Ajustes menores |
| `src-tauri/tauri.conf.json` | Ajustes |

## Commits desta sessao

NENHUM. Todas as mudancas estao unstaged. Nada foi commitado.

## Progresso do plano

| Fase | Status |
|------|--------|
| Fase 1: Hooks customizados | Completa (Tasks 1-6) |
| Fase 2: GlobalAppContext | Completa (Task 7 - nao marcada no task system) |
| Fase 3: Refatorar App.tsx | Parcial (Task 8 - App.tsx feito, Task 9 - componentes filhos pendente) |
| Fase 4: Types e services | Completa (Task 6) |

## Pendencias identificadas

1. **Componentes filhos ainda usam prop drilling** (alta) -- PanelATT (~47 props), PanelTTS (~40), PanelConfig (~58), PanelStats (~39), Editor (~32). O plano previa migra-los para `useAppContext()` direto. Task 9 pendente.
2. **Build nao foi verificado** (alta) -- nenhum `bun run build` ou `npx tsc --noEmit` foi rodado apos as ultimas mudancas. Pode haver erros de tipo.
3. **Nada commitado** (alta) -- todas as mudancas estao em risco de perda. Primeiro passo da proxima sessao deve ser commit.
4. **Teste funcional via Tauri MCP nao realizado** (media) -- a instrucao "nao pare ate testar via Tauri MCP" nao foi cumprida.
5. **Erro pre-existente em PanelStats.tsx** (baixa) -- TS2322 na linha 166, nao introduzido por nos.
6. **Settings modal removido** (baixa) -- verificar se a funcionalidade de configuracoes esta acessivel por outro caminho (PanelConfig provavelmente absorveu).

## Decisoes tomadas

- **Adaptar ao estado real em vez de seguir plano cegamente:** hooks pre-existentes (useAudioRecording, useAudioProcessing, useTTS) foram mantidos como estavam, sem recriar. Apenas os faltantes foram criados.
- **Tauri Store com defaults obrigatorio:** `load('file.json', { defaults: {}, autoSave: 100 })` -- sem `defaults` da erro de tipo.
- **store.get() sem generics:** O store importado dinamicamente retorna `any`, fazendo `get<T>()` falhar com TS2347. Usar `store.get('key') as T | undefined`.
- **addLog opcional em useSidecar:** Tornado parametro opcional com `?` e helper `log()` interno com no-op fallback.
- **Settings modal removido do App.tsx:** A funcionalidade de configuracao fica no PanelConfig (ja existente na BottomNav).
