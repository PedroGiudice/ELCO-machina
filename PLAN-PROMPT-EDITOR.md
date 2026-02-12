# Plano: Prompt Editor UI

## Problema

O usuario nao consegue ver, editar, criar ou excluir estilos de prompt no app.
Os 18 estilos existem como dados no PromptStore, mas a unica interacao e um `<select>`
hardcoded no PanelATT. Para ajustar um prompt, o usuario precisa pedir ao desenvolvedor.

## Objetivo

Interface completa para gerenciar PromptTemplates: ver o system instruction de cada estilo,
editar inline, ajustar temperature, criar novos, duplicar builtins, excluir custom, resetar,
importar/exportar. O usuario deve ser autonomo -- nunca precisar de um desenvolvedor para
gerenciar prompts.

---

## Infraestrutura existente (nao reescrever)

### Backend (PromptStore)

| Componente | Caminho | Status |
|-----------|---------|--------|
| `PromptStore` (classe) | `src/services/PromptStore.ts` | Pronto |
| `usePromptStore` (hook) | `src/hooks/usePromptStore.ts` | Pronto |
| Persistencia | Tauri Store (`prompts.json`) + fallback localStorage | Pronto |
| 18 builtins | Definidos em `BUILTIN_TEMPLATES` com placeholders | Pronto |
| `buildSystemInstruction()` | Monta prompt final com context memory | Pronto |

### API do hook (ja disponivel)

```typescript
interface UsePromptStoreReturn {
  templates: PromptTemplate[];      // Lista reativa
  isLoaded: boolean;
  getById(id: string): PromptTemplate | undefined;
  getByName(name: string): PromptTemplate | undefined;
  save(template: PromptTemplate): Promise<void>;  // Cria ou atualiza
  deleteTemplate(id: string): Promise<boolean>;    // So custom
  resetBuiltins(): Promise<void>;                   // Restaura defaults
  duplicate(id: string): PromptTemplate | undefined; // Copia editavel
}
```

### PanelATT (dropdown atual)

O `<select>` de estilos usa lista hardcoded `outputStyles` (array de strings).
Precisa ser migrado para usar `promptStore.templates` como fonte de verdade.
O valor selecionado e `settings.outputStyle` (string com o nome do estilo).

---

## Fases

### Fase 1: Migrar dropdown para PromptStore (fonte unica de verdade)

**Objetivo:** O dropdown de estilos no PanelATT deve listar templates do PromptStore,
nao do array hardcoded. Quando o usuario seleciona um estilo, o `settings.outputStyle`
continua sendo o nome (string), mas a lista vem do store.

**Mudancas:**

1. **PanelATT.tsx** -- receber `templates: PromptTemplate[]` como prop em vez de usar
   `outputStyles` hardcoded. O `<select>` itera sobre `templates.map(t => t.name)`.
   Remover o array `outputStyles` do componente.

2. **App.tsx** -- passar `promptStore.templates` como prop para PanelATT.

**Validacao:** O dropdown deve listar exatamente os mesmos 18 estilos + quaisquer custom
criados pelo usuario. Selecionar funciona igual.

**Risco:** Nenhum. E uma mudanca de fonte de dados, a interface visual nao muda.

---

### Fase 2: Botao "Edit Prompt" no PanelATT

**Objetivo:** Ao lado do dropdown de estilo, adicionar um botao pequeno (icone de lapis)
que abre o modal de edicao do prompt selecionado. Visivel para todos os estilos exceto
"Whisper Only" (que nao tem system instruction).

**Mudancas:**

1. **PanelATT.tsx** -- adicionar botao com icone `Pencil` ao lado do `<select>` de estilo.
   `onClick` chama `onEditPrompt(outputStyle)`.

2. **PanelATT props** -- adicionar `onEditPrompt?: (styleName: string) => void`.

3. **App.tsx** -- handler que abre modal com o template selecionado.

**Validacao:** Botao aparece. Clicar nao faz nada visualmente ainda (modal vem na Fase 3).

---

### Fase 3: PromptEditorModal (componente novo)

**Objetivo:** Modal fullscreen (como o Memory Editor existente) para editar um PromptTemplate.

