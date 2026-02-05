# Issues - ELCO-machina (Pro ATT Machine)

Registro de problemas, pendencias e melhorias identificadas.

---

## Abertos

### [015] App Android trava constantemente no startup (Crash Loop)

- **Status:** Investigacao / Correcao Aplicada
- **Data:** 2026-02-05
- **Severidade:** Critica (Bloqueante)
- **Descricao:** O app Android fecha imediatamente apos abrir ou durante o uso inicial ("O app parou de funcionar").
- **Analise de Causa Raiz:**
  1. **Minificacao (ProGuard/R8):** O `build.gradle.kts` estava com `isMinifyEnabled = true` para builds de release. Isso frequentemente remove classes Java/Kotlin necessarias para plugins Tauri (via JNI) se as regras de keep nao estiverem perfeitamente configuradas. E a causa #1 de crashes "funciona em dev, quebra em release".
  2. **Inicializacao de Plugin:** `tauri-plugin-mic-recorder` e inicializado no startup. Se suas classes foram removidas pelo R8, ocorre `java.lang.ClassNotFoundException` ou `java.lang.NoSuchMethodError` no lado nativo, derrubando a VM Java e o app.
- **Acoes Tomadas:**
  1. **Desabilitada Minificacao:** Alterado `build.gradle.kts` para `isMinifyEnabled = false` em release.
  2. **Logging Ativado:** Alterado `lib.rs` para permitir inicializacao do plugin de log no Android mesmo em release, facilitando debug via `adb logcat`.
- **Proximos Passos:**
  - Gerar novo APK e testar.
  - Se o problema persistir, capturar logs via `adb logcat | grep com.proatt.machine`.

### [013] Piper TTS congela/crasha o app

- **Status:** Aberto (causa raiz identificada)
- **Data:** 2026-02-05
- **Severidade:** Alta
- **Descricao:** Ao acionar TTS com engine Piper, o app congela ou crasha completamente.
- **Causa raiz:** Plugins GStreamer ausentes no notebook (Ubuntu). O WebKitGTK depende do GStreamer para reproduzir áudio no WebView, e os pacotes essenciais não estão instalados.
- **Erros no terminal:**
  ```
  GStreamer element decodebin not found
  GStreamer element appsrc not found
  GStreamer element autoaudiosink not found
  The GStreamer FDK AAC plugin is missing
  ```
- **Solução:** Instalar no notebook:
  ```bash
  sudo apt install -y gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-tools
  ```
- **Nota:** Piper roda na VM e sintetiza áudio normalmente. O problema é exclusivamente na reprodução no lado do cliente (notebook).

### [002] Primeiro uso requer download de modelo (~1.5GB)

- **Status:** Aberto
- **Data:** 2026-01-31
- **Severidade:** Media
- **Descricao:** O modelo Whisper medium (1.5GB) e baixado na primeira requisicao de transcricao. Nao ha feedback visual para o usuario durante o download.
- **Sintoma:** Primeira transcricao parece travada por varios minutos.
- **Impacto:** Usuario pode pensar que o app travou e fechar.
- **Solucao proposta:**
  1. Adicionar tela de "primeiro uso" que baixa o modelo com barra de progresso
  2. Ou: bundlar o modelo no instalador (aumenta tamanho para ~1.7GB)

### [004] Fluxo Whisper->Gemini nao esta claro na UI

- **Status:** Aberto
- **Data:** 2026-01-31
- **Severidade:** Media
- **Descricao:** O papel de cada componente nao esta claro para o usuario:
  - Whisper: transcreve audio para texto bruto
  - Gemini: transforma/refina o texto (ate no modo verbatim, faz ajustes pontuais)
- **Impacto:** Usuario pode desabilitar Gemini pensando que e redundante, perdendo qualidade.
- **Solucao proposta:** Melhorar UI para mostrar os dois estagios e permitir ver texto bruto vs refinado.

### [005] Configuracao de API Key Gemini

