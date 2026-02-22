# Retomada: Upgrade do modelo Whisper no sidecar para large-v3-turbo

## Contexto rapido

O sidecar Voice AI (FastAPI + faster-whisper) roda na VM Contabo (`100.123.73.128:8765`)
e serve transcricao STT para o app ELCO-machina (desktop e Android). Atualmente usa o
modelo `medium`. O objetivo e trocar para `large-v3-turbo` (ou `large-v3`) do
faster-whisper para melhor qualidade de transcricao.

Na sessao anterior, resolvemos o bloqueio de Private Network Access no Android --
o app agora faz HTTP via proxy Rust IPC (`proxy_fetch`). A transcricao funciona
end-to-end no celular. O proximo passo e melhorar a qualidade do modelo.

## Arquivos principais

- `sidecar/voice_ai/main.py` -- entry point do FastAPI, configura logging
- `sidecar/voice_ai/stt.py` ou equivalente -- carregamento do modelo Whisper, endpoint `/transcribe`
- `sidecar/requirements.txt` ou `pyproject.toml` -- dependencias Python
- `docs/contexto/22022026-android-proxy-fetch-pna.md` -- contexto da sessao anterior

## Proximos passos (por prioridade)

### 1. Identificar onde o modelo Whisper e configurado no sidecar

**Onde:** `sidecar/voice_ai/` -- procurar por `medium`, `model_size`, `WhisperModel`
**O que:** encontrar a variavel/config que define o modelo e trocar para `large-v3-turbo`
**Por que:** `large-v3-turbo` tem qualidade proxima ao large-v3 com velocidade proxima ao medium
**Verificar:**
```bash
curl -s http://100.123.73.128:8765/health | python3 -m json.tool
# Deve mostrar: "model": "large-v3-turbo"
```

### 2. Verificar VRAM/RAM disponivel

**Onde:** VM Contabo
**O que:** `large-v3-turbo` precisa de ~3GB RAM (CPU mode) ou ~2GB VRAM (GPU). Verificar se ha recursos.
**Verificar:**
```bash
free -h
nvidia-smi  # se tiver GPU
```

### 3. Reiniciar o sidecar com o novo modelo

**Onde:** processo Python pid 75732 (pode ter mudado)
**O que:** parar o sidecar atual, reiniciar com o novo modelo
**Verificar:**
```bash
ps aux | grep voice_ai
curl -s http://100.123.73.128:8765/health | python3 -m json.tool
```

### 4. Testar transcricao end-to-end no Android

**O que:** abrir o app no Galaxy S24, gravar audio curto, verificar que transcricao funciona
**Verificar:** texto aparece na UI apos transcricao

### 5. (Secundario) Investigar texto nao aparecendo na aba Editor

Na sessao anterior, o usuario reportou que o botao Transcribe funciona (sidecar processa)
mas o texto nao aparece na aba Editor. Pode ser um bug no fluxo de dados entre componentes.
Verificar `src/` por como o resultado da transcricao e passado para o Editor.

## Como verificar

```bash
# Health check do sidecar
curl -s http://100.123.73.128:8765/health | python3 -m json.tool

# Verificar modelo carregado
curl -s http://100.123.73.128:8765/health | grep -o '"model":"[^"]*"'

# Teste rapido de transcricao (se tiver audio de teste)
curl -X POST http://100.123.73.128:8765/transcribe \
  -H "Content-Type: application/json" \
  -d '{"audio":"<base64>","format":"wav","language":"pt"}'
```
