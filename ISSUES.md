# Issues - ELCO-machina (Pro ATT Machine)

Registro de problemas, pendencias e melhorias identificadas.

---

## Abertos

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
