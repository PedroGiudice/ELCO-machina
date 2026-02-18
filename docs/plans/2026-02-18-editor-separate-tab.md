# Editor como Aba Separada - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mover o Editor de texto para uma aba separada no BottomNav, permitindo que cada tela ocupe 100% do espaco disponivel.

**Architecture:** O layout atual usa split-view (painel lateral + editor lado a lado). A mudanca adiciona `'editor'` ao `PanelType`, insere uma aba no BottomNav, e simplifica o AppLayout para renderizar apenas um painel por vez (fullscreen). Nenhum hook de negocio muda.

**Tech Stack:** React 19, TypeScript, Framer Motion, Lucide Icons, Tailwind CSS

---

### Task 1: Adicionar `editor` ao PanelType

**Files:**
- Modify: `src/hooks/useActivePanel.ts:3`

**Step 1: Editar o tipo**

No arquivo `src/hooks/useActivePanel.ts`, linha 3, mudar:

```typescript
// ANTES
export type PanelType = 'att' | 'tts' | 'config' | 'stats';

// DEPOIS
export type PanelType = 'att' | 'editor' | 'tts' | 'config' | 'stats';
```

**Step 2: Verificar compilacao**

Run: `cd /home/opc/ELCO-machina && bun run build 2>&1 | tail -3`
Expected: Erros de TypeScript nos componentes que usam `PanelType` sem tratar `'editor'` -- isso e esperado e sera corrigido nas proximas tasks.

**Step 3: Commit**

```bash
git add src/hooks/useActivePanel.ts
git commit -m "refactor(nav): add editor to PanelType union"
```

---

### Task 2: Adicionar aba Editor no BottomNav

**Files:**
- Modify: `src/components/layout/BottomNav.tsx`

**Step 1: Adicionar item Editor ao array navItems**

No arquivo `src/components/layout/BottomNav.tsx`, fazer duas mudancas:

1. Adicionar `FileText` ao import do lucide-react (linha 3):

```typescript
// ANTES
import { Mic, Volume2, Settings, Activity } from 'lucide-react';

// DEPOIS
import { Mic, FileText, Volume2, Settings, Activity } from 'lucide-react';
```

2. Adicionar item `editor` ao array `navItems` (linha 12-17), entre `att` e `tts`:

```typescript
const navItems: { id: PanelType; label: string; icon: typeof Mic }[] = [
  { id: 'att', label: 'ATT', icon: Mic },
  { id: 'editor', label: 'Editor', icon: FileText },
  { id: 'tts', label: 'TTS', icon: Volume2 },
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'stats', label: 'Sistema', icon: Activity },
];
```

**Step 2: Verificar compilacao**

Run: `cd /home/opc/ELCO-machina && bun run build 2>&1 | tail -3`
Expected: Build passa (BottomNav ja renderiza o novo item).

**Step 3: Commit**

```bash
git add src/components/layout/BottomNav.tsx
git commit -m "feat(nav): add Editor tab to BottomNav"
```

---

### Task 3: Simplificar AppLayout para fullscreen panels

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`

**Step 1: Reescrever AppLayout**

Substituir o conteudo completo de `src/components/layout/AppLayout.tsx` por:

```typescript
import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BottomNav } from './BottomNav';
import type { PanelType } from '../../hooks/useActivePanel';

interface AppLayoutProps {
  activePanel: PanelType;
  onPanelChange: (panel: PanelType) => void;
  isProcessing?: boolean;
  editor: React.ReactNode;
  panelATT: React.ReactNode;
  panelTTS: React.ReactNode;
  panelConfig: React.ReactNode;
  panelStats: React.ReactNode;
}

const panelVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export function AppLayout({
  activePanel,
  onPanelChange,
  isProcessing = false,
  editor,
  panelATT,
  panelTTS,
  panelConfig,
  panelStats,
}: AppLayoutProps) {
  const currentPanel = {
    att: panelATT,
    editor,
    tts: panelTTS,
    config: panelConfig,
    stats: panelStats,
  }[activePanel];

  return (
    <div
      className="
        flex flex-col h-full w-full
        bg-[var(--bg-base)]
        text-[var(--text-primary)]
      "
      style={{
        paddingTop: 'var(--sat)',
        paddingLeft: 'var(--sal)',
        paddingRight: 'var(--sar)',
      }}
    >
      {/* Full-screen panel */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activePanel}
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="h-full overflow-y-auto pb-20"
          >
            {currentPanel}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Navigation */}
      <BottomNav
        activePanel={activePanel}
        onPanelChange={onPanelChange}
        disabled={isProcessing}
      />

      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:h-0 shrink-0" />
    </div>
  );
}
```

Mudancas chave:
- Removido o split-view (`aside` + `main`)
- `editor` adicionado ao map `currentPanel`
- Removido `isFullscreenPanel` (todos sao fullscreen agora)
- Layout simplificado: wrapper unico com AnimatePresence

**Step 2: Verificar compilacao**

Run: `cd /home/opc/ELCO-machina && bun run build 2>&1 | tail -3`
Expected: Build passa sem erros.

**Step 3: Commit**

```bash
git add src/components/layout/AppLayout.tsx
git commit -m "feat(layout): fullscreen panels, editor as separate tab"
```

---

### Task 4: Ajustar Editor para ocupar tela inteira

**Files:**
- Modify: `src/components/editor/Editor.tsx`

**Step 1: Garantir que o Editor preenche o container pai**

O Editor ja usa `flex-1 flex flex-col h-full` no wrapper externo (linha 58). Verificar que funciona como tela inteira. O unico ajuste necessario e garantir que o `overflow-y-auto` do pai no AppLayout nao conflita com o textarea que precisa de scroll interno.

Editar `src/components/editor/Editor.tsx`, linha 58:

```typescript
// ANTES
<div className="flex-1 flex flex-col h-full bg-[var(--bg-base)]">

// DEPOIS
<div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-base)]">
```

E na div do AnimatePresence parent no AppLayout, trocar `overflow-y-auto` para `overflow-hidden` apenas para o editor. Na verdade, a solucao mais simples e deixar o AppLayout sem `overflow-y-auto` no wrapper e deixar cada painel controlar seu proprio scroll.

Editar `src/components/layout/AppLayout.tsx` -- na motion.div, remover `overflow-y-auto`:

```typescript
// ANTES
className="h-full overflow-y-auto pb-20"

// DEPOIS
className="h-full pb-20"
```

Cada painel ja tem seu proprio scroll (PanelATT, PanelConfig, etc. usam `overflow-y-auto` internamente). O Editor tem o textarea que faz scroll nativo. Assim nao ha conflito.

**Step 2: Verificar compilacao**

Run: `cd /home/opc/ELCO-machina && bun run build 2>&1 | tail -3`
Expected: Build passa.

**Step 3: Commit**

```bash
git add src/components/editor/Editor.tsx src/components/layout/AppLayout.tsx
git commit -m "fix(layout): ensure editor and panels fill available space"
```

---

### Task 5: Verificar panels existentes tem scroll proprio

**Files:**
- Check: `src/components/panels/PanelATT.tsx`
- Check: `src/components/panels/PanelTTS.tsx`
- Check: `src/components/panels/PanelConfig.tsx`
- Check: `src/components/panels/PanelStats.tsx`

**Step 1: Verificar cada painel**

Ler o wrapper externo de cada painel e confirmar que tem `overflow-y-auto` ou equivalente. Se algum nao tiver, adicionar.

Padrao esperado no wrapper de cada painel:
```typescript
<div className="... overflow-y-auto ...">
```

Se algum painel nao tiver scroll, adicionar `overflow-y-auto` ao wrapper mais externo.

**Step 2: Testar visualmente**

Run: `cd /home/opc/ELCO-machina && bun run dev`

Verificar no browser (localhost:3000):
- Clicar em cada aba: ATT, Editor, TTS, Config, Sistema
- Cada uma deve ocupar a tela toda
- Scroll funciona dentro de cada painel
- Editor: textarea editavel, toolbar no topo, status bar no rodape

**Step 3: Commit (se houve mudancas)**

```bash
git add src/components/panels/
git commit -m "fix(panels): ensure all panels have internal scroll"
```

---

### Task 6: Build e verificacao final

**Step 1: Build de producao**

Run: `cd /home/opc/ELCO-machina && bun run build 2>&1 | tail -5`
Expected: Build completo sem erros ou warnings relevantes.

**Step 2: Commit final e tag**

Se tudo OK, nao precisa de commit adicional (cada task ja commitou).

**Step 3: Resumo da verificacao**

Confirmar:
- [ ] 5 abas no BottomNav: ATT, Editor, TTS, Config, Sistema
- [ ] Cada aba ocupa 100% da tela (sem split-view)
- [ ] Editor funcional: textarea editavel, toolbar, footer
- [ ] Transicao animada entre abas
- [ ] Build de producao passa sem erros
