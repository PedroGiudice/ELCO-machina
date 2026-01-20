# ARCHITECTURE.md

Documento técnico de referência para o **gemini-prompt-architect**.

---

## Visão Geral

Aplicação web client-side que transcreve áudio em alta fidelidade usando Gemini 2.5 Flash, convertendo gravações em prompts formatados com múltiplos estilos de output.

**Deploy:** https://ai.studio/apps/drive/1OYWhoDTEqpA_Wqi5-bFHl-F053u4LssU

---

## Stack Técnica

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Framework | React | 19.2.1 |
| Build | Vite | 6.2.0 |
| Linguagem | TypeScript | 5.8.2 |
| Styling | Tailwind CSS | CDN |
| AI | @google/genai | 1.31.0 |
| Icons | Lucide React | 0.556.0 |

---

## Estrutura de Arquivos

```
/
├── App.tsx           # Componente principal (~2000 linhas)
├── index.tsx         # Entry point React
├── index.html        # Template HTML + CDN imports
├── vite.config.ts    # Config Vite (porta 3000, env vars)
├── tsconfig.json     # Config TypeScript
├── package.json      # Dependências
├── metadata.json     # Metadata AI Studio (permissões)
├── .env.local        # GEMINI_API_KEY (não commitado)
└── .claude/          # Config Claude Code
    └── settings.local.json
```

---

## Arquitetura do App.tsx

O componente é **monolítico por design** (SPA simples). Três módulos lógicos:

### 1. Audio Engine (Web Audio API)

```
MediaRecorder → AudioChunks → Blob → IndexedDB
                    ↓
            AudioContext.analyser
                    ↓
         RMS | Peak | Pitch | SNR
```

**Constraints:**
- `echoCancellation: true`
- `noiseSuppression: true`
- `autoGainControl: true`

**Export:** WAV (PCM 16-bit), WebM

### 2. Gemini Integration

```
AudioBlob → Base64 → Gemini API → Formatted Output
                         ↓
              System Prompt (style-specific)
                         ↓
              Context Memory (multi-turn)
```

**Estilos de Output:**
| Modo | Uso |
|------|-----|
| Verbatim | Transcrição literal |
| Elegant Prose | Estilo literário |
| Prompt Engineering | Formato Claude/Gemini |
| Code | Geração de código |
| Technical Docs | Documentação técnica |

### 3. Persistência

```
IndexedDB (GeminiArchitectDB v2)
├── workspace    → Audio blobs
└── contexts     → Context memory pools

localStorage
├── API key
├── Modelo selecionado
└── Transcrições recentes
```

**Helpers:**
```typescript
initDB()                 // Inicializa IndexedDB
saveAudioToDB(blob)      // Persiste audio
loadAudioFromDB()        // Recupera audio
saveContextToDB(item)    // Salva context pool
loadAllContextsFromDB()  // Lista contextos
```

---

## Fluxo de Dados

```
[Microfone] → MediaRecorder → Chunks → Blob
                                         ↓
                              [IndexedDB: workspace]
                                         ↓
                              [Gemini API] ← Context Memory
                                         ↓
                              [Output Formatado]
                                         ↓
                              [localStorage: transcrições]
```

---

## UI Layout

```
┌─────────────────────────────────────────────────┐
│ [Sidebar]     │ [Action Panel]   │ [Main View]  │
│               │                  │              │
│ - Workspace   │ - Context Scope  │ - Output     │
│ - Audio       │ - Audio Input    │ - Waveform   │
│ - Stats       │ - Style Select   │ - Controls   │
│ - History     │ - Actions        │              │
│ - Settings    │                  │              │
└─────────────────────────────────────────────────┘
```

**Breakpoints:**
- Mobile: Sidebar colapsada, tabs swipeable
- Tablet: Sidebar + Main View
- Desktop: Layout completo 3 colunas

---

## Decisões de Design

1. **Monolítico** - Projeto pequeno, não justifica component splitting prematuro
2. **CDN Tailwind** - Simplicidade sobre bundle optimization (AI Studio deploy)
3. **IndexedDB** - Persistência de blobs grandes (audio) sem backend
4. **Sem backend** - Client-side only, API key no ambiente

---

## Pontos de Extensão

Para escalar o projeto, considerar:

1. **Componentização** - Extrair Audio Engine, Gemini Client, Persistence como módulos
2. **State Management** - Zustand ou Jotai se estado ficar complexo
3. **Testing** - Vitest para unit tests do Audio Engine
4. **Linting** - ESLint + Prettier para consistência

---

## Ambiente

```bash
# Desenvolvimento
npm install
npm run dev          # http://localhost:3000

# Produção
npm run build
npm run preview
```

**Variável obrigatória:**
```
GEMINI_API_KEY=sua_chave_aqui
```
