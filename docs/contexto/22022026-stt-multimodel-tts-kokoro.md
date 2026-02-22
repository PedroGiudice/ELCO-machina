# Contexto: STT Multi-Model + TTS Kokoro Migration

**Data:** 2026-02-22
**Sessao:** work/session-20260222-131015 (main)
**Branch:** main (commits diretos)

---

## O que foi feito

### 1. whisper-server systemd (modelo warm em RAM)

Criado servico systemd user para whisper-server com modelo large-v3-turbo-q5_0.
Resultado: RTF caiu de ~2.5x (cold start) para ~1.1x (warm).

```ini
# ~/.config/systemd/user/whisper-server.service
ExecStart=~/.local/share/whisper.cpp/whisper-server \
    -m models/ggml-large-v3-turbo-q5_0.bin \
    --host 127.0.0.1 --port 8178 -t 8 --convert --vad \
    -vm models/ggml-silero-v6.2.0.bin -l pt
```

- `loginctl enable-linger opc` para persistencia
- ~850MB RAM, ativo e testado

### 2. stt_service.py reescrito para HTTP

Removido todo o codigo de subprocess whisper-cli. Engine primaria agora e whisper-server via httpx POST multipart. Fallback para faster-whisper se server indisponivel.

### 3. Multi-model STT

Adicionado segundo whisper-server instance (small-q5_1 na porta 8179, ~478MB RAM).

```python
# stt_service.py
WHISPER_SERVERS = {
    "large-v3-turbo": "http://127.0.0.1:8178",
    "small": "http://127.0.0.1:8179",
}
```

- `transcribe(model="small")` despacha para server correto
- `GET /transcribe/models` expoe lista com status warm/cold
- `stt_model` field no TranscribeRequest (opcional)
- Total ~1.3GB RAM para ambos servers (de 12GB livres)

### 4. Piper -> Kokoro migration

Todas as referencias a Piper TTS renomeadas para Kokoro em:
- `main.py`: PiperModelStatus -> TTSModelStatus, engine="kokoro"
- `synthesize.py`: `_synthesize_with_piper` -> `_synthesize_with_kokoro`, voice="pf_dora"
- `tts_service.py`: DEFAULT_VOICE exposto como class attribute

### 5. Notebook testbench atualizado

`~/notebooks/stt_testbench_cpu.ipynb`:
- 6 modelos GGML cold start (small/medium/large-v3-turbo, fp16 + quantizado)
- VAD Silero v6.2.0 (3 configs de threshold)
- whisper-server multi-model warm (large + small, httpx identico ao sidecar)
- TTS comparativo (Kokoro + Chatterbox)

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `sidecar/voice_ai/services/stt_service.py` | Reescrito - multi-model HTTP |
| `sidecar/voice_ai/routers/transcribe.py` | Modificado - stt_model field + /models endpoint |
| `sidecar/voice_ai/routers/synthesize.py` | Modificado - Piper->Kokoro |
| `sidecar/voice_ai/main.py` | Modificado - TTSModelStatus, backend field |
| `sidecar/voice_ai/services/tts_service.py` | Modificado - DEFAULT_VOICE class attr |
| `~/.config/systemd/user/whisper-server.service` | Criado |
| `~/.config/systemd/user/whisper-server-small.service` | Criado |
| `~/notebooks/stt_testbench_cpu.ipynb` | Atualizado - multi-model + multi-server |

## Commits desta sessao

```
59ed5ebb feat(stt): multi-model support via whisper-server instances
947139a6 refactor(sidecar): migrate Piper refs to Kokoro, align synthesize router
d95ac0cc feat(stt): migrate to whisper-server HTTP (warm model)
```

## Modelos GGML disponiveis

```
~/.local/share/whisper.cpp/models/
  ggml-small.bin               466 MB  (fp16)
  ggml-small-q5_1.bin          182 MB  (quantizado)
  ggml-medium.bin              1.5 GB  (fp16)
  ggml-medium-q5_0.bin         515 MB  (quantizado)
  ggml-large-v3-turbo-q5_0.bin 548 MB  (quantizado) <-- server warm :8178
  ggml-large-v3-turbo-q8_0.bin 834 MB  (quantizado)
  ggml-silero-v6.2.0.bin       865 KB  (VAD)
```

## Decisoes tomadas

- **Multi-server vs cold fallback**: usuario escolheu multi-server (small + large warm). RAM suficiente.
- **httpx (nao requests)**: consistencia com sidecar code. Sync client, nao async.
- **Notebook como testbench completo**: todos os modelos, quantizacoes, cold/warm, VAD. Dados > opiniao.
- **Kokoro como TTS local**: Piper removido. Vozes pf_dora (feminina) e pm_santa (masculina).

## Pendencias identificadas

1. **Rodar o notebook completo** -- celulas precisam ser executadas no Jupyter para coletar dados reais
2. **TTS: decisao de direcao** -- Kokoro funciona local (CPU), Chatterbox via Modal (GPU). Precisa definir se Chatterbox continua, se migra para local, ou se fica so Kokoro
3. **Frontend: selector de modelo STT** -- API pronta (`/transcribe/models`), mas frontend nao consome ainda
4. **Sidecar nao foi testado end-to-end** -- `soundfile` e deps precisam do venv do sidecar
