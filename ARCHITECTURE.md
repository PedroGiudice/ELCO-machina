# ARCHITECTURE.md

Documento tecnico de referencia para **Pro ATT Machine** (anteriormente gemini-prompt-architect).

---

## Visao Geral

Aplicacao desktop/mobile nativa (via Tauri 2.0) que transcreve audio em alta fidelidade usando **Faster-Whisper** (local) com refinamento opcional via **Gemini**, convertendo gravacoes em prompts formatados com multiplos estilos de output.

**Plataformas:** Linux, Android (Windows/macOS possiveis)
**App ID:** `com.proatt.machine`

---

## Stack Tecnica

| Camada | Tecnologia | Versao |
|--------|------------|--------|
| Runtime | Tauri | 2.9.5 |
| Backend | Rust | 1.77+ |
| Framework | React | 19.2.1 |
| Build | Vite | 6.2.0 |
| Linguagem | TypeScript | 5.8.2 |
| Styling | Tailwind CSS | CDN |
| AI Cloud | @google/genai | 1.31.0 |
| AI Local | FastAPI | 0.115.0 |
| STT Engine | Faster-Whisper | 1.0.3 |
| Icons | Lucide React | 0.556.0 |

### Plugins Tauri Instalados

| Plugin | Uso |
|--------|-----|
| dialog | Selecao/salvamento de arquivos |
| fs | Acesso ao filesystem |
| store | Persistencia key-value |
| notification | Notificacoes nativas |
| clipboard-manager | Clipboard read/write |
| shell | Execucao de sidecar e URLs externas |
| process | Controle do ciclo de vida do app |
| updater | Auto-update do aplicativo |
| mic-recorder | Gravacao nativa de audio |

---

## Arquitetura Voice AI Sidecar

O app utiliza um **sidecar Python** para transcricao local de alta performance, evitando latencia de rede e custos de API.

### Por que um Sidecar?

| Aspecto | Rust (Tauri) | Python (Sidecar) |
|---------|--------------|------------------|
| Modelos ML | Complexo | Nativo (PyTorch, ONNX) |
| Faster-Whisper | Nao disponivel | Suporte completo |
| Hot reload | Recompilacao | Imediato |
| Tamanho | Leve | ~150MB (com modelo) |

### Comunicacao

```
┌─────────────────────────────────────────────────────────┐
│ Tauri App (Rust)                                        │
│  ├─ SidecarManager                                      │
│  │   ├─ Auto-start no setup()                          │
│  │   ├─ Health check a cada 5s                         │
│  │   └─ Auto-restart se sidecar morrer                 │
│  └─ Commands: start_sidecar, stop_sidecar, sidecar_status│
└─────────────────────────────────────────────────────────┘
         │
         │ HTTP localhost:8765
         ▼
┌─────────────────────────────────────────────────────────┐
│ Sidecar (voice-ai-sidecar)                              │
│  ├─ FastAPI + uvicorn                                   │
│  ├─ Faster-Whisper (modelo medium)                      │
│  └─ Endpoints:                                          │
│      ├─ GET  /health       → Status e modelos          │
│      └─ POST /transcribe   → Transcricao de audio      │
└─────────────────────────────────────────────────────────┘
```

### Ciclo de Vida do Sidecar

1. **App inicia** → `lib.rs::setup()` dispara `monitor_sidecar()`
2. **Monitor spawna sidecar** → Aguarda 3s para FastAPI inicializar
3. **Health check loop** → A cada 5s verifica `GET /health`
4. **Falha detectada** → Apos 2 falhas consecutivas, reinicia sidecar
5. **App fecha** → `on_window_event(CloseRequested)` mata processo

### Endpoints do Sidecar

#### GET /health
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "models": {
    "whisper": { "status": "loaded", "model": "medium" },
    "xtts": { "status": "not_implemented", "model": null }
  }
}
```

#### POST /transcribe
```json
// Request
{
  "audio": "base64...",
  "format": "webm",
  "language": "pt",
  "refine": true,
  "style": "elegant_prose"
}

