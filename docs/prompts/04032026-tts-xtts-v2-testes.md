# Retomada: Testes XTTS v2 -- params, textos variados, normalizacao

## Contexto rapido

O benchmark XTTS v2 no Modal esta funcionando. Script em `scripts/modal_xtts_bench.py`, T4 GPU, coqui-tts==0.26.0, API low-level (Xtts.init_from_config). O primeiro teste com defaults passou: Whisper transcreve o output identico ao input. Inferencia 6.9s para 7.9s de audio, $1.13/1000 sinteses.

**CRITICO -- nao mexer na combinacao de deps:**
- `coqui-tts==0.26.0` + `transformers>=4.43.0,<4.50.0`
- Erros fatais documentados em `docs/contexto/04032026-tts-xtts-v2-benchmark.md`

**CRITICO -- ref_audio e gen_text devem ser match:**
- Ref audio: `docs/Refaudio.wav` (10s PT-BR)
- Texto literal do audio: "A necessidade de modelos especializados em portugues brasileiro advem das complexidades foneticas inerentes ao idioma."

**CRITICO -- temperature <= 0.7:**
- temperature=0.9 gera gibberish. Default oficial e 0.65.

## Arquivos principais

- `scripts/modal_xtts_bench.py` -- script de benchmark, FUNCIONANDO
- `docs/Refaudio.wav` -- 10s ref audio PT-BR
- `docs/xtts_v2_reference.md` -- referencia tecnica XTTS v2 (params, API, problemas comuns)
- `docs/xtts-official-doc.md` -- doc oficial Coqui (defaults reais dos params)
- `docs/contexto/04032026-tts-xtts-v2-benchmark.md` -- contexto detalhado
- `docs/script-deps.md` -- auditoria de 154 packages (referencia, nao mexer)

## Inicio da sessao

O usuario vai colar o resultado do ultimo `modal run scripts/modal_xtts_bench.py` (defaults). Analise o output e confirme se funcionou antes de prosseguir.

**Regra desta sessao:** so rodar scripts de benchmark. Nenhuma alteracao no app.

## Proximos passos (por prioridade)

### 1. Testar combinacoes de params
**Onde:** CLI do script
**O que:** Rodar com diferentes combinacoes e validar com Whisper
**Por que:** Encontrar os defaults ideais para PT-BR
**Verificar:**
```bash
# Default (baseline)
modal run scripts/modal_xtts_bench.py

# Temperature mais baixa (mais estavel)
modal run scripts/modal_xtts_bench.py --temperature 0.5

# Speed variado
modal run scripts/modal_xtts_bench.py --speed 0.9
modal run scripts/modal_xtts_bench.py --speed 1.1

# Validar cada output com Whisper
modal run scripts/modal_whisper_bench.py --audio-path /tmp/xtts_output.wav --language pt
```

### 2. Testar com textos variados (gen_text diferente do ref_text)
**Onde:** CLI do script com --text
**O que:** Sintetizar frases diferentes do audio de referencia -- o modelo deve clonar a VOZ, nao repetir o texto
**Por que:** Validar que a clonagem funciona para texto arbitrario
**Verificar:**
```bash
modal run scripts/modal_xtts_bench.py --text "O tribunal decidiu pela improcedencia do pedido, mantendo a sentenca de primeiro grau."
modal run scripts/modal_xtts_bench.py --text "Bom dia, doutor. A audiencia esta marcada para as quatorze horas."
# Validar com Whisper
modal run scripts/modal_whisper_bench.py --audio-path /tmp/xtts_output.wav --language pt
```

### 3. Testar normalizacao de texto (numeros, siglas)
**Onde:** CLI do script com --text
**O que:** Verificar como XTTS v2 lida com numeros e siglas sem pre-processamento
**Por que:** XTTS nao normaliza automaticamente (docs/xtts_v2_reference.md linha 223)
**Verificar:**
```bash
modal run scripts/modal_xtts_bench.py --text "O artigo 927 do Codigo Civil estabelece a responsabilidade objetiva."
modal run scripts/modal_xtts_bench.py --text "O CPF 123.456.789-00 foi cadastrado em 15 de marco de 2026."
```

### 4. Limpar script (remover --deps)
**Onde:** `scripts/modal_xtts_bench.py` linhas 165-196 e 210-229
**O que:** Remover metodo `list_deps` e flag `--deps` -- ja serviu
**Por que:** Limpeza, nao polui a imagem se pipdeptree nao esta mais instalado

## Como verificar

```bash
# Sintese default (deve funcionar sem rebuildar imagem)
modal run scripts/modal_xtts_bench.py

# Output salvo em /tmp/xtts_output.wav e transferido para cmr-auto
# Validar com Whisper
modal run scripts/modal_whisper_bench.py --audio-path /tmp/xtts_output.wav --language pt
```