**Componente:** `src/components/panels/PromptEditorModal.tsx`

**Layout do modal:**

```
+--------------------------------------------------+
| [X]  Edit Prompt: "Elegant Prose"                |
+--------------------------------------------------+
| Name: [___________________________________]      |
|                                                   |
| System Instruction:                              |
| +-----------------------------------------------+|
| | Role: Expert literary editor...                ||
| | Goal: Transform transcribed text...            ||
| | ...                                            ||
| |                                       [5120ch] ||
| +-----------------------------------------------+|
|                                                   |
| Temperature: [=====O=====] 0.4                   |
|                                                   |
| Placeholders disponiveis:                        |
| {CONTEXT_MEMORY} {OUTPUT_LANGUAGE}               |
| {RECORDING_STYLE} {CUSTOM_INSTRUCTIONS}          |
|                                                   |
| [Builtin - cannot delete]  [Duplicate]  [Save]   |
+--------------------------------------------------+
```

**Props:**

```typescript
interface PromptEditorModalProps {
  template: PromptTemplate;
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: PromptTemplate) => Promise<void>;
  onDuplicate: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;  // so para custom
}
```

**Regras de negocio:**

- Builtins: editaveis (systemInstruction, temperature, name). Nao deletaveis.
  Se editados, ficam com `updatedAt` atualizado. `resetBuiltins()` restaura.
- Custom: editaveis e deletaveis. Botao "Delete" visivel.
- Name: editavel, mas nao pode duplicar nome existente.
- systemInstruction: textarea com max 5120 chars. Monospace. Sem limite de linhas.
- Temperature: slider 0.0 - 2.0, step 0.1. Mostra valor numerico.
- Placeholders: texto informativo (nao interativo), lista os 4 placeholders validos.
- Save: desabilitado se nada mudou. Ao salvar, `onSave(editedTemplate)`.
- Keyboard: Escape fecha sem salvar. Ctrl+S salva.