// Response
{
  "text": "Transcricao bruta do Whisper",
  "refined_text": "Texto refinado pelo Gemini (se refine=true)",
  "language": "pt",
  "confidence": 0.95,
  "duration": 12.5,
  "segments": [...]
}
```

---

## Estrutura de Arquivos

```
/
├── App.tsx                  # Componente principal (~2000 linhas)
├── index.tsx                # Entry point React
├── index.html               # Template HTML + CDN imports
├── vite.config.ts           # Config Vite (porta 3000, env vars)
├── package.json             # Dependencias frontend
├── .env.local               # GEMINI_API_KEY (nao commitado)
├── src/
│   └── services/
│       └── VoiceAIClient.ts # Cliente HTTP para sidecar
├── src-tauri/               # Backend Tauri (Rust)
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   └── lib.rs           # SidecarManager + commands
│   ├── Cargo.toml           # Dependencias Rust
│   ├── tauri.conf.json      # Config Tauri
│   ├── binaries/            # Sidecar compilado
│   │   └── voice-ai-sidecar-x86_64-unknown-linux-gnu
│   ├── capabilities/        # Permissoes granulares
│   └── gen/
│       └── android/         # Projeto Android gerado
├── sidecar/                 # Voice AI Sidecar (Python)
│   ├── voice_ai/
│   │   ├── main.py          # Entry point FastAPI
│   │   ├── transcriber.py   # Wrapper Faster-Whisper
│   │   └── refiner.py       # Integracao Gemini
│   ├── requirements.txt     # Dependencias Python
│   ├── build-sidecar.sh     # Build com PyInstaller
│   └── run-dev.sh           # Execucao em dev
└── .claude/
    └── settings.local.json
```

---

## Arquitetura do App.tsx

O componente e **monolitico por design** (SPA simples). Quatro modulos logicos:

### 1. Audio Engine (Web Audio API + Tauri Plugin)

```
MediaRecorder → AudioChunks → Blob → IndexedDB
      ↓
Tauri mic-recorder (Android)
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

### 2. Voice AI Client (Transcricao)

```
AudioBlob
    ↓
Base64 encode
    ↓
VoiceAIClient.transcribe()
    ↓
┌──────────────────────────────────────┐
│ Sidecar disponivel?                  │
│   SIM → POST /transcribe             │
│         ├─ Faster-Whisper (STT)      │
│         └─ Gemini (refinamento)      │
│   NAO → Fallback: Gemini direto      │
└──────────────────────────────────────┘
    ↓
Texto formatado
```

### 3. Gemini Integration (Refinamento + Fallback)

```
Texto bruto (do Whisper ou audio)
    ↓
System Prompt (style-specific)
    ↓
Context Memory (multi-turn)
    ↓
Gemini API
    ↓
Texto refinado
```

**Estilos de Output:**
| Modo | Uso |
|------|-----|
| Verbatim | Transcricao literal |
| Elegant Prose | Estilo literario |
| Prompt Engineering | Formato Claude/Gemini |
| Code | Geracao de codigo |
| Technical Docs | Documentacao tecnica |

### 4. Persistencia

```
IndexedDB (GeminiArchitectDB v2)
├── workspace    → Audio blobs
└── contexts     → Context memory pools

localStorage
├── API key (criptografada via Tauri Store)
├── Modelo selecionado
├── Modo transcricao (auto/local/cloud)
└── Transcricoes recentes

Tauri Store
├── history.json → Historico de transcricoes
└── api-key.json → Chave Gemini (segura)
```

---

## Fluxo de Dados (Completo)

```
[Microfone] → MediaRecorder → Chunks → Blob
                                         ↓
                              [IndexedDB: workspace]
                                         ↓
                              [VoiceAIClient]
                                         ↓
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
            [Sidecar: Whisper]                        [Fallback: Gemini]
                    ↓                                         ↓
            Texto transcrito                          Texto transcrito
                    ↓
            [Refinamento Gemini] (opcional)
                    ↓
            [Output Formatado]
                    ↓
            [localStorage + History]
```

---

## Gerenciamento do Sidecar (lib.rs)

### Estado Compartilhado

```rust
struct SidecarManager {
    child: Arc<Mutex<Option<CommandChild>>>,  // Processo do sidecar
    should_run: Arc<Mutex<bool>>,             // Flag para parar loop
    remote_url: Arc<Mutex<Option<String>>>,   // URL servidor remoto
}
```

### Comandos Tauri Expostos

| Comando | Descricao |
|---------|-----------|
| `start_sidecar` | Inicia sidecar manualmente |
| `stop_sidecar` | Para sidecar e flag should_run=false |
| `sidecar_status` | Retorna true se processo existe |
| `set_whisper_url` | Define URL do servidor remoto (para monitor) |
| `is_remote_whisper` | Retorna true se usando servidor remoto |

### Fluxo de Monitoramento

```rust
async fn monitor_sidecar(app, manager) {
    // 1. Spawn inicial
    spawn_sidecar(&app, &manager).await;

    // 2. Loop de health check
    loop {
        if !should_run { break; }

        if !check_sidecar_health().await {
            consecutive_failures += 1;
            if consecutive_failures >= 2 {
                spawn_sidecar(&app, &manager).await;
            }
        } else {
            consecutive_failures = 0;
        }

        sleep(5s).await;
    }
}
```

---

## Servidor Whisper Centralizado

O app suporta **servidor Whisper remoto** para cenarios onde o sidecar local nao esta disponivel (Android) ou para centralizar processamento.

### Arquitetura de Rede

