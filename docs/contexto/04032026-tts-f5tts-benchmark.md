# Contexto: Benchmark TTS Modal -- F5-TTS e decisao XTTS v2

**Data:** 2026-03-04
**Sessao:** main (continuacao da sessao de benchmarks Modal)
**Duracao:** ~2h

---

## O que foi feito

### 1. Benchmark Whisper (sessao anterior, referencia)
Script `scripts/modal_whisper_bench.py` -- funcionando perfeitamente. T4, faster-whisper, large-v3-turbo FP16.
- RTF 0.029, 6.5s para 3.8min de audio, $0.001/transcricao
- Padrao ouro para scripts Modal neste projeto

### 2. Rewrite tts_chatterbox.py
Reescrito `modal_functions/tts_chatterbox.py` para seguir padrao do Whisper:
- Modelo baixado no build da imagem (sem Volume)
- T4, scaledown_window=2, max_containers=1
- Interface retrocompativel com `tts_modal_client.py`
- NAO testado pelo usuario nesta sessao

### 3. Benchmark F5-TTS -- investigacao extensiva
Criado `scripts/modal_f5tts_bench.py` (L4 GPU). Testado exaustivamente:

**Checkpoint PT-BR (`firstpixel/F5-TTS-pt-br`):**
- TODAS as combinacoes testadas produziram gibberish total
- ref_text manual, ref_text="" (Whisper auto), ref_audio curto (10s), ref_audio longo (16s cortado)
- O checkpoint esta quebrado/incompativel

**Modelo base oficial (`SWivid/F5-TTS`):**
- Ingles: perfeito (transcricao Whisper palavra por palavra identica ao input)
- PT-BR com ref PT-BR correto: reconhecivel mas com erros ("processamento" -> "processo e mento", "baixo" -> "bakes")
- Acentuacao no gen_text melhora resultado (obrigatorio para PT-BR)
- Qualidade insuficiente para producao

### 4. Decisao: migrar para XTTS v2
Pesquisa do usuario (salva em `docs/F5-TTSPT-BR.txt`) confirma:
- F5-TTS nao foi treinado nativamente em PT-BR
- Checkpoint firstpixel e um fine-tune que nao funciona na pratica
- **XTTS v2 (Coqui TTS)** e o unico modelo com PT-BR nativo, co-criado por Edresson Casanova (USP/NVIDIA)

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `scripts/modal_f5tts_bench.py` | Criado -- benchmark F5-TTS, util como base para XTTS v2 |
| `modal_functions/tts_chatterbox.py` | Modificado -- rewrite padrao Modal (nao commitado) |
| `docs/Refaudio.wav` | Criado -- 10s ref audio PT-BR para testes TTS |
| `docs/Liomemorando.wav` | Criado -- 16s ref audio PT-BR (muito longo, F5-TTS corta em 12s) |
| `docs/AudioClone.wav` | Criado -- ref audio anterior (nao usado) |
| `docs/FTT5.md` | Criado -- doc F5-TTS API/instalacao |
| `docs/F5-TTSPT-BR.txt` | Criado -- pesquisa detalhada sobre F5-TTS PT-BR |
| `docs/modal-whisper-benchmark.md` | Existente -- resultados STT (sessao anterior) |

## Pendencias identificadas

1. **Criar benchmark XTTS v2 no Modal** -- prioridade alta, substituir F5-TTS
2. **Testar tts_chatterbox.py reescrito** -- prioridade media, manter como fallback
3. **Definir como app recebe output do Modal** -- arquitetura de integracao TTS (adiado)

## Decisoes tomadas

- **F5-TTS descartado para PT-BR**: checkpoint firstpixel quebrado, modelo base insuficiente
- **XTTS v2 e o proximo candidato**: unico modelo com PT-BR nativo + voice cloning
- **Ref audio ideal: 5-9 segundos**: F5-TTS corta em 12s, qualidade cai com audios longos
- **Acentuacao obrigatoria no gen_text**: sem acentos a qualidade cai significativamente
- **Padrao Modal consolidado**: modelo na imagem (build time), sem Volume, scaledown_window=2

## Metricas de referencia (F5-TTS modelo base, L4)

| Metrica | Valor |
|---------|-------|
| Inferencia warm | 2.0s para ~10s audio |
| Wall time warm | 3.2s |
| Custo/1000 sinteses | $0.45 |
| Qualidade PT-BR | Reconhecivel mas com erros (insuficiente) |
