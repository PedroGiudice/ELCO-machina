# Retomada: Refiner Ollama + Decisao STT Engine

## Contexto rapido

O sidecar voice_ai agora tem refinamento pos-STT via Ollama local (`qwen2.5:3b`) como backend primario, com Gemini como fallback. A implementacao esta completa e commitada na main. O notebook `~/notebooks/stt_testbench_cpu.ipynb` foi atualizado com secao de benchmark do refiner que consome textos reais do Whisper.

Benchmark do whisper-server revelou que o server warm e 2-3x mais lento que o CLI cold start. Pesquisa indica que faster-whisper (CTranslate2) tem 3-4x vantagem sobre whisper.cpp em CPU puro. Decisao sobre migrar engine STT esta pendente.

## Arquivos principais

- `sidecar/voice_ai/services/refiner.py` -- OllamaRefiner + GeminiRestRefiner + factory get_refiner()
- `sidecar/voice_ai/routers/transcribe.py` -- endpoint com multi-backend
- `sidecar/voice_ai/main.py` -- health check com status do refiner
- `~/notebooks/stt_testbench_cpu.ipynb` -- benchmark completo STT + TTS + Refiner
- `docs/contexto/22022026-ollama-refiner-whisper-benchmark.md` -- contexto detalhado

## Proximos passos (por prioridade)

### 1. Analisar resultados do refiner benchmark
**Onde:** output do notebook `~/notebooks/stt_testbench_cpu.ipynb`, celula `9d3opajnk2v`
**O que:** verificar se qwen2.5:3b preserva palavras e latencia e aceitavel (~8-12s esperado)
**Por que:** se qualidade insuficiente, subir para qwen2.5:7b (~4.7GB, ainda cabe em RAM)
**Verificar:** `n_added == 0` para todos os textos, latencia < 15s

### 2. Decidir sobre engine STT (whisper.cpp vs faster-whisper)
**Onde:** `sidecar/voice_ai/services/stt_service.py`
**O que:** avaliar se migrar de whisper.cpp server para faster-whisper, baseado nos benchmarks
**Por que:** server warm 2-3x mais lento que CLI cold, faster-whisper promete RTF ~0.33 vs 1.2
**Verificar:** rodar faster-whisper no mesmo audio (`~/audio-teste.wav`, 93s) e comparar

### 3. Limpar artefatos redundantes
**Onde:** `sidecar/test_refiner_quality.ipynb`, `.gitignore`
**O que:** deletar notebook redundante, adicionar `proatt.keystore` ao .gitignore
**Por que:** notebook testbench ja tem tudo, keystore nao deve ir pro repo

## Como verificar

```bash
# Refiner funciona
cd ~/ELCO-machina/sidecar && .venv/bin/python -c "
import asyncio
from voice_ai.services.refiner import OllamaRefiner
r = OllamaRefiner()
print(f'Available: {r.is_available}, Model: {r.model}')
result = asyncio.run(r.refine('teste de refinamento', 'Formate com pontuacao.'))
print(f'Success: {result.success}')
"

# Ollama rodando
curl -s http://127.0.0.1:11434/api/tags | python3 -m json.tool | head -5

# RAM
free -h
```