```
[Desktop Linux] ──┐
                  ├──► [VM Oracle :8765] ──► Whisper ──► Texto
[Android APK]  ──┘         via Tailscale                  │
                                                          ▼
                                                    [Gemini] ──► Refinamento
```

### Modos de Operacao

| Modo | Sidecar Local | Servidor Remoto | Fallback |
|------|---------------|-----------------|----------|
| Desktop (padrao) | Auto-start | Opcional | Gemini |
| Desktop (remoto) | Desativado | URL configurada | Gemini |
| Android | N/A | Obrigatorio | Gemini |

### Configuracao do Servidor

1. **Na VM (servidor):**
```bash
# Copiar arquivo de servico
sudo cp sidecar/voice-ai.service /etc/systemd/system/

# Habilitar e iniciar
sudo systemctl enable voice-ai
sudo systemctl start voice-ai

# Verificar status
sudo systemctl status voice-ai
curl http://127.0.0.1:8765/health
```

2. **No Cliente (app):**
   - Settings > Whisper Server
   - URL: `http://100.114.203.28:8765` (via Tailscale)
   - Clicar "Testar" para validar conexao

### Variaveis de Ambiente do Sidecar

| Variavel | Padrao | Descricao |
|----------|--------|-----------|
| `VOICE_AI_HOST` | `127.0.0.1` | Bind address (usar `0.0.0.0` para acesso externo) |
| `VOICE_AI_PORT` | `8765` | Porta HTTP |

### Seguranca

- **Rede:** Acesso restrito via Tailscale VPN (100.x.x.x)
- **Firewall:** Porta 8765 **nao** exposta na internet publica
- **CORS:** Configurado para aceitar requisicoes de qualquer origem (apps Tauri)

### Fluxo com Servidor Remoto

```
[App]
  │
  ├─ localStorage: whisper_server_url = "http://100.114.203.28:8765"
  │
  ├─ VoiceAIClient: setVoiceAIUrl(url)
  │
  ├─ Rust: set_whisper_url(url) → para monitor loop local
  │
  └─ Frontend: POST http://100.114.203.28:8765/transcribe
                     │
                     ▼
               [Servidor Remoto]
                     │
                     └─ Whisper (medium) → Texto
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
│ - History     │ - Mode (Local/   │              │
│ - Settings    │   Cloud/Auto)    │              │
└─────────────────────────────────────────────────┘
```

**Breakpoints:**
- Mobile: Sidebar colapsada, tabs swipeable
- Tablet: Sidebar + Main View
- Desktop: Layout completo 3 colunas

---

## Decisoes de Design

1. **Sidecar Python** - ML funciona melhor em Python; Rust gerencia ciclo de vida
2. **Monolitico frontend** - Projeto pequeno, nao justifica component splitting prematuro
3. **CDN Tailwind** - Simplicidade sobre bundle optimization
4. **Auto-restart** - Sidecar pode crashar; monitoramento garante disponibilidade
5. **Fallback Gemini** - Se sidecar falhar, app continua funcional via cloud

---

## Como Executar

### Desenvolvimento (2 terminais)

```bash
# Terminal 1: Sidecar Python
cd sidecar
./run-dev.sh

# Terminal 2: App Tauri
npm run tauri dev
```

### Producao (sidecar automatico)

```bash
# Build do sidecar (uma vez)
cd sidecar
./build-sidecar.sh

# Build do app (inclui sidecar)
npm run tauri build

# Executar - sidecar inicia automaticamente
./src-tauri/target/release/pro-att-machine
```

---

## Build Targets

| Plataforma | Comando | Output |
|------------|---------|--------|
| Linux | `cargo tauri build` | .deb, .rpm |
| Android | `cargo tauri android build` | .apk |
| Dev | `npm run tauri dev` | Hot reload |

### Build do Sidecar

```bash
cd sidecar
./build-sidecar.sh

# Output: src-tauri/binaries/voice-ai-sidecar-x86_64-unknown-linux-gnu
# Tamanho: ~150MB (inclui modelo Whisper)
```

---

## Variaveis de Ambiente

```bash
# Obrigatoria para refinamento e fallback
GEMINI_API_KEY=sua_chave_aqui

# Android (se building para Android)
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

---

## Troubleshooting

### Sidecar nao inicia

1. Verificar se binario existe: `ls src-tauri/binaries/`
2. Verificar permissao: `chmod +x src-tauri/binaries/voice-ai-sidecar-*`
3. Testar manualmente: `./src-tauri/binaries/voice-ai-sidecar-x86_64-unknown-linux-gnu`
4. Verificar logs do Tauri (tags `[sidecar]`)

### Porta 8765 ocupada

```bash
# Verificar processo
lsof -i :8765

# Matar processo
kill $(lsof -t -i :8765)
```

### Modelo Whisper nao carrega

- Primeiro uso: download automatico (~1.5GB para medium)
- Verificar espaco em disco
- Verificar conexao de internet no primeiro uso