- **Status:** Aberto
- **Data:** 2026-01-31
- **Severidade:** Media
- **Descricao:** A API key do Gemini precisa estar configurada para o refinamento funcionar. Se nao estiver, o texto bruto do Whisper e usado sem refinamento.
- **Arquivos afetados:** `.env.local` (nao commitado)
- **Verificacao necessaria:** Confirmar se a UI indica claramente quando o Gemini nao esta configurado.

---


---

### [006] Microfone nao funciona no Linux Desktop (WebKit2GTK)

- **Status:** Mitigado (workaround CPAL customizado)
- **Data:** 2026-02-04
- **Severidade:** Baixa (mitigada)
- **Descricao:** `navigator.mediaDevices.getUserMedia()` retorna `NotAllowedError` no Linux Desktop porque o WebKitGTK nao tem handler de permissao configurado no Tauri.
- **Causa Raiz:** O Tauri nao implementa handler para o sinal `permission-request` do WebKitGTK, resultando em negacao automatica de todas as solicitacoes de permissao de midia.
- **Workaround Implementado (v0.2.7+):**
  1. Gravacao via CPAL customizado (`src-tauri/src/audio.rs`) com selecao de dispositivo
  2. Comandos Tauri: `enumerate_audio_devices`, `start_audio_recording`, `stop_audio_recording`
  3. WAV forçado a 16-bit PCM para máxima compatibilidade com o sidecar
  4. Fallback para `tauri-plugin-mic-recorder` e Web API se CPAL falhar
