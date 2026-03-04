# Modal Whisper Benchmark - 2026-03-04

## Setup
- **Modelo:** large-v3-turbo FP16 (deepdml/faster-whisper-large-v3-turbo-ct2)
- **GPU:** T4 (16GB VRAM)
- **Framework:** faster-whisper (CTranslate2)
- **Audio teste:** 3min50s (230s), 7.5MB, m4a
- **Imagem:** nvidia/cuda:12.4.1 + faster-whisper (cacheada no Modal)

## Resultados (segunda execucao, imagem cacheada)

| Metrica | Cold start (Run 1) | Warm (Run 2) |
|---------|-------------------|--------------|
| Wall time total | 17.6s | 9.0s |
| Model load | 2.8s | (ja carregado) |
| Inferencia | 7.4s | 6.65s |
| RTF | 0.032 | 0.029 |

## Custo

| Metrica | Valor |
|---------|-------|
| GPU | T4 @ $0.59/h |
| Por transcricao (warm) | $0.00109 |
| Por 1000 transcricoes | $1.09 |
| Por hora de audio | $0.017 |

## Comparacao com sidecar atual (VM CPU)

| Metrica | VM (whisper.cpp CPU, small) | Modal (faster-whisper GPU, large-v3-turbo) |
|---------|---------------------------|-------------------------------------------|
| Inferencia | ~84s (RTF ~0.35) | 6.5s (RTF 0.029) |
| Wall time | ~84s | 9s warm / 17.6s cold |
| Modelo | small q5_1 (190MB) | large-v3-turbo FP16 (~3GB) |
| Qualidade | Menor | Significativamente melhor |
| Custo | VM ja paga | $0.001/transcricao |
| Speedup | baseline | ~13x inferencia, ~10x wall time |

## Tempo cabo-a-cabo (com imagem cacheada)

Comando completo (modal run + benchmark com 2 chamadas): **31s total**
