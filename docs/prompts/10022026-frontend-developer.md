# Retomada: frontend-developer -- Reverter PR #7 e refatorar corretamente (CMR-6, CMR-7, CMR-12, CMR-13, CMR-14, CMR-15)

## Contexto rapido

O app ELCO-machina (Tauri desktop, React/TypeScript) teve um refactor massivo (PR #7, commit `1a8090ea`) que foi mergeado na main sem build nem teste. Esse refactor introduziu `motion/react` (framer-motion), um `GlobalAppContext` monolitico, e 5 novos hooks -- tudo isso causou OOM kill no PC do usuario (7.6GB RAM, WebKitGTK).

O PR #7 fez coisas boas (extrair hooks, types, services, reduzir App.tsx de 3574 para 1107 linhas) e coisas ruins (motion/react pesado, contexto monolitico sem memoizacao, imports triplicados de plugin-http). O plano e: reverter o PR #7 na main, depois re-aplicar as partes boas de forma incremental, substituindo as partes ruins.

O contexto completo esta em `docs/contexto/10022026-diagnostic-e-issues.md`. Issues no Linear: CMR-6, CMR-7, CMR-12, CMR-13, CMR-14, CMR-15.

**REGRA ABSOLUTA:** nao pode haver downgrading visual nem funcional. CSS transitions devem igualar ou superar a qualidade do motion/react. Build (`bun run build`) e teste via MCP Tauri OBRIGATORIOS a cada passo.

## Restricoes do WebKitGTK (CRITICO -- nao e Chrome)

O app roda em WebKitGTK (Tauri desktop Linux), NAO em Chromium. Implicacoes:

- **RAM limitada:** PC do usuario tem 7.6GB total. WebKitGTK e mais memory-hungry que Chromium.
- **Web Animations API:** suportada mas com overhead significativo. CSS transitions sao preferidas.
- **getUserMedia:** bloqueado por politica de seguranca (audio capturado via Rust/CPAL, nao Web API).
- **HTTPS:** depende de GnuTLS do sistema (nao NSS/BoringSSL). Pode falhar silenciosamente.
- **Performance:** nao assumir que o que funciona leve no Chrome funciona leve no WebKitGTK.

## Arquivos principais

- `App.tsx` -- componente principal, atualmente 1107 linhas (pos-refactor)
- `src/context/GlobalAppContext.tsx` -- contexto monolitico a ser substituido
- `src/hooks/` -- 10+ hooks (useAuth, usePersistence, useSettings, useUpdater, useSidecar, useAudioProcessing, useTTS, useAudioRecording, useActivePanel)
- `src/services/safeFetch.ts` -- override global de window.fetch
- `src/services/VoiceAIClient.ts` -- cliente para sidecar de voz na VM
- `src/components/layout/AppLayout.tsx` -- layout com motion/react
- `src/components/layout/BottomNav.tsx` -- navegacao com motion/react
- `src/components/ui/Button.tsx` -- ButtonProps incompleto (28 erros TS)
- `src/types/index.ts` -- tipos extraidos
- `docs/contexto/10022026-diagnostic-e-issues.md` -- contexto da sessao anterior

## Proximos passos (por prioridade)

### 1. CMR-12: Reverter PR #7 na main

**Onde:** branch `main`, merge commit `b0bd537e`
**O que:**
```bash
git checkout main
git revert -m 1 b0bd537e  # reverte o merge, mantendo main como parent
```

**Por que:** O PR #7 foi mergeado sem build/teste e introduziu OOM kill. Reverter restaura o estado funcional (v0.2.16, monolitico mas estavel).
**Verificar:**
```bash
bun run build  # deve compilar sem erros
# App.tsx deve voltar a ~3574 linhas
wc -l App.tsx
```

**IMPORTANTE:** Apos o revert, o App.tsx volta a ser monolitico. Os passos seguintes re-aplicam as melhorias de forma segura.

### 2. CMR-6 + CMR-7: Re-aplicar extracao de hooks SEM motion/react e SEM GlobalAppContext

**Onde:** nova branch `refactor/incremental-extraction`
**O que:** Re-aplicar seletivamente as extraracoes do PR #7:

**Fase A -- Types e services (seguro, sem impacto visual):**
- Re-criar `src/types/index.ts` (124 linhas de tipos)
- Re-criar `src/services/AudioUtils.ts` (218 linhas de utils)
- Re-criar `src/services/safeFetch.ts` (40 linhas) -- ponto UNICO de import de `@tauri-apps/plugin-http`
- Atualizar `index.tsx` para chamar `installSafeFetch()`
- **Build e teste MCP**

**Fase B -- Hooks (um de cada vez, build entre cada):**
- `useAuth` (67 linhas) -> build -> teste
- `useSettings` (158 linhas) -> build -> teste
- `usePersistence` (585 linhas) -> build -> teste
- `useUpdater` (182 linhas) -> build -> teste
- `useSidecar` (156 linhas) -> build -> teste

**Fase C -- Contextos GRANULARES (substituir GlobalAppContext):**
- Criar `AuthProvider` com `useMemo` no value
- Criar `SettingsProvider` com `useMemo`
- Criar `PersistenceProvider` com `useMemo`
- Criar `SidecarProvider` com `useMemo` + throttle no health check
- **Build e teste MCP entre cada provider**

**Fase D -- Animacoes CSS (substituir motion/react):**
- Remover `motion/react` do `package.json`
- `AppLayout.tsx`: substituir `motion.div` por `div` com CSS transitions
- `BottomNav.tsx`: substituir `motion.button` por `button` com CSS transitions
- `Button.tsx`, `Spinner.tsx`, `Editor.tsx`: idem
- `PanelConfig.tsx`, `PanelATT.tsx`, `PanelTTS.tsx`: idem
- Criar `src/styles/animations.css` com keyframes e transitions equivalentes
- **Qualidade visual deve ser igual ou superior ao motion/react**
- **Build e teste MCP**

**Por que:** Refatoracao incremental com validacao a cada passo evita a repeticao do PR #7.
**Verificar a cada fase:**
```bash
bun run build  # zero erros
# Instalar no PC, conectar MCP Tauri, verificar UI
```

### 3. CMR-14: Corrigir ButtonProps

**Onde:** `src/components/ui/Button.tsx`
**O que:**
```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  // ...custom props existentes
}
```

**Por que:** 28 erros TS2322 em todos os componentes que usam Button.
**Verificar:** `npx tsc --noEmit` deve ter 28 erros a menos.

### 4. CMR-15: Limpar dead code

**Onde:** `App.tsx`
**O que:** Remover:
- Code paths de "Cloud STT" (nunca existiu)
- Checks de `process.env.NODE_ENV` (undefined em Tauri)
- `canSpeak={true}` hardcoded (usar estado real)

**Por que:** Codigo morto confunde e dificulta manutencao.
**Verificar:** `bun run build` sem erros, funcionalidade preservada.

### 5. CMR-13: Verificar que contextos granulares nao causam re-render excessivo

**Onde:** `src/context/` (pos Fase C)
**O que:** Adicionar `console.count('ProviderName render')` temporario em cada provider. Abrir o app, aguardar 30s. Nenhum provider deve re-renderizar mais que 2x sem interacao do usuario. useSidecar health check deve ser throttled (1x a cada 30s minimo).

**Por que:** O GlobalAppContext antigo causava dezenas de re-renders/segundo.
**Verificar:** Contagem de renders estavel apos boot.

## Como verificar (geral)

```bash
# Build (OBRIGATORIO a cada passo)
bun run build

# Instalar no PC do usuario (via VM)
NO_STRIP=1 bun run tauri build --bundles appimage
./scripts/publish-update.sh  # script ja corrigido pelo tauri-rust-dev

# Testar via MCP Tauri (porta 9223, host 100.102.249.9)
# Conectar driver_session, executar JS, tirar screenshot, verificar console logs

# TypeScript strict
npx tsc --noEmit
```

## Dependencias com tauri-rust-dev

O tauri-rust-dev vai corrigir o build pipeline (CMR-10) para automatizar a remocao de libs incompativeis. Ate que CMR-10 esteja pronto, a instalacao no PC requer fix manual:

```bash
# Fix manual temporario (ate CMR-10 ser resolvido):
rm -f squashfs-root/usr/lib/{libgnutls.so.30,libp11-kit.so.0,libcrypto.so.3,libgcrypt.so.20}
rm -f squashfs-root/usr/lib64/gio/modules/libgiognutls.so
```
