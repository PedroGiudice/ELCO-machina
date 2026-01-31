# Issues - ELCO-machina (Pro ATT Machine)

Registro de problemas, pendencias e melhorias identificadas.

---

## Abertos

### [001] App nao gera texto - Sidecar nao inicia automaticamente

- **Status:** Aberto
- **Data:** 2026-01-31
- **Severidade:** Critica
- **Descricao:** O app depende do sidecar Python (Faster-Whisper) para transcricao, mas o sidecar precisa ser iniciado manualmente em terminal separado. Sem ele, nenhuma transcricao funciona.
- **Sintoma:** Usuario grava audio, clica em transcrever, nada acontece. UI mostra "Sidecar offline".
- **Causa raiz:** O Tauri nao inicia o sidecar automaticamente. Requer dois terminais manuais.
- **Impacto:** App inutilizavel para usuario final sem conhecimento tecnico.
- **Solucao proposta:** Implementar bundled sidecar ou processo filho gerenciado pelo Tauri.

**Workaround atual:**
```bash
# Terminal 1 - Sidecar
cd ~/ELCO-machina/sidecar
source .venv/bin/activate
uvicorn voice_ai.main:app --host 127.0.0.1 --port 8765

# Terminal 2 - Frontend
cd ~/ELCO-machina
npm run dev
```

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

### [003] Documentacao ARCHITECTURE.md desatualizada

- **Status:** Aberto
- **Data:** 2026-01-31
- **Severidade:** Baixa
- **Descricao:** O arquivo ARCHITECTURE.md ainda menciona Gemini como unica opcao de transcricao e nao documenta a arquitetura do sidecar.
- **Arquivos afetados:**
  - `ARCHITECTURE.md` - Falta secao sobre sidecar
  - `CLAUDE.md` - IP da VM desatualizado
- **Solucao proposta:** Atualizar documentacao para refletir arquitetura atual (Whisper local + Gemini para refinamento).

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

## Em Progresso

(Nenhum no momento)

---

## Resolvidos

(Nenhum no momento)

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
