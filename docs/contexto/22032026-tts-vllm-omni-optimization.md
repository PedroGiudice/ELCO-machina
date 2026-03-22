# Contexto: TTS vLLM-Omni + Chatterbox Optimization

**Data:** 2026-03-22
**Sessao:** main (sem branch separado)
**Duracao:** ~4h

---

## O que foi feito

### 1. Deploy Qwen3-TTS via vLLM-Omni (objetivo principal)

Retomada de 6+ tentativas falhas da sessao anterior. Objetivo: substituir o SDK nativo (qwen-tts, ~33s inferencia) por vLLM-Omni para inferencia otimizada.

**Dois modos testados:**

| Modo | Script | Status | Inferencia | Cold start |
|------|--------|--------|------------|------------|
| Offline (Omni class) | `modal_tts_qwen_vllm.py` | Funciona, gera audio | ~25s | ~1m30s |
| HTTP subprocess + snap | `modal_tts_qwen_vllm_snap.py` | Snapshot OK, audio pendente | ~0.5s (estimado) | ~1-2s |

**Problema pendente no HTTP mode:** `/v1/audio/speech` retorna JSON de erro `ref_audio must be a URL (http/https) or base64 data URL (data:...)`. Fix aplicado (prefixo `data:audio/wav;base64,`) mas nao testado ainda (ultimo deploy esta rodando).

### 2. Incompatibilidades de versao descobertas

| vllm | vllm-omni | Resultado |
|------|-----------|-----------|
| 0.18.0 | 0.16.0 (PyPI) | `ImportError: OpenAIServingEmbedding` (renomeado pra ServingEmbedding) |
| 0.17.1 | 0.16.0 (PyPI) | `AttributeError: logits_processor_pattern` |
| **0.16.0** | **0.16.0** | Funciona. Versoes devem ser 1:1 |

### 3. API offline correta (end2end.py)

Diferencas criticas vs. minha implementacao inicial:
- **Valores como LISTAS**: `"text": [text]`, `"task_type": ["Base"]`
- **Output e dict**: `mm["audio"]` (lista de tensors) + `mm["sr"]`, concatenar com `torch.cat`
- **`VLLM_WORKER_MULTIPROC_METHOD=spawn`** obrigatorio
- **`prompt_token_ids`**: placeholder, comprimento estimado (~2048 fallback)

### 4. GPU snapshot validado com vLLM-Omni

Pattern Chandra (subprocess HTTP):
1. `vllm serve --omni --enable-sleep-mode` como subprocess
2. `_wait_ready()` (socket connect)
3. `_sleep()` → POST `/sleep?level=1`
4. Modal cria GPU snapshot
5. Restore: `_wake_up()` → POST `/wake_up` (~15ms)

Env vars criticas: `VLLM_SERVER_DEV_MODE=1`, `VLLM_WORKER_MULTIPROC_METHOD=spawn`

### 5. Chatterbox otimizacao investigada

- **torch.compile**: NAO funciona. Pipeline T3 usa Llama 3 0.5B com CPU-GPU sync (issue #127)
- **Chatterbox Turbo**: 350M, 1 step (sub-200ms), mas **English only** — inutilizavel pra PT-BR
- **FP8**: requer H100. No A10G nao e viavel
- **Volume ref**: adicionado para testes via curl (sem base64)

### 6. Volume compartilhado de voice refs

`tts-voice-refs` (Modal Volume) montado em ambos deploys (Qwen vLLM + Chatterbox).
Permite `ref_audio_path=ref_ptbr_male.wav` no curl em vez de base64.

### 7. Ideia estrategica: Qwen3-Omni multi-purpose

Modelo unico (~7B+) que faz STT + TTS + texto + imagem. Substituiria:
- Whisper (STT) — `whisper-http`
- Qwen3-TTS (TTS) — `tts-serve`
- Potencialmente Chatterbox

Trade-off: modelo maior = mais VRAM, mas consolidaria 3 deploys em 1.

## Estado dos arquivos

| Arquivo | Status | Detalhe |
|---------|--------|---------|
| `scripts/modal_tts_qwen_vllm.py` | Modificado | Offline API (Omni class), vllm==0.16.0, H100, sem snap |
| `scripts/modal_tts_qwen_vllm_snap.py` | Criado | HTTP subprocess + GPU snap, H100, endpoint proxy |
| `scripts/modal_tts_chatterbox.py` | Modificado | +torch.compile (skipped), +ref_audio_path, -health endpoint |
| `scripts/modal_tts_qwen_native.py` | Sem mudanca | Deploy nativo funcional (backup) |
| `chatterbox-tts-voices/` | Criado (nao commitado) | Resemble AI voice prompts (20 vozes EN) |

## Apps Modal deployados (TTS)

| App | Script | GPU | Snap | Endpoints | Status |
|-----|--------|-----|------|-----------|--------|
| `tts-serve` | `modal_tts_qwen_native.py` | A10G | Nao | 2 (synth+health) | Prod, funcional |
| `tts-vllm-snap-test` | (teste inline) | H100 | Sim | 0 (so ping) | Validacao snap OK |
| `tts-serve-vllm` | `modal_tts_qwen_vllm_snap.py` | H100 | Sim | 1 (synth) | Pendente: fix ref_audio format |
| `tts-chatterbox` | `modal_tts_chatterbox.py` | A10G | Nao | 1 (synth) | Funcional |

## Decisoes tomadas

- **vllm==0.16.0 + vllm-omni==0.16.0**: versoes devem ser 1:1 | Descartado: 0.18.0 (incompativel), 0.17.1 (incompativel), source build (lento)
- **H100 em vez de A10G para vLLM-Omni**: fa3-fwd (Flash Attention 3) requer Hopper | A10G dava SDPA fallback mas H100 e o target do vllm-omni
- **Scripts separados por modo**: `_vllm.py` (offline), `_vllm_snap.py` (HTTP+snap), `_native.py` (SDK) | Descartado: um script unico com flags
- **Sem health endpoint no Chatterbox**: limite de 8 endpoints por conta | Health removido pra liberar slot
- **Volume compartilhado `tts-voice-refs`**: mesmas vozes acessiveis em Qwen e Chatterbox
- **Offline mode (Omni class) NAO suporta snapshot**: mesmo problema do vllm.LLM — threads internas + CUDA state nao serializam

## Metricas

| Metrica | Nativo (SDK) | vLLM-Omni Offline | vLLM-Omni HTTP+Snap |
|---------|-------------|-------------------|---------------------|
| Inferencia (frase curta) | ~33s | ~25s | ~0.5s (estimado) |
| Cold start | ~30s | ~1m30s | ~1-2s (snap restore) |
| GPU | A10G | H100 | H100 |
| Custo/hora GPU | $1.10 | $3.95 | $3.95 |

## Pendencias identificadas

1. **Fix ref_audio data URL** (alta) — ultimo deploy tem o fix (`data:audio/wav;base64,...`), testar com curl
2. **Testar audio gerado via HTTP** (alta) — validar que `/v1/audio/speech` retorna WAV real com ref_audio correto
3. **Investigar Qwen3-Omni multi-purpose** (media) — modelo unico pra STT+TTS, substituir 3 deploys
4. **Comparar qualidade audio vLLM vs nativo** (media) — quando HTTP funcionar, comparar com ref_ptbr_male
5. **Atualizar TtsService.php** (media) — trocar endpoint Qwen pra tts-serve-vllm quando validado
6. **Cleanup apps Modal** (baixa) — remover `tts-vllm-snap-test` e apps stopped
7. **Commit mudancas** (baixa) — 4 arquivos modificados/criados, nao commitados
