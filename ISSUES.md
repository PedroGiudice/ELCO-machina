# Issues - ELCO-machina (Pro ATT Machine)

Registro de problemas, pendencias e melhorias identificadas.

---

## Abertos

### [009] Erro -3 no Whisper e Fallback "transcription"

- **Status:** Aberto (Critico - Regressao)
- **Data:** 2026-02-04
- **Severidade:** Critica
- **Descricao:** Transcricao falha silenciosamente retornando apenas a string "transcription".
- **ATENCAO:** Erro inedito. Transcricao funcionava antes. Nenhuma alteracao conhecida foi feita no pipeline STT ou no modelo Whisper. Requer investigacao profunda.
- **Logs sidecar:** Retorna erro 500: `RuntimeError: Falha ao carregar modelo Whisper: Error -3 while decompressing data: unknown compression method`.
- **Logs console (webview):** Plugin Store set mostra `null`. Nenhum erro de transcricao visivel (fallback mascara o erro).
- **Health check sidecar:** Status "healthy", Whisper: "available" (nao "loaded" - modelo nao consegue carregar).
- **Causa Raiz:** EM INVESTIGACAO. Hipoteses:
  1. Corrupcao no cache de modelos (`~/.cache/voice_ai/models`) - modelo de 1.5GB pode ter sido parcialmente baixado
  2. Incompatibilidade da biblioteca zlib/ctranslate2 no bundle PyInstaller apos rebuild do sidecar
  3. Mudanca no PyInstaller spec ou dependencias que afetou o empacotamento
  4. Versao do ctranslate2 incompativel com formato do modelo cached
- **Sintoma na UI:** O texto transcrito aparece apenas como a palavra "transcription" (fallback no frontend quando `result.text` e vazio).
- **Fluxo do erro:**
  1. Sidecar retorna HTTP 500 (Whisper nao carrega)
  2. Frontend catch: "Sidecar falhou, tentando Gemini..."
  3. Gemini fallback retorna vazio (API key possivelmente null)
  4. `useAudioProcessing.ts:229` -> `firstWords || 'transcription'` gera o texto "transcription"
- **Causa Raiz Confirmada:** Artefatos binários do `ctranslate2` e `tokenizers` ausentes no bundle PyInstaller. Os hooks padrão do PyInstaller não coletam automaticamente todas as shared libs necessárias no modo `--onefile`.
- **Evidência:** Modelo carrega perfeitamente fora do bundle (venv Python direto). Erro ocorre apenas no binário PyInstaller.
- **Solução Implementada:**
  1. Criado `sidecar/voice_ai.spec` com `collect_all` para `faster_whisper`, `ctranslate2`, `tokenizers`, `scipy`, `sklearn`
  2. Atualizado `sidecar/build-sidecar.sh` para usar o spec file em vez de args CLI
  3. Sidecar reconstruído e testado com sucesso (HTTP 200, Whisper loaded, sem erro -3)
- **Status:** Resolvido (aguardando rebuild DEB + teste do usuário)

---

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

---

### [004] Fluxo Whisper->Gemini nao esta claro na UI

- **Status:** Aberto
- **Data:** 2026-01-31
- **Severidade:** Media
- **Descricao:** O papel de cada componente nao esta claro para o usuario:
  - Whisper: transcreve audio para texto bruto
  - Gemini: transforma/refina o texto (ate no modo verbatim, faz ajustes pontuais)
- **Impacto:** Usuario pode desabilitar Gemini pensando que e redundante, perdendo qualidade.
- **Solucao proposta:** Melhorar UI para mostrar os dois estagios e permitir ver texto bruto vs refinado.

---

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

- **Status:** Aberto (Limitacao do Tauri/WebKitGTK)
- **Data:** 2026-02-04
- **Severidade:** Alta
- **Descricao:** `navigator.mediaDevices.getUserMedia()` retorna `NotAllowedError` no Linux Desktop porque o WebKitGTK nao tem handler de permissao configurado no Tauri.
- **Causa Raiz:** O Tauri nao implementa handler para o sinal `permission-request` do WebKitGTK, resultando em negacao automatica de todas as solicitacoes de permissao de midia.
- **Workaround Implementado:**
  1. App tenta usar `tauri-plugin-mic-recorder` (cpal nativo) primeiro
  2. Se falhar, cai no fallback Web API
  3. Mensagens de erro mais informativas adicionadas
- **Status Upstream:**
  - [GitHub Issue #10898](https://github.com/tauri-apps/tauri/issues/10898)
  - [GitHub Issue #8851](https://github.com/tauri-apps/tauri/issues/8851)
  - [WRY Issue #85](https://github.com/tauri-apps/wry/issues/85) - aguardando suporte upstream
- **Alternativa para usuarios:** Usar botao de upload de arquivo de audio em vez de gravacao direta.
- **Nota:** Plugin nativo funciona em maquinas Linux com hardware de audio. Esta VM (Oracle Cloud) nao tem placa de som.

---

## Em Progresso

(Nenhum no momento)

---

## Resolvidos

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

---

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

---

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

---

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