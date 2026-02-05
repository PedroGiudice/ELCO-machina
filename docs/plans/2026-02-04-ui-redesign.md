# Plano de Redesign UI - Pro ATT Machine

**Data:** 2026-02-04
**Status:** Aprovado
**Escopo:** Reorganizacao completa do layout e sistema visual

---

## Resumo Executivo

Redesign da interface para resolver:
1. Layout crowded e pouco escalavel
2. Estaticidade visual (sem animacoes)
3. Tipografia generica
4. Navegacao confusa entre funcionalidades

**Abordagem:** Editor central fixo + ferramentas orbitando via navegacao inferior.

---

## Especificacao de Design

### Arquitetura de Layout

```
+-----------------------------------------------------+
|                                                     |
|                     EDITOR                          |
|               (sempre visivel)                      |
|                ~65% altura                          |
|                                                     |
+-----------------------------------------------------+
|              PAINEL CONTEXTUAL                      |
|         (muda conforme aba ativa)                   |
|                ~25% altura                          |
+-----------------------------------------------------+
|   [ATT]      [TTS]      [Config]                   |
|    Mic       Volume       Gear                      |
|                ~10% altura                          |
+-----------------------------------------------------+
```

### Tipografia

| Uso | Fonte | Peso | Tamanho |
|-----|-------|------|---------|
| Titulos/Nav | Cabinet Grotesk | 600 | 14-16px |
| Botoes | Cabinet Grotesk | 500 | 13-14px |
| Editor | Sentient | 400 | 16-18px |
| Placeholders | Sentient Italic | 400 | 16px |
| Status/meta | Cabinet Grotesk | 400 | 11-12px |

**Fontes CDN:**
```html
<!-- Cabinet Grotesk -->
<link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,600&display=swap" rel="stylesheet">

<!-- Sentient -->
<link href="https://api.fontshare.com/v2/css?f[]=sentient@400,400i&display=swap" rel="stylesheet">
```

### Sistema de Bordas

| Elemento | Border Radius |
|----------|---------------|
| Cards/Containers | 8px |
| Botoes primarios | 12px |
| Botoes secundarios | 8px |
| Input fields | 6px |
| Nav items | 12px |

### Paleta de Cores (Dark Theme)

```css
:root {
  --bg-base: #121214;
  --bg-elevated: #1a1a1c;
  --bg-overlay: #222224;
  --text-primary: #fafafa;
  --text-secondary: #a1a1a6;
  --border-subtle: #2a2a2e;
  --accent: #fafafa;
}
```

### Espacamento (Base 8px)

| Token | Valor |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |

---

## Componentes

### 1. BottomNav

```typescript
interface NavItem {
  id: 'att' | 'tts' | 'config';
  icon: LucideIcon;
  label: string;
}

const navItems: NavItem[] = [
  { id: 'att', icon: Mic, label: 'ATT' },
  { id: 'tts', icon: Volume2, label: 'TTS' },
  { id: 'config', icon: Settings, label: 'Config' },
];
```

- Altura: 72px + safe-area
- Icones: 24px
- Labels: 12px
- Item ativo: bg-overlay + border-top accent

### 2. Editor

- Sempre visivel e editavel
- Fonte: Sentient 16-18px
- Padding: 24px
- Placeholder quando vazio
- Toolbar flutuante: [TXT] [MD] [Read] [Copy]
- Status bar: Ln/Col, encoding, status

### 3. PanelATT

- Botao Record (48px altura, destaque)
- Seletor idioma (dropdown)
- Import file (drop area + botao)
- Context pools (chips horizontais)

### 4. PanelTTS

- Toggle Engine (Piper/Chatterbox)
- Seletor voz (dropdown)
- Sliders (Speed, Pitch) - so Chatterbox
- Botao Play/Stop

### 5. PanelConfig

- API Keys (Gemini, Modal)
- Servidor Whisper URL
- Tema (futuro)
- About/Version

---

## Animacoes

**Biblioteca:** motion (npm install motion)

### Transicoes de Painel

```typescript
const panelVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const panelTransition = {
  duration: 0.2,
  ease: "easeOut",
};
```

### Botoes

```typescript
const buttonVariants = {
  hover: { scale: 1.02, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  tap: { scale: 0.98 },
};
```

### Estados de Feedback

| Estado | Animacao |
|--------|----------|
| Recording | Waveform + border pulse |
| Processing | Spinner Constructivist |
| TTS Playing | Icon pulse loop |

