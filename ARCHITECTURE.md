# ARCHITECTURE.md

Documento técnico de referência para **Pro ATT Machine** (anteriormente gemini-prompt-architect).

---

## Visão Geral

Aplicação desktop/mobile nativa (via Tauri 2.0) que transcreve áudio em alta fidelidade usando Gemini 2.5 Flash, convertendo gravações em prompts formatados com múltiplos estilos de output.

**Plataformas:** Linux, Android (Windows/macOS possíveis)
**App ID:** `com.proatt.machine`

---

## Stack Técnica

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Runtime | Tauri | 2.9.5 |
| Backend | Rust | 1.77+ |
| Framework | React | 19.2.1 |
| Build | Vite | 6.2.0 |
| Linguagem | TypeScript | 5.8.2 |
| Styling | Tailwind CSS | CDN |
| AI | @google/genai | 1.31.0 |
| Icons | Lucide React | 0.556.0 |

### Plugins Tauri Instalados

| Plugin | Uso |
|--------|-----|
| dialog | Seleção/salvamento de arquivos |
| fs | Acesso ao filesystem |
| store | Persistência key-value |
| notification | Notificações nativas |
| clipboard-manager | Clipboard read/write |
| shell | Abrir URLs externas |

---

## Estrutura de Arquivos

```
/
├── App.tsx              # Componente principal (~2000 linhas)
├── index.tsx            # Entry point React
├── index.html           # Template HTML + CDN imports
├── vite.config.ts       # Config Vite (porta 3000, env vars)
├── tsconfig.json        # Config TypeScript
├── package.json         # Dependências
├── .env.local           # GEMINI_API_KEY (não commitado)
├── src-tauri/           # Backend Tauri (Rust)
│   ├── src/
│   │   ├── main.rs      # Entry point
│   │   └── lib.rs       # Plugins e commands
│   ├── Cargo.toml       # Dependências Rust
│   ├── tauri.conf.json  # Config Tauri
│   ├── capabilities/    # Permissões granulares
│   └── gen/
│       └── android/     # Projeto Android gerado
└── .claude/
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

---

## Arquitetura Modular (App Base)

Este app serve como **base** para integrar outros módulos de áudio. Padrões a seguir:

### Estrutura de Módulos (Futura)

```
src/
├── modules/
│   ├── transcriber/     # Módulo atual (Gemini Prompt Architect)
│   │   ├── index.tsx
│   │   ├── hooks/
│   │   └── components/
│   ├── recorder/        # Futuro: Gravador de áudio
│   └── editor/          # Futuro: Editor de áudio
├── shared/
│   ├── audio-engine/    # Web Audio API compartilhado
│   ├── persistence/     # IndexedDB/Store helpers
│   └── ui/              # Componentes UI base
└── App.tsx              # Router entre módulos
```

### Padrões de Frontend (Obrigatórios)

1. **Styling:** Tailwind CSS (classes utilitárias)
2. **Layout:** Sidebar + Action Panel + Main View
3. **Cores:** Tema escuro com accent color configurável
4. **Tipografia:** IBM Plex Sans (UI) + JetBrains Mono (code)
5. **Icons:** Lucide React

### Padrões de Áudio

1. **Captura:** MediaRecorder API
2. **Análise:** AudioContext + AnalyserNode
3. **Persistência:** IndexedDB para blobs
4. **Export:** WAV (PCM 16-bit), WebM

### Integração de Novo Módulo

```typescript
// 1. Criar módulo em src/modules/[nome]/
// 2. Exportar componente principal
export const MyModule: React.FC = () => { ... }

// 3. Adicionar rota no App.tsx
// 4. Adicionar entrada no sidebar
```

---

## Build Targets

| Plataforma | Comando | Output |
|------------|---------|--------|
| Linux | `cargo tauri build` | .deb, .rpm |
| Android | `cargo tauri android build --debug` | .apk |
| Dev | `bun run tauri dev` | Hot reload |

### Variáveis de Ambiente (Android)

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```