- **Status Upstream:**
  - [GitHub Issue #10898](https://github.com/tauri-apps/tauri/issues/10898)
  - [GitHub Issue #8851](https://github.com/tauri-apps/tauri/issues/8851)
  - [WRY Issue #85](https://github.com/tauri-apps/wry/issues/85) - aguardando suporte upstream
- **Nota:** O workaround CPAL contorna completamente a limitação do WebKitGTK. A Web API continua bloqueada pelo WebKitGTK mas não é mais necessária.

---

## Em Progresso

(Nenhum no momento)

---

## Resolvidos

### [011] Transcrição retorna silêncio (WAV EXTENSIBLE + dispositivo errado)

- **Status:** Resolvido
- **Data:** 2026-02-05
- **Resolvido em:** 2026-02-05 (v0.2.9)
- **Severidade:** Crítica
- **Descrição:** Transcrição via Whisper retornava 0 caracteres. Na UI aparecia a palavra literal "transcription" (fallback hardcoded). O sidecar recebia áudio mas VAD filtrava tudo como silêncio.
- **Causa raiz (duas camadas):**
  1. **Dispositivo errado:** `tauri-plugin-mic-recorder` usava sempre `default_input_device()`, ignorando o dispositivo selecionado pelo usuário. O dispositivo padrão (built-in mic da VM) capturava silêncio.
  2. **Formato WAV incompatível:** `hound` crate gravava WAV com `WAVE_FORMAT_EXTENSIBLE` (format tag 65534) em 32-bit. O `soundfile`/libsndfile do sidecar Python não processava corretamente este formato, resultando em array de zeros.
- **Solução implementada:**
  1. Gravação customizada via CPAL (`src-tauri/src/audio.rs`) com seleção de dispositivo por nome
  2. WAV forçado a 16-bit PCM (format tag 1) - todos os formatos de entrada (i8/i16/i32/f32) convertidos para i16 via `FromSample<T>`
  3. Frontend usa `invoke('enumerate_audio_devices')` para listar e `invoke('start_audio_recording', { deviceLabel })` para gravar
- **Versões:** v0.2.7 (CPAL + seleção), v0.2.9 (fix 16-bit PCM)

### [012] Botão só clicável quando scroll está no final

- **Status:** Resolvido
- **Data:** 2026-02-05
- **Resolvido em:** 2026-02-05 (v0.2.9)
- **Severidade:** Média
- **Descrição:** O botão de ação (gravar/transcrever) só respondia a cliques quando o conteúdo estava scrollado até o final.
- **Causa raiz:** Barra de navegação inferior (nav bar) sobrepunha o conteúdo scrollável sem padding adequado.
- **Solução implementada:** Adicionado `pb-20` ao container scrollável em `AppLayout.tsx` para garantir que o conteúdo não fique atrás da nav bar.

### [014] Modal/Chatterbox TTS desabilitado (503)

- **Status:** Resolvido
- **Data:** 2026-02-05
- **Resolvido em:** 2026-02-05
- **Severidade:** Alta
- **Descricao:** TTS via Chatterbox/Modal retornava erro 503 (disabled). Health check mostrava `"modal": {"status": "disabled"}`.
- **Causa raiz:** Serviço systemd `voice-ai.service` não incluía variáveis de ambiente `MODAL_ENABLED`, `MODAL_TOKEN_ID` e `MODAL_TOKEN_SECRET`. A abordagem inicial via `EnvironmentFile` falhou por restrições do SELinux no Oracle Linux.
- **Solução implementada:** Credenciais adicionadas diretamente como linhas `Environment=` no service file (`/etc/systemd/system/voice-ai.service`). Após `daemon-reload` e restart, Modal/Chatterbox disponível.

### [009] Erro -3 no Whisper (bundle PyInstaller)

- **Status:** Resolvido
- **Data:** 2026-02-04
- **Resolvido em:** 2026-02-04
- **Severidade:** Critica
- **Descricao:** Whisper retornava `Error -3 while decompressing data` no binário PyInstaller.
- **Causa raiz:** Artefatos binários de `ctranslate2` e `tokenizers` ausentes no bundle PyInstaller.
- **Solução implementada:** Spec file com `collect_all` para dependências + sidecar migrado para serviço systemd (venv direto, sem PyInstaller).
- **Nota:** Issue superada pela migração para arquitetura remota (issue #010). Sidecar agora roda da venv Python diretamente, sem necessidade de PyInstaller.

### [010] Voice AI Sidecar nao roda na VM - App nao funciona no notebook

- **Status:** Resolvido
- **Data:** 2026-02-05
- **Resolvido em:** 2026-02-05
- **Severidade:** Critica
- **Descricao:** Sidecar estava empacotado no AppImage como processo local. O app tentava conectar na VM (100.114.203.28:8765) mas nada rodava lá.
- **Causa raiz:** Contradição arquitetural - sidecar foi implementado como componente local quando deveria rodar exclusivamente na VM (46GB RAM, 12 cores). Whisper medium é inviável em hardware de notebook.
- **Solucao implementada:**
  1. Serviço systemd `voice-ai.service` instalado na VM (auto-start no boot)
  2. `externalBin` removido do `tauri.conf.json` (AppImage 160MB mais leve)
  3. `SidecarManager` removido do `lib.rs` (stubs mantidos para compatibilidade)
  4. Frontend limpo: referências a "sidecar local" removidas
  5. Dependências `reqwest` e `tokio` removidas do Cargo.toml

### [007] TTS Settings sem botao de acionamento

- **Status:** Resolvido
- **Data:** 2026-02-04
- **Resolvido em:** 2026-02-04
- **Severidade:** Alta
- **Descricao:** As configuracoes de TTS (engine, profile, sliders) estao no Settings, mas nao existe botao visivel para acionar a leitura do texto.
- **Solucao implementada:**
  - Adicionado botao "Read/Stop" na toolbar do editor (entre MD e Copy)
  - Botao alterna entre Volume2 (Read) e VolumeX (Stop) conforme estado
  - Desabilitado quando sidecar indisponivel ou texto vazio
  - Estilizacao visual: vermelho quando falando, neutro quando parado

### [008] Editor de texto nao permite escrita

- **Status:** Resolvido
- **Data:** 2026-02-04
- **Resolvido em:** 2026-02-04
- **Severidade:** Alta
- **Descricao:** O editor de texto/preview principal nao permite escrita direta. Usuario nao consegue inputar texto para leitura TTS.
- **Solucao implementada:**
  - Textarea agora e sempre renderizado (antes so aparecia quando havia texto)
  - Adicionado placeholder: "Digite ou cole texto aqui para leitura..."
  - Icone decorativo (Feather/Terminal) movido para overlay com `pointer-events-none`
  - Usuario pode digitar/colar texto diretamente no editor

### [001] App nao gera texto - Sidecar nao inicia automaticamente

- **Status:** Resolvido
- **Data:** 2026-01-31
- **Resolvido em:** 2026-01-31
- **Commit:** `170afb69`
- **Severidade:** Critica
- **Descricao:** O app dependia do sidecar Python ser iniciado manualmente.
- **Solucao implementada:**
  - `lib.rs`: SidecarManager com auto-start, health monitoring (5s) e auto-restart
  - `VoiceAIClient.ts`: Fallback caso auto-start do Rust falhe
  - Sidecar agora inicia automaticamente com o app

### [003] Documentacao ARCHITECTURE.md desatualizada

- **Status:** Resolvido
- **Data:** 2026-01-31
- **Resolvido em:** 2026-01-31
- **Commit:** `170afb69`
- **Severidade:** Baixa
- **Descricao:** ARCHITECTURE.md nao documentava a arquitetura do sidecar.
- **Solucao implementada:**
  - ARCHITECTURE.md reescrito com documentacao completa
  - Inclui: fluxo de transcricao, SidecarManager, build do sidecar, troubleshooting

---

## Notas Tecnicas

### Arquitetura de Transcricao (Correta)

```
[Audio] -> Faster-Whisper (transcreve) -> [Texto bruto]
                                               |
                                               v
                                    Gemini (transforma/refina)
                                               |
                                               v
                                         [Texto final]
```

**Importante:** Gemini NAO e fallback. E componente essencial que transforma o texto bruto em output formatado conforme o estilo selecionado.

### Ambiente de Execucao

O modelo Faster-Whisper roda **nesta VM** (servidor de build e execucao):

| Recurso | Valor |
|---------|-------|
| **SO** | Oracle Linux 10.1 |
| **CPU** | Intel, 12 cores |
| **RAM** | 46 GB |
| **Disco** | SSD |

Esta VM e suficiente para rodar o modelo Whisper medium (1.5GB) com folga. Transcricao de 30s de audio leva ~3-5s em CPU.

### Stack Tecnica

- **Sidecar:** Python 3.12 + FastAPI + Faster-Whisper
- **Frontend:** React 19 + TypeScript + Vite
- **Desktop:** Tauri 2.9.5

---

## Historico

| Data | Issue | Acao |
|------|-------|------|
| 2026-01-31 | #001-#005 | Issues iniciais documentadas |
| 2026-01-31 | #001, #003 | Resolvidos via commit `170afb69` (SidecarManager + docs) |
| 2026-02-04 | #006 | Documentada limitacao WebKitGTK + melhorias no tratamento de erro |
| 2026-02-04 | #007, #008 | Issues TTS: sem botao de acionamento + editor nao editavel |
| 2026-02-04 | #007, #008 | Resolvidos: botao TTS na toolbar + editor sempre editavel |
| 2026-02-04 | #009 | Documentado bug crítico de loading do Whisper (Erro -3) |
| 2026-02-05 | #010 | Sidecar nao roda na VM - app nao funciona no notebook. Contradicao arquitetural: sidecar local vs processamento remoto |
| 2026-02-05 | #011-#013 | Novas issues: Whisper 0 caracteres, botao nao clicavel, Piper crash |
| 2026-02-05 | #014 | Modal/Chatterbox TTS desabilitado - corrigido via Environment= no systemd |
| 2026-02-05 | #015 | Crash no Android (ProGuard) - corrigido desabilitando minificação |
| 2026-02-05 | #011 | Resolvido: CPAL customizado + WAV 16-bit PCM (v0.2.7-v0.2.9) |
| 2026-02-05 | #012 | Resolvido: pb-20 no AppLayout (v0.2.9) |
| 2026-02-05 | #006 | Mitigado: workaround CPAL contorna limitação WebKitGTK |