# Contexto: Migrar Refiner para Ollama + Benchmark STT/Refiner

**Data:** 2026-02-22
**Sessao:** main (commits diretos)
**Duracao:** ~2h

---

## O que foi feito

### 1. OllamaRefiner implementado no sidecar

Novo backend de refinamento pos-STT via Ollama local (`qwen2.5:3b`), substituindo Gemini (quota esgotada, HTTP 429).

Arquitetura:
- `OllamaRefiner`: POST `/api/generate`, stream=false, timeout 120s
- `is_available`: GET `/api/tags` com cache de 60s
- Env vars: `OLLAMA_URL` (default `127.0.0.1:11434`), `OLLAMA_REFINE_MODEL` (default `qwen2.5:3b`), `OLLAMA_REFINE_TIMEOUT` (default `120`)
- Factory `get_refiner()`: Ollama > Gemini > None

```python
def get_refiner() -> OllamaRefiner | GeminiRestRefiner | None:
```

### 2. Endpoints atualizados para multi-backend

- `transcribe.py`: usa `get_refiner()` em vez de `GeminiRestRefiner()` direto
- `TranscribeRequest.model` agora e `str | None` (None = default do backend)
- Response inclui `refine_backend: "ollama" | "gemini"`
- `main.py`: health check reporta `refiner: {status, backend, model}`

### 3. Notebook testbench atualizado

`~/notebooks/stt_testbench_cpu.ipynb`:
- Secao Text Refiner adicionada (2 celulas: setup + benchmark)
- Consome textos reais do Whisper (variavel `results` das celulas STT)
- Todas as celulas agora tem `SKIP = False/True` na linha 1 como on/off switch
- Titulo atualizado para "Voice AI Testbench"

### 4. Pesquisa: whisper-server overhead

Benchmark mostrou whisper-server warm **2-3x mais lento** que CLI cold start:

| Config | Modelo | Tempo | RTF |
|--------|--------|-------|-----|
| CLI cold | small (fp16) | 45.5s | 0.49 |
| CLI cold | large-v3-turbo (q8_0) | 99.6s | 1.06 |
| Server warm | large-v3-turbo (q5_0) | 113s | 1.21 |
| Server warm | small (q5_1) | 95s | 1.02 |

Causas identificadas via pesquisa:
- Server default `-t 4` threads vs CLI `-t 8`
- Pipeline ffmpeg sincrono em cada request
- Mutex serial na inferencia (sem paralelismo)
- faster-whisper (CTranslate2) tem 3-4x vantagem em CPU (issue #1127 whisper.cpp, benchmarks Codesphere)

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `sidecar/voice_ai/services/refiner.py` | Modificado - OllamaRefiner + get_refiner() |
| `sidecar/voice_ai/routers/transcribe.py` | Modificado - multi-backend |
| `sidecar/voice_ai/main.py` | Modificado - health/startup refiner |
| `sidecar/test_refiner_quality.ipynb` | Criado - redundante, pode deletar |
| `~/notebooks/stt_testbench_cpu.ipynb` | Modificado - secao refiner + SKIP switches |

## Commits desta sessao

```
83004997 docs(sessao): contexto sidecar multi-model STT, TTS Kokoro, Android proxy
4cd1adba feat(refiner): migrar refinamento de Gemini para Ollama local
```

## Pendencias identificadas

1. **Resultados do refiner benchmark** -- usuario rodando no Jupyter, ainda sem resultados
2. **Decisao whisper-server vs faster-whisper** -- dados de pesquisa indicam faster-whisper superior em CPU, mas nao ha decisao tomada
3. **`sidecar/test_refiner_quality.ipynb`** -- redundante com testbench, pode deletar
4. **`proatt.keystore`** -- untracked na main, nao deve ser commitado (adicionar ao .gitignore)
5. **Benchmark isolado** -- resultados do benchmark STT ficam imprecisos com whisper-servers rodando simultaneamente (CPU saturada ~812%/800%). Reexecutar com servers parados para dados limpos

## Decisoes tomadas

- **Ollama local em vez de VM OCI**: VM OCI encerrada permanentemente, Ollama roda na Contabo (14GB livre)
- **qwen2.5:3b como default**: ~2GB RAM, teste rapido mostrou qualidade aceitavel (pontuacao/capitalizacao corretas)
- **Notebook self-contained**: celulas de refiner usam httpx direto, sem dependencia do sidecar no sys.path
- **SKIP switches**: `SKIP = False` na primeira linha de cada celula, com else que inicializa variaveis vazias para downstream
