# ELCO-machina (Pro ATT Machine) - Guia de Contexto Gemini

## Visão Geral do Projeto

**Pro ATT Machine** é uma aplicação multiplataforma (Linux Desktop, Android) projetada para transcrição de áudio de alta fidelidade e refinamento de texto. Combina processamento de IA local com aprimoramento em nuvem para transformar áudio falado em formatos de texto estruturados e de alta qualidade.

## Contexto Global e Regras (Multi-Repositório)

Este projeto segue as diretrizes globais do ambiente `opc`:

### Regras Mandatórias
*   **Idioma:** Todas as interações, documentação e commits devem ser em **Português Brasileiro (PT-BR)**.
*   **Emojis:** O uso de emojis é **estritamente proibido** em respostas e logs.
*   **Git Flow:** Commits atômicos e descritivos.

### Infraestrutura Compartilhada
*   **Ambiente Híbrido:** O desenvolvimento ocorre localmente (Notebook Linux), mas serviços pesados (como o Sidecar Whisper) são preferencialmente implantados na VM Oracle Cloud (`lw-pro` - IP Tailscale: `100.114.203.28`).
*   **Modal.com:** Utilizado para serviços de TTS (Text-to-Speech) de alta qualidade, similar à implementação no projeto *Picture Composer (HotCocoa)*.

### Insights de Outros Projetos
*   **ADK Sandboxed Legal:** Alerta sobre problemas recorrentes de permissão de sistema de arquivos (FS) no Tauri 2.x em Linux. Requer atenção especial na configuração de escopos em `tauri.conf.json`.
*   **Nano Banana:** O assistente possui capacidades integradas de geração e edição de imagens que podem ser usadas para assets do projeto.

## Arquitetura

### Core
*   **Frontend:** Construído com **React 19**, **TypeScript** e **Vite**. Utiliza uma arquitetura monolítica (um único `App.tsx` gerenciando a maior parte da lógica) para simplicidade. Estilização via **Tailwind CSS**.
*   **Runtime Desktop/Mobile:** **Tauri 2.0** (Rust) fornece o container nativo, integrações de sistema (sistema de arquivos, diálogos, área de transferência) e gerenciamento de plugins.

### Motor de Áudio (Híbrido)
*   **Desktop (Linux):** Implementação customizada em Rust em `src-tauri/src/audio.rs` usando `cpal` para captura de áudio bruta, contornando limitações de permissão do WebKitGTK.
*   **Mobile (Android):** Usa `tauri-plugin-mic-recorder` (implementação nativa Kotlin).
*   **Web Fallback:** Web Audio API padrão (`navigator.mediaDevices`).

### Sidecar Voice AI (Python)
*   Serviço **FastAPI** rodando **Faster-Whisper** para transcrição.
*   Pode rodar localmente (desktop) ou remotamente na VM Oracle para offload de inferência.
*   Integra-se com **Google Gemini** para refinamento e formatação de texto.

## Compilação e Execução

### Pré-requisitos
*   Node.js & npm/bun
*   Rust (última versão estável)
*   Python 3.12 (para sidecar)
*   Android Studio & SDK (para build mobile)
*   Dependências de sistema: `webkit2gtk`, `gstreamer`, `alsa-lib`, `openssl` (no Linux)

### Comandos de Desenvolvimento

| Comando | Descrição |
| :--- | :--- |
| `bun install` | Instala dependências do frontend |
| `bun run dev` | Inicia servidor de desenvolvimento Vite (apenas web) |
| `bun run tauri dev` | Inicia aplicação desktop Tauri em modo dev |
| `bun run tauri android dev` | Inicia aplicação Android Tauri em dispositivo/emulador conectado |

### Scripts de Build

O diretório `scripts/` contém scripts auxiliares para builds de produção (sempre prefira usar `bun`):

*   `bun run tauri build`: Gera binários de produção para a plataforma atual.
*   `bun run tauri android build`: Gera o APK/AAB para Android.
*   `scripts/build-linux.sh`: Gera AppImage e pacote Deb para Linux.
*   `scripts/build-android.sh`: Script customizado para build Android.

## Estrutura do Projeto

```
/
├── App.tsx                  # Componente React principal (UI e Lógica Monolítica)
├── src-tauri/               # Backend Rust & Configuração Tauri
│   ├── Cargo.toml           # Dependências Rust
│   ├── tauri.conf.json      # Config Tauri (permissões, bundle)
│   ├── src/                 # Código fonte Rust
│   └── gen/android/         # Projeto Android gerado
├── sidecar/                 # Serviço Voice AI em Python
│   ├── voice_ai/            # Código fonte FastAPI
│   └── voice-ai.service     # Arquivo de serviço Systemd para deploy remoto
├── scripts/                 # Scripts de automação de build
└── ISSUES.md                # Rastreador de problemas e histórico
```

## Convenções de Desenvolvimento

*   **Frontend Monolítico:** A lógica do frontend está concentrada em `App.tsx`. Refatoração para componentes menores/hooks é um objetivo de longo prazo, mas atualmente `App.tsx` é a fonte da verdade para o estado da UI.
*   **Stack de Áudio Híbrida:**
    *   **Desktop:** Usa `cpal` diretamente no Rust (`audio.rs`).
    *   **Android:** Usa `tauri-plugin-mic-recorder`.
*   **Sidecar Remoto:** A configuração de produção preferida coloca o processamento pesado de IA em uma VM remota (Oracle Cloud), acessada via Tailscale (`100.114.203.28`), em vez de empacotar o modelo de 2GB+ no cliente.
*   **Processo de Release:** Builds Android atualmente têm **minificação desabilitada** (`isMinifyEnabled = false`) para evitar que o ProGuard remova classes de plugins nativos.

## Problemas Conhecidos e Contexto

*   **Crash no Android:** Builds de release no Android devem ter minificação desabilitada. O ProGuard remove agressivamente classes do `tauri-plugin-mic-recorder`, causando crashes na inicialização.
*   **Erro no Modelo Whisper:** Há uma regressão conhecida onde o modelo Whisper falha ao carregar com "Error -3" (erro de descompressão). Isso está sob investigação.
*   **Fallback do Sidecar:** Se o sidecar estiver inacessível, o app deve fazer fallback para processamento apenas via Gemini (se aplicável) ou mostrar um estado de erro claro.