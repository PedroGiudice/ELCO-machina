# Retomada: TTS vLLM-Omni + Qwen3-Omni Multi-Purpose

## Contexto rapido

Deploy de Qwen3-TTS via vLLM-Omni no Modal foi 95% completado. GPU snapshot funciona
(pattern Chandra: subprocess HTTP + sleep/wake). Versoes criticas: `vllm==0.16.0 +
vllm-omni==0.16.0` (devem ser 1:1). O ultimo blocker e o formato do `ref_audio` na
API `/v1/audio/speech` — precisa ser data URL (`data:audio/wav;base64,...`), nao base64 cru.
Fix ja aplicado no script, falta testar.

Ideia estrategica levantada no final da sessao: **Qwen3-Omni** (~7B) como modelo unico
que faz STT + TTS + texto + imagem, substituindo Whisper + Qwen3-TTS + Chatterbox.
Consolidaria 3+ deploys em 1, com um unico endpoint multimodal.

## Arquivos principais

- `scripts/modal_tts_qwen_vllm_snap.py` — script principal (HTTP+snap, H100)
- `scripts/modal_tts_qwen_vllm.py` — versao offline (Omni class, funcional, sem snap)
- `scripts/modal_tts_qwen_native.py` — SDK nativo (backup, prod atual)
- `scripts/modal_tts_chatterbox.py` — Chatterbox com volume ref
- `docs/contexto/22032026-tts-vllm-omni-optimization.md` — contexto detalhado

## Proximos passos (por prioridade)

### 1. Testar fix de ref_audio data URL
**Onde:** `scripts/modal_tts_qwen_vllm_snap.py`, linha com `data:audio/wav;base64,`
**O que:** O deploy mais recente ja tem o fix. Rodar curl pra validar que audio e gerado.
**Por que:** Ultimo blocker antes de ter vLLM-Omni funcional com snapshot.
**Verificar:**
```bash
# Upload voice ref (se nao feito)
modal volume put tts-voice-refs docs/ref_ptbr_male.wav ref_ptbr_male.wav

# Testar (segundo request usa snapshot)
curl -X POST https://pedrogiudice--tts-serve-vllm-ttsservice-web-synthesize.modal.run \
  -F "text=Bom dia! Hoje é um dia especial." \
  -F "ref_audio_path=ref_ptbr_male.wav" \
  -F "language=Portuguese" \
  -o /tmp/vllm_test.wav -w "\nHTTP %{http_code} | Time: %{time_total}s\n"

file /tmp/vllm_test.wav  # Deve ser "RIFF (little-endian) data, WAVE audio"
```

### 2. Comparar qualidade e velocidade vs nativo
**Onde:** Terminal, mesmos textos acentuados
**O que:** Gerar audio com ambos (nativo em tts-serve, vLLM em tts-serve-vllm), comparar
**Por que:** vLLM pode ter qualidade diferente (sampling params diferentes)
**Verificar:** Ouvir ambos, comparar X-Inference-Time nos headers

### 3. Investigar Qwen3-Omni multi-purpose
**Onde:** https://github.com/vllm-project/vllm-omni (exemplos em `examples/online_serving/qwen3_omni/`)
**O que:** Avaliar se Qwen3-Omni (~7B) pode substituir Whisper (STT) + Qwen3-TTS (TTS) com um unico deploy
**Por que:** Consolidaria 3+ deploys Modal em 1. Menos endpoints, menos custo operacional, modelo unico multi-modal
**Verificar:** Checar: (a) qualidade STT em PT-BR vs Whisper, (b) qualidade TTS vs Qwen3-TTS-Base, (c) VRAM em H100

### 4. Trocar TtsService.php para tts-serve-vllm
**Onde:** `app/Services/TtsService.php`, `.env`
**O que:** Quando vLLM-Omni funcionar, trocar QWEN_TTS_ENDPOINT para tts-serve-vllm
**Por que:** Inferencia ~25x mais rapida (33s → ~1s) com cold start ~1-2s
**Verificar:** Testes PHPUnit (`php artisan test --filter=TtsService`)

### 5. Cleanup de apps Modal
**Onde:** Modal dashboard
**O que:** Remover `tts-vllm-snap-test` (validacao), apps stopped
**Por que:** Liberar endpoint slots (limite de 8)
**Verificar:** `modal app list`

## Dados criticos para lembrar

**Versoes que funcionam:**
- `vllm==0.16.0` + `vllm-omni==0.16.0` (1:1, obrigatorio)
- Python 3.12
- GPU: H100 (fa3-fwd requer Hopper)

**Pattern de snapshot (Chandra):**
- `vllm serve --omni --enable-sleep-mode` como subprocess
- `VLLM_SERVER_DEV_MODE=1` obrigatorio
- `VLLM_WORKER_MULTIPROC_METHOD=spawn` obrigatorio
- Sleep: POST `/sleep?level=1`
- Wake: POST `/wake_up`
- Restore em ~15ms

**API `/v1/audio/speech` (Base model):**
- `voice` obrigatorio (usar "alloy" como placeholder)
- `ref_audio` deve ser data URL: `data:audio/wav;base64,{b64}`
- `task_type`: "Base"
- `language`: "Portuguese"
- `response_format`: "wav"

**Chatterbox limitacoes:**
- torch.compile NAO funciona (T3 pipeline CPU-GPU sync)
- Chatterbox Turbo (sub-200ms) e English only
- FP8 requer H100, nao viavel no A10G atual

**Qwen3-Omni (investigar):**
- STT + TTS + texto + imagem em um modelo
- vLLM-Omni ja suporta (exemplos no repo)
- Potencial: substituir Whisper + Qwen3-TTS + Chatterbox com 1 deploy

## Como verificar

```bash
# Checar apps deployados
modal app list | grep tts

# Health do nativo (backup)
curl -s https://pedrogiudice--tts-serve-ttsservice-web-health.modal.run

# Teste do vLLM-Omni (pendente)
curl -X POST https://pedrogiudice--tts-serve-vllm-ttsservice-web-synthesize.modal.run \
  -F "text=Teste rápido." \
  -F "ref_audio_path=ref_ptbr_male.wav" \
  -F "language=Portuguese" \
  -o /tmp/vllm_test.wav && file /tmp/vllm_test.wav

# Teste do Chatterbox
curl -X POST https://pedrogiudice--tts-chatterbox-ttsservice-web-synthesize.modal.run \
  -F "text=Teste rápido." \
  -F "ref_audio_path=ref_ptbr_male.wav" \
  -F "language=pt" \
  -o /tmp/chatterbox_test.wav && file /tmp/chatterbox_test.wav
```

<session_metadata>
branch: main
last_commit: 76f0a130 (test(tts): add TtsService unit tests and PanelTts feature tests)
uncommitted_files: 4 (modal_tts_chatterbox.py, modal_tts_qwen_vllm.py, modal_tts_qwen_vllm_snap.py, chatterbox-tts-voices/)
pending_deploy_test: tts-serve-vllm (ref_audio data URL fix)
modal_endpoint_limit: 8 (near capacity)
</session_metadata>