---

## Plano de Implementacao

### Fase 1: Infraestrutura (2-3h)

| # | Task | Arquivos |
|---|------|----------|
| 1.1 | Instalar fontes (CDN) | index.html |
| 1.2 | Instalar motion | package.json |
| 1.3 | Criar CSS variables | index.html ou styles.css |
| 1.4 | Criar estrutura de componentes | src/components/ |

### Fase 2: Layout Base (3-4h)

| # | Task | Arquivos |
|---|------|----------|
| 2.1 | Criar BottomNav component | src/components/BottomNav.tsx |
| 2.2 | Criar Editor component (extrair de App.tsx) | src/components/Editor.tsx |
| 2.3 | Criar layout wrapper | src/components/AppLayout.tsx |
| 2.4 | Integrar no App.tsx | App.tsx |

### Fase 3: Paineis Contextuais (4-5h)

| # | Task | Arquivos |
|---|------|----------|
| 3.1 | Criar PanelATT (extrair logica de App.tsx) | src/components/PanelATT.tsx |
| 3.2 | Criar PanelTTS (extrair logica de App.tsx) | src/components/PanelTTS.tsx |
| 3.3 | Criar PanelConfig (extrair logica de App.tsx) | src/components/PanelConfig.tsx |
| 3.4 | Implementar transicoes entre paineis | App.tsx |

### Fase 4: Animacoes (2-3h)

| # | Task | Arquivos |
|---|------|----------|
| 4.1 | Adicionar motion aos botoes | Todos components |
| 4.2 | Implementar transicoes de painel | AppLayout.tsx |
| 4.3 | Integrar spinner customizado | src/components/Spinner.tsx |
| 4.4 | Adicionar feedback visual (recording, processing) | PanelATT, PanelTTS |

### Fase 5: Polish (2h)

| # | Task | Arquivos |
|---|------|----------|
| 5.1 | Ajustar espacamentos e proporcoes | Todos |
| 5.2 | Testar responsividade mobile | Todos |
| 5.3 | Verificar acessibilidade (contraste, focus) | Todos |
| 5.4 | Build e teste final | - |

---

## Estrutura de Arquivos Proposta

```
src/
  components/
    layout/
      AppLayout.tsx       # Layout wrapper
      BottomNav.tsx       # Navegacao inferior
    editor/
      Editor.tsx          # Editor principal
      EditorToolbar.tsx   # Toolbar flutuante
      EditorStatus.tsx    # Status bar
    panels/
      PanelATT.tsx        # Painel ATT
      PanelTTS.tsx        # Painel TTS
      PanelConfig.tsx     # Painel Config
    ui/
      Button.tsx          # Botao com motion
      Spinner.tsx         # Spinner customizado
      Slider.tsx          # Slider estilizado
  hooks/
    useActivePanel.ts     # Estado do painel ativo
  styles/
    variables.css         # CSS variables
    animations.ts         # Variants do motion
App.tsx                   # Orquestrador (reduzido)
```

---

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| App.tsx monolitico dificulta extracao | Extrair um componente por vez, testar apos cada extracao |
| Fontes CDN podem falhar | Fallback para system fonts |
| Motion aumenta bundle size | Tree-shaking, lazy load se necessario |
| Quebra de funcionalidade durante refactor | Commits frequentes, branch separada |

---

## Criterios de Aceitacao

- [ ] Editor sempre visivel e editavel
- [ ] Navegacao inferior funcional (ATT/TTS/Config)
- [ ] Paineis com transicao suave
- [ ] Fontes Cabinet Grotesk e Sentient aplicadas
- [ ] Cores e espacamentos conforme spec
- [ ] Animacoes em botoes e transicoes
- [ ] Spinner customizado integrado
- [ ] Funcionalidades existentes preservadas
- [ ] Build passa sem erros
- [ ] Responsivo em mobile

---

## Estimativa Total

| Fase | Tempo |
|------|-------|
| Infraestrutura | 2-3h |
| Layout Base | 3-4h |
| Paineis Contextuais | 4-5h |
| Animacoes | 2-3h |
| Polish | 2h |
| **Total** | **13-17h** |

---

## Notas

- Manter compatibilidade com funcionalidades existentes
- Nao alterar logica de negocio (transcricao, TTS)
- Commits frequentes para facilitar rollback
- Testar em desktop e mobile apos cada fase
