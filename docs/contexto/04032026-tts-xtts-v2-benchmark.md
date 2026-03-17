# Contexto: Benchmark XTTS v2 no Modal -- PT-BR voice cloning funcional

**Data:** 2026-03-04
**Sessao:** main (continuacao da sessao F5-TTS)
**Duracao:** ~2h

---

## O que foi feito

### 1. Script benchmark XTTS v2 no Modal -- FUNCIONANDO
Criado `scripts/modal_xtts_bench.py` seguindo padrao do Whisper/F5-TTS. Voice cloning zero-shot PT-BR validado com sucesso.

**Combinacao que funciona (NAO MEXER):**
- `coqui-tts==0.26.0` (PyPI)
- `transformers>=4.43.0,<4.50.0` (pin obrigatorio)
- `torch>=2.1.0`, `torchaudio>=2.1.0`, `torchcodec`
- GPU: T4 ($0.59/h)
- API low-level: `Xtts.init_from_config()` + `model.inference()`
- Download: `huggingface_hub.snapshot_download("coqui/XTTS-v2")` (evita prompt de licenca CPML)

**Metricas (run com defaults):**
- Model load: 16-19s (cold start)
- Inferencia: 6.9s para 7.9s de audio
- RTF: 0.87
- Custo: $1.13/1000 sinteses
- Qualidade: Whisper transcreve output identico ao input

### 2. Params de inferencia expostos via CLI
Todos os params configurados no `model.inference()`:

| Param | Default (doc oficial) | Range |
|-------|----------------------|-------|
| `temperature` | 0.65 | 0.1-1.0 (>0.8 gera gibberish!) |
| `top_k` | 50 | 1-100 |
| `top_p` | 0.8 | 0.0-1.0 |
| `repetition_penalty` | 2.0 | 1.0-5.0 |
| `length_penalty` | 1.0 | 0.5-2.0 |
| `speed` | 1.0 | 0.5-2.0 |

### 3. Transferencia automatica para cmr-auto
Output WAV transferido via SCP para `cmr-auto@100.102.249.9:/home/cmr-auto/Documents/audios/xtts-output/`

### 4. Auditoria de dependencias (--deps)
154 packages instalados, ~60 desnecessarios (spacy, librosa, matplotlib, gruut, tensorboard, etc). Resultado completo em `docs/script-deps.md`. Conclusao: nao vale enxugar agora -- image e cacheada, ganho marginal.

## Erros fatais encontrados e resolucoes

| Erro | Causa | Resolucao |
|------|-------|-----------|
| `ImportError: isin_mps_friendly` | `coqui-tts` do PyPI puxa transformers incompativel | Pin `transformers>=4.43.0,<4.50.0` |
| `EOFError: EOF when reading a line` | `TTS.api.TTS()` pede aceite de licenca CPML interativamente | Usar API low-level: `snapshot_download` + `Xtts.init_from_config()` |
| `ModuleNotFoundError: torchcodec` | `torchaudio` precisa de torchcodec para carregar audio | Adicionar `torchcodec` ao pip_install |
| `Cannot find command 'git'` | Idiap fork via git+https sem git na imagem | Voltou pro PyPI (fork Idiap tem bug no main) |
| `ResolutionImpossible` | Idiap main (0.28.0.dev0) exige transformers>=4.57 | Voltou pro PyPI coqui-tts==0.26.0 |
| `temperature=0.9` gera gibberish | Valor alto demais para XTTS v2 | Manter <=0.7, default oficial e 0.65 |

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `scripts/modal_xtts_bench.py` | Criado -- benchmark XTTS v2, FUNCIONANDO |
| `docs/Refaudio.wav` | Existente -- 10s ref audio PT-BR |
| `docs/xtts_v2_reference.md` | Criado pelo usuario -- referencia tecnica completa |
| `docs/xtts-official-doc.md` | Criado pelo usuario -- doc oficial Coqui |
| `docs/script-deps.md` | Criado -- output do --deps (154 packages) |
| `CLAUDE.md` | Modificado -- novo erro aprendido (ref_audio deve corresponder ao gen_text) |

## Decisoes tomadas

- **coqui-tts==0.26.0 do PyPI**: fork Idiap tem bug no main (isin_mps_friendly). Ficar no PyPI ate Idiap corrigir
- **API low-level obrigatoria**: `TTS.api.TTS()` pede aceite de licenca interativo. Usar `Xtts.init_from_config()`
- **T4 e suficiente**: XTTS v2 usa ~5GB VRAM, T4 tem 16GB. Nao precisa de L4
- **Nao enxugar imagem agora**: 60 packages extras, mas imagem e cacheada. Ganho marginal
- **temperature <= 0.7**: acima disso gera gibberish. Default oficial e 0.65

## Pendencias identificadas

1. **Testar mais combinacoes de params** -- speed, temperature baixa, repetition_penalty -- prioridade alta
2. **Validar com textos variados** -- frases longas, numeros, siglas -- prioridade alta
3. **Normalizacao de texto PT-BR** -- num2words, siglas (Dr., Art., CPF) -- prioridade media
4. **Integrar no app** -- endpoint Modal para TTS, UI de configuracao -- prioridade baixa (adiado)
5. **Remover list_deps/--deps do script** -- ja serviu, pode limpar -- prioridade baixa
