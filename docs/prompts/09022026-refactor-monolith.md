# Retomada: Refatoracao do Monolito App.tsx

## Contexto rapido

O plano `docs/plans/refactor-app-monolith.md` esta em execucao no branch `feature/issue-fixes-and-feedback`. As Fases 1, 2 e 4 estao completas: 5 hooks novos (useAuth, usePersistence, useSettings, useUpdater, useSidecar), types/index.ts, AudioUtils.ts, safeFetch.ts e GlobalAppContext.tsx foram criados. O App.tsx foi refatorado de ~3574 para 1107 linhas usando `useAppContext()`.

NADA foi commitado. Todas as mudancas estao unstaged. Prioridade zero eh commitar.

A Fase 3 esta parcialmente completa: o App.tsx foi refatorado, mas os componentes filhos (PanelATT, PanelTTS, PanelConfig, PanelStats, Editor) ainda recebem dezenas de props em vez de consumir o contexto diretamente. O build nao foi verificado apos as ultimas mudancas.

## Arquivos principais

- `docs/plans/refactor-app-monolith.md` -- plano completo da refatoracao
- `docs/contexto/09022026-refactor-monolith.md` -- contexto detalhado desta sessao
- `App.tsx` (raiz, NAO em src/) -- componente principal refatorado
- `src/context/GlobalAppContext.tsx` -- provider com useAuth, useSettings, usePersistence, useActivePanel, useUpdater, useSidecar
- `src/hooks/` -- todos os hooks (useAuth, usePersistence, useSettings, useUpdater, useSidecar + pre-existentes)
- `src/types/index.ts` -- tipos compartilhados
- `src/services/AudioUtils.ts` -- utilidades de audio
- `src/services/safeFetch.ts` -- override de fetch para tauriFetch

## Proximos passos (por prioridade)

### 1. Verificar build e commitar tudo

**Onde:** raiz do projeto
**O que:** Rodar type check, corrigir erros se houver, e commitar todas as mudancas
**Por que:** Nada esta commitado -- risco de perda de trabalho
**Verificar:**
```bash
npx tsc --noEmit 2>&1 | tail -5
git add -A && git status
```

### 2. Retomar Task 9: Refatorar componentes filhos para usar contexto

**Onde:** `src/components/panels/PanelATT.tsx`, `PanelTTS.tsx`, `PanelConfig.tsx`, `PanelStats.tsx`, `src/components/editor/Editor.tsx`
**O que:** Substituir prop drilling por `useAppContext()`. Cada componente deixa de receber props do App.tsx e consome o contexto diretamente. Simplificar as interfaces de props drasticamente.
**Por que:** Fase 3 do plano -- sem isso, o refactoring esta incompleto e o App.tsx continua passando dezenas de props
**Verificar:** `npx tsc --noEmit` sem erros novos + componentes renderizando corretamente

### 3. Verificacao final (Task 10): build + teste funcional

**Onde:** raiz do projeto
**O que:** `bun run build` deve passar. Idealmente rodar `bun run tauri dev` e testar com Tauri MCP (webview_screenshot, webview_dom_snapshot)
**Por que:** Instrucao pendente: "nao pare ate que voce esteja testando o app via Tauri MCP"
**Verificar:**
```bash
bun run build 2>&1 | tail -5
# Se tiver Tauri MCP disponivel:
# bun run tauri dev (background) + driver_session + webview_screenshot
```

### 4. Cleanup e code review

**Onde:** Todos os arquivos novos/modificados
**O que:** Remover imports nao utilizados, codigo morto, comentarios TODO residuais. Verificar que nao ha logica duplicada entre hooks e App.tsx.
**Por que:** O refactoring moveu muita logica -- pode haver restos orfaos

## Como verificar

```bash
# Type check
npx tsc --noEmit 2>&1 | tail -5

# Build frontend
bun run build 2>&1 | tail -3

# Build Tauri (demora 1-2 min, usar NO_STRIP=1 no Oracle Linux)
NO_STRIP=1 bun run tauri build --bundles appimage 2>&1 | tail -5

# Verificar que nada quebrou nos hooks pre-existentes
grep -r "useAppContext" src/components/ --include="*.tsx" -l
```
