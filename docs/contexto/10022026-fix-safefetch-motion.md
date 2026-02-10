# Contexto: Debugging front-end quebrado pos-refatoracao

**Data:** 2026-02-10
**Sessao:** main (pos-merge PR #7)
**Duracao:** ~2h

---

## O que foi feito

### 1. Build, deploy e teste do AppImage v0.2.17

Build com `NO_STRIP=1 bun run tauri build --bundles appimage`. AppImage transferido via SCP para PC Linux (cmr-auto@100.102.249.9), extraido, libgcrypt.so.20 removida (fix cross-distro Oracle->Ubuntu). Conexao MCP Tauri via porta 9223 / Tailscale.

### 2. Diagnostico: webview completamente congelado

Ao conectar via MCP Tauri, TODAS as chamadas JS deram timeout (incluindo `document.title`). Isso indica bloqueio sincrono do main thread, nao apenas erro React.

### 3. Causa raiz identificada: importacao tripla de @tauri-apps/plugin-http

**O problema central:** `installSafeFetch()` no index.tsx sobrescreve `window.fetch` com uma versao que usa `tauriFetch` (via `@tauri-apps/plugin-http`). Porem, `VoiceAIClient.ts` e `useTTS.ts` TAMBEM importavam `@tauri-apps/plugin-http` diretamente e tinham suas proprias copias de `safeFetch`.

Cadeia de chamadas problematica:
1. `VoiceAIClient.safeFetch` -> tenta `tauriFetch` -> falha (Tailscale off, scope, etc)
2. Fallback chama `fetch(url)` = `window.fetch` = `safeFetch` global
3. `safeFetch` global -> tenta `tauriFetch` de novo (dupla chamada IPC)
4. Possivel deadlock ou condicao de corrida no IPC Tauri com 3 modulos tentando usar o mesmo plugin simultaneamente

### 4. Correcao aplicada

Removido import de `@tauri-apps/plugin-http` de `VoiceAIClient.ts` e `useTTS.ts`. Agora `@tauri-apps/plugin-http` e importado em UM UNICO lugar: `src/services/safeFetch.ts`. Os outros modulos delegam para `window.fetch` (que ja e o safeFetch global).

### 5. Fix colateral: motion/react removido de AppLayout e BottomNav

Removido `motion/react` (AnimatePresence, motion.div, motion.button) de `AppLayout.tsx` e `BottomNav.tsx`, substituido por divs e buttons padrao com CSS transitions. Motivacao: WebKitGTK do AppImage pode ter incompatibilidades com Web Animations API do motion v12.

**NOTA:** motion/react ainda e usado em outros 4 arquivos (Button.tsx, Spinner.tsx, Editor.tsx, PanelConfig.tsx, PanelATT.tsx, PanelTTS.tsx). Se o problema de freeze persistir, esses sao os proximos candidatos.

### 6. Descoberta: classes Tailwind `bg-[var(--X)]` nao geram no Vite

Classes arbitrarias com CSS variables (ex: `bg-[var(--bg-elevated)]`) NAO sao geradas pelo Tailwind quando processado via PostCSS no Vite. O CLI standalone gera corretamente. Isso e pre-existente (afeta v0.2.16 tambem) e NAO e a causa raiz do freeze. A UI funciona porque as CSS variables sao definidas em `:root` no index.html e as cores sao herdadas.

### 7. PR #7 mergeado na main

Toda a refatoracao da sessao anterior + os fixes desta sessao estao na main. Branch `feature/issue-fixes-and-feedback` deletada.

### 8. Fix menor: cpal deprecated API

`device.name()` -> `device.description().name()` em `src-tauri/src/audio.rs`. Zero warnings no cargo check.

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `src/services/VoiceAIClient.ts` | Modificado - removido import de plugin-http, safeFetch agora delega para window.fetch |
| `src/hooks/useTTS.ts` | Modificado - mesmo fix que VoiceAIClient |
| `src/components/layout/AppLayout.tsx` | Modificado - removido motion/react, classes var() movidas para inline styles |
| `src/components/layout/BottomNav.tsx` | Modificado - removido motion/react, classes var() movidas para inline styles |
| `src-tauri/src/audio.rs` | Modificado - cpal name() -> description().name() (ja commitado no PR #7) |

## Commits desta sessao

```
b0bd537e Merge pull request #7 from PedroGiudice/feature/issue-fixes-and-feedback
1a8090ea refactor(app): extrair hooks, context e componentes do App.tsx monolitico
```

**NAO COMMITADOS (4 arquivos modificados apos o merge):**
- VoiceAIClient.ts, useTTS.ts, AppLayout.tsx, BottomNav.tsx

## Pendencias identificadas

1. **TESTAR o AppImage corrigido** -- AppImage ja esta no PC (`~/.local/lib/pro-att-machine/squashfs-root/AppRun`), precisa ser executado e verificado via MCP Tauri. PRIORIDADE MAXIMA.
2. **Commitar os 4 arquivos corrigidos** -- pendente de validacao do teste
3. **motion/react em outros componentes** -- se o freeze persistir apos testar, remover motion/react de Button.tsx, Spinner.tsx, Editor.tsx, PanelConfig.tsx, PanelATT.tsx, PanelTTS.tsx
4. **Classes `bg-[var(--X)]` no Tailwind/Vite** -- bug pre-existente, nao e critico (CSS vars herdam), mas idealmente corrigir para consistencia. Baixa prioridade.
5. **Publicar v0.2.17 no update server** -- so apos validacao bem-sucedida do AppImage

## Decisoes tomadas

- **Centralizar plugin-http em safeFetch.ts:** toda chamada HTTP passa por um unico ponto. Outros modulos usam `window.fetch` que ja e o safeFetch global.
- **Remover motion/react do layout:** precaucao contra incompatibilidade WebKitGTK. Mantido em componentes menores onde e menos critico.
- **Inline styles para CSS vars:** onde Tailwind nao gera classes `bg-[var()]`, usar `style={{ backgroundColor: 'var(--bg-elevated)' }}` diretamente.
