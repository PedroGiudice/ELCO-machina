# Contexto: Modal E2E validado + UI STT simplificada + proximos passos identificados

**Data:** 2026-03-04
**Sessao:** corrigir-melhorar-polir (continuacao)
**Branch:** main (merge de corrigir-melhorar-polir)

---

## O que foi feito

### 1. Tasks 6-8 do plano Modal STT concluidas

Plano: `docs/plans/2026-03-04-modal-stt-backend.md` -- COMPLETO.

- **Task 6:** modal SDK instalado no venv do sidecar (v1.3.5), adicionado ao requirements.txt
- **Task 7:** app `whisper-bench` deployada no Modal (persistente, `modal.Cls.from_name()` funciona)
- **Task 8:** teste e2e via curl validado:
  - Modal: 18.8s wall (7.1s inferencia) para 3m50s de audio. RTF 0.031
  - VM: funciona (regressao OK, whisper.cpp small)
  - Refinamento Claude CLI: funciona com `system_instruction`

### 2. Fix dotenv no sidecar

O `STTModalClient` verificava `os.environ.get("MODAL_TOKEN_ID")` mas ninguem carregava o `.env` do sidecar. Adicionado `load_dotenv()` no `main.py`. As credenciais ja estavam no `.env` (`MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`).

### 3. Build Android 0.3.0 instalado no Galaxy S24

APK debug compilado e instalado via ADB. Teste de transcricao feito com sucesso no celular (Modal selecionado, resultado em ~2min incluindo refinamento).

### 4. UI do PanelConfig simplificada

Removidos 3 controles confusos e redundantes:
- "Transcription Engine" (Auto/Local/Cloud) -- legado, nao reflete a arquitetura
- "Whisper Server" (URL + botao Testar) -- o URL ja esta configurado internamente
- Status "Local STT (Whisper small)" -- errado quando Modal selecionado

Mantido unico controle "STT Backend" com descricoes claras:
- VM: "whisper.cpp small (CPU, ~80s/min)"
- Modal: "large-v3-turbo (GPU, ~8s/min)"

PanelStats corrigido para mostrar backend real.

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `sidecar/requirements.txt` | Modificado - adicionado `modal>=1.0.0` |
| `sidecar/voice_ai/main.py` | Modificado - `load_dotenv()` no topo |
| `src/components/panels/PanelConfig.tsx` | Modificado - removidas props legadas, UI simplificada |
| `src/components/panels/PanelStats.tsx` | Modificado - removidas props legadas, status STT correto |
| `App.tsx` | Modificado - removidas props legadas do PanelConfig e PanelStats |
| `package.json` / `tauri.conf.json` | Modificado - versao 0.3.0 |

## Commits desta sessao

```
a08f1088 merge: corrigir-melhorar-polir -> main (UI STT simplificada)
0953278a refactor(ui): simplificar config STT -- unico controle VM/Modal
13e918b2 fix: remove arquivos acidentalmente commitados
3dd48aa6 chore: bump version to 0.3.0 (Modal STT, Foreground Service, dotenv)
ea5775d9 fix(sidecar): load_dotenv() para carregar credenciais Modal do .env
a2b558de chore(sidecar): add modal SDK dependency
```

## Pendencias identificadas (CRITICO)

### 1. Separar STT do refinamento no pipeline

Atualmente o endpoint `/transcribe` faz STT + refinamento numa unica chamada. Problemas:
- Nao da pra saber quanto tempo cada etapa leva separadamente
- Nao da pra usar o refiner isoladamente (ex: texto ja transcrito, so quer refinar)
- O usuario nao tem visibilidade do progresso (esta transcrevendo? refinando?)

**Proposta:** separar em dois endpoints ou duas etapas visiveis:
- `/transcribe` -- apenas STT (retorna texto bruto)
- `/refine` -- apenas refinamento (recebe texto, retorna refinado)
- Frontend chama sequencialmente, mostrando progresso de cada etapa

### 2. TTS sem opcoes no UI (Chatterbox/Kokoro)

O app nao permite ao usuario escolher entre Chatterbox (Modal GPU) e Kokoro (local). O PanelConfig nao tem controles de TTS. O usuario esta refatorando o script Chatterbox no Modal.

### 3. Foreground Service Android nao testado com tela bloqueada

APK instalado, transcricao funciona com app aberto, mas o teste real (gravar -> processar -> bloquear tela -> desbloquear -> verificar) nao foi completado.

### 4. POST_NOTIFICATIONS em runtime

Android 13+ requer request explicito de permissao. Feito via ADB mas nao no codigo. Sem isso, `startForeground` pode falhar em dispositivos sem a permissao.

## Decisoes tomadas

- **Modal deploy persistente:** `modal deploy` em vez de import direto. `modal.Cls.from_name()` exige app deployada.
- **dotenv no sidecar:** `load_dotenv()` no `main.py` e a solucao mais simples. Credenciais no `.env` que ja existia.
- **UI simplificada:** unico controle STT Backend substitui 3 controles confusos.
- **Nao rebuildar APK agora:** ha mudancas arquiteturais pendentes (separar STT/refiner, TTS) que justificam esperar.

## Infraestrutura Modal

- App `whisper-bench` deployada: `ap-4lzA4fJCdTSEyBeEyxIPR5`
- Credenciais: `~/.modal.toml` e `sidecar/.env`
- GPU: T4 (16GB VRAM), modelo large-v3-turbo
- Cold start: ~18s, warm: ~8s para 3m50s de audio