**Estilo visual:** Identico ao Memory Editor modal existente no App.tsx
(bg-black/80, backdrop-blur, bg-[#18181b] card, border-white/10).

**Validacao:** Abrir modal para builtin. Editar instruction. Salvar. Reabrir -- mudanca
persistida. Duplicar -- cria copia com " (copy)" no nome. Fechar sem salvar -- sem mudanca.

---

### Fase 4: Prompt Manager (lista completa com CRUD)

**Objetivo:** Tela completa acessivel pelo PanelATT (botao "Manage Prompts") que mostra
todos os templates em lista, permite criar novo do zero, deletar custom, resetar builtins,
importar/exportar.

**Componente:** `src/components/panels/PromptManagerModal.tsx`

**Layout:**

```
+----------------------------------------------------+
| [X]  Prompt Manager                                |
+----------------------------------------------------+
| [+ New Prompt]  [Import]  [Export]  [Reset Builtins]|
+----------------------------------------------------+
| BUILTINS (18)                                      |
| +--------------------------------------------------+
| | Verbatim               temp: 0.1    [Edit] [Dup] |
| | Elegant Prose          temp: 0.4    [Edit] [Dup] |
| | Ana Suy                temp: 0.4    [Edit] [Dup] |
| | ...                                               |
| +--------------------------------------------------+
|                                                     |
| CUSTOM (2)                                         |
| +--------------------------------------------------+
| | Meu Estilo Legal       temp: 0.6  [Edit][Dup][X] |
| | Resumo Juridico        temp: 0.3  [Edit][Dup][X] |
| +--------------------------------------------------+
+----------------------------------------------------+
```

**Acoes:**

| Acao | Comportamento |
|------|--------------|
| New Prompt | Abre PromptEditorModal com template vazio (name="", instruction="", temp=0.4, isBuiltin=false) |
| Edit | Abre PromptEditorModal com template existente |
| Duplicate | Cria copia, abre PromptEditorModal para editar |
| Delete (X) | Confirmacao inline ("Sure?"). So para custom |
| Import | File picker (JSON). Chama `promptStore.importAll()` |
| Export | File save dialog. Chama `promptStore.exportAll()` |
| Reset Builtins | Confirmacao ("Restaurar builtins ao estado original?"). Chama `promptStore.resetBuiltins()` |

**Regras de import/export:**

- Export: Tauri dialog (`save()`) para escolher caminho. Formato JSON.
- Import: Tauri dialog (`open()`) para selecionar arquivo. Importados como custom (isBuiltin=false).
- Validacao no import: ignora templates sem id/name/systemInstruction.

**Validacao:** Criar novo -> aparece na lista e no dropdown do PanelATT. Deletar custom ->
some da lista e do dropdown. Reset builtins -> builtins voltam ao original, custom preservados.
Export -> arquivo JSON valido. Import -> templates aparecem na lista.

---

### Fase 5: Integrar dropdown + manager + editor no App.tsx

**Objetivo:** Conectar tudo. O dropdown do PanelATT, o botao Edit, o botao Manage, e os
dois modais (Editor e Manager) funcionam como unidade coesa.

**Estado no App.tsx:**

```typescript
// Prompt Editor state
const [promptEditorOpen, setPromptEditorOpen] = useState(false);
const [promptEditorTemplate, setPromptEditorTemplate] = useState<PromptTemplate | null>(null);
const [promptManagerOpen, setPromptManagerOpen] = useState(false);
```

**Fluxo de interacao:**

1. Usuario seleciona estilo no dropdown -> `settings.setOutputStyle(name)` (como hoje)
2. Usuario clica lapis -> abre PromptEditorModal com template do estilo selecionado
3. Usuario clica "Manage Prompts" -> abre PromptManagerModal
4. No Manager, usuario clica "Edit" em qualquer template -> fecha Manager, abre Editor
5. No Manager, usuario clica "New" -> fecha Manager, abre Editor com template vazio
6. Ao salvar no Editor -> atualiza store, fecha Editor, recarrega dropdown
7. Ao criar/deletar no Manager -> dropdown reflete mudanca imediatamente

**Sincronizacao dropdown <-> store:**

Quando `promptStore.templates` muda (via save/delete/reset), o dropdown do PanelATT
atualiza automaticamente porque usa `templates` como fonte. Se o estilo selecionado
foi deletado, fallback para "Verbatim".

**Validacao e2e:** Selecionar estilo -> editar prompt -> salvar -> processar audio ->
verificar que o texto refinado reflete a mudanca no prompt.

---

## Fora de escopo

- Preview ao vivo do prompt montado (com context memory preenchido) -- future enhancement
- Categorias/tags para organizar templates -- complexidade desnecessaria agora
- Compartilhar templates via URL/link -- nao faz sentido para app desktop
- Versionamento de templates (historico de edicoes) -- over-engineering

## Decisoes tomadas

- O dropdown do PanelATT continua usando `settings.outputStyle` (nome como string).
  O PromptStore e consultado por nome. Isso mantem backward compat.
- Builtins sao editaveis (o usuario pode customizar). `resetBuiltins()` restaura.
- Import sempre cria custom (nunca sobrescreve builtins).
- Export inclui tudo (builtins + custom).
- O modal segue o padrao visual do Memory Editor (consistencia).

## Ordem de execucao

1. Fase 1 -- dropdown migrado (5 min, low risk)
2. Fase 3 -- PromptEditorModal (componente isolado, testavel)
3. Fase 2 -- botao Edit no PanelATT (conecta dropdown ao modal)
4. Fase 4 -- PromptManagerModal (CRUD completo)
5. Fase 5 -- integracao final no App.tsx
6. Verificacao: `bun run build` + teste manual

## Checklist pre-entrega

- [ ] Dropdown lista templates do PromptStore (nao array hardcoded)
- [ ] Editar systemInstruction de qualquer estilo funciona
- [ ] Temperature slider funciona (0.0-2.0)
- [ ] Criar novo template custom funciona
- [ ] Deletar template custom funciona (builtins protegidos)
- [ ] Duplicar template funciona
- [ ] Reset builtins restaura ao original
- [ ] Import/Export JSON funciona (via Tauri dialog)
- [ ] Estilo deletado nao quebra o dropdown (fallback Verbatim)
- [ ] Persistencia: templates sobrevivem restart do app
- [ ] Keyboard shortcuts: Escape fecha, Ctrl+S salva
- [ ] Build passa sem erros
