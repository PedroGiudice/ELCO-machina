# Retomada: STT Multi-Model Tests + TTS Direction

## Contexto rapido

O sidecar voice_ai foi migrado de whisper-cli subprocess para whisper-server HTTP
(modelo warm em RAM). Agora suporta multi-modelo: large-v3-turbo na porta 8178 e
small na 8179, ambos como systemd services. O usuario escolhe modelo por request
via campo `stt_model`. Todas as refs Piper foram migradas para Kokoro TTS.

O notebook testbench (`~/notebooks/stt_testbench_cpu.ipynb`) foi reescrito com
todos os modelos GGML (6 variantes), VAD, multi-server warm, e TTS comparativo.
Precisa ser executado para coletar dados reais.

O codigo foi commitado em main (3 commits: `d95ac0cc`, `947139a6`, `59ed5ebb`)
mas o sidecar nao foi testado end-to-end (falta rodar com venv).

## Arquivos principais

- `sidecar/voice_ai/services/stt_service.py` -- STTService com WHISPER_SERVERS dict, multi-model
- `sidecar/voice_ai/routers/transcribe.py` -- endpoint POST /transcribe (stt_model) + GET /models
- `sidecar/voice_ai/routers/synthesize.py` -- TTS Kokoro + Modal/Chatterbox
- `sidecar/voice_ai/main.py` -- lifespan, health, middleware
- `~/notebooks/stt_testbench_cpu.ipynb` -- testbench completo STT + TTS
- `docs/contexto/22022026-stt-multimodel-tts-kokoro.md` -- contexto detalhado

## Proximos passos (por prioridade)

### 1. Testar sidecar end-to-end no venv
**Onde:** `sidecar/`
**O que:** Subir o sidecar com uvicorn, testar /health, /transcribe (com ambos modelos), /transcribe/models
**Por que:** O codigo foi commitado mas nao validado com o runtime real (deps no venv)
**Verificar:**
```bash
cd ~/ELCO-machina/sidecar
source .venv/bin/activate  # ou uv venv
uvicorn voice_ai.main:app --host 0.0.0.0 --port 8765
# Em outro terminal:
curl http://localhost:8765/health
curl http://localhost:8765/transcribe/models
```

### 2. Rodar notebook testbench completo
**Onde:** `~/notebooks/stt_testbench_cpu.ipynb`
**O que:** Executar todas as celulas sequencialmente. Coletar dados de benchmark.
**Por que:** O notebook tem o codigo mas nenhum dado real ainda. O objetivo e ter numeros concretos de RTF, qualidade, e tradeoffs entre modelos.
**Verificar:** Todas as celulas executam sem erro, tabelas e graficos gerados.

### 3. Definir direcao do TTS
**Onde:** Decisao arquitetural
**O que:** Decidir o futuro do TTS no sidecar. Opcoes:
  - **A. So Kokoro local** -- simples, zero custo, 2 vozes PT-BR, RTF < 1.0 em CPU
  - **B. Kokoro local + Chatterbox Modal** -- como esta hoje. Clonagem de voz via GPU cloud (custo por uso)
  - **C. Kokoro local + Chatterbox local** -- clonagem em CPU (RTF alto, ~5-10x, mas sem custo)
**Por que:** Chatterbox via Modal tem custo e complexidade. Precisa de dados do notebook para decidir.
**Verificar:** Rodar celula TTS do notebook, avaliar qualidade das vozes e RTF.

### 4. Frontend: selector de modelo STT
**Onde:** Frontend React (ELCO-machina)
**O que:** Consumir `GET /transcribe/models`, mostrar selector com indicador warm/cold
**Por que:** API pronta, falta UI. Usuario precisa poder escolher entre small (rapido) e large (qualidade).
**Verificar:** Selector funcional, request com `stt_model` chegando no sidecar.

## Como verificar

```bash
# Servers rodando
systemctl --user status whisper-server whisper-server-small

# RAM total
free -h

# Health do sidecar (se rodando)
curl -s http://localhost:8765/health | python3 -m json.tool

# Modelos disponiveis
curl -s http://localhost:8765/transcribe/models | python3 -m json.tool

# Test transcricao com modelo especifico
curl -X POST http://localhost:8765/transcribe \
  -H 'Content-Type: application/json' \
  -d '{"audio": "<base64>", "format": "wav", "stt_model": "small"}'
```
