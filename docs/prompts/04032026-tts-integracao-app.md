# Integracao XTTS v2 no App -- Endpoint Modal + UI de Parametros

## Contexto

O benchmark XTTS v2 no Modal esta funcionando e validado. Voice cloning zero-shot PT-BR com qualidade aceitavel (compreensivel, levemente robotico). Os defaults foram ajustados via testes A/B manuais.

**Script de referencia:** `scripts/modal_xtts_bench.py` -- contem toda a logica de sintese que deve ser reutilizada.

**CRITICO -- nao mexer na combinacao de deps:**
- `coqui-tts==0.26.0` + `transformers>=4.43.0,<4.50.0`
- Tentativa de imagem slim com `--no-deps` falhou: coqui-tts importa spacy, gruut, matplotlib incondicionalmente
- Erros fatais documentados em `docs/contexto/04032026-tts-xtts-v2-benchmark.md`

**CRITICO -- API low-level obrigatoria:**
- `TTS.api.TTS()` pede aceite de licenca CPML interativamente -- nao funciona no Modal
- Usar `Xtts.init_from_config()` + `model.inference()` (ver script)
- Download via `huggingface_hub.snapshot_download("coqui/XTTS-v2")`

**CRITICO -- ref_audio e gen_text:**
- O audio de referencia (`docs/Refaudio.wav`, 10s PT-BR) define a VOZ clonada
- O texto de sintese e o que o modelo vai FALAR -- pode ser qualquer coisa
- Ref audio gravado com voz nasalada (doenca) -- qualidade melhora com gravacao nova

## Defaults validados (benchmark)

| Param | Default | Range | Notas |
|-------|---------|-------|-------|
| `temperature` | **0.75** | 0.1-1.0 | >0.8 gera gibberish |
| `top_k` | **20** | 1-100 | Restrito = menos engasgos em termos tecnicos |
| `top_p` | **0.75** | 0.0-1.0 | Complementa top_k |
| `repetition_penalty` | **2.0** | 1.0-5.0 | Evita loops de audio. Nao mexer sem motivo |
| `length_penalty` | **1.0** | 0.5-2.0 | Nao testado extensivamente |
| `speed` | **1.0** | 0.5-2.0 | 0.9 melhora clareza levemente |
| `language` | **"pt"** | pt, en, ... | PT-BR nativo |

## Metricas de referencia (L4, texto longo 679 chars)

| Metrica | Valor |
|---------|-------|
| GPU | L4 ($0.80/h) |
| Model load | ~10-14s (cold start) |
| Container overhead | ~20-40s (image pull) |
| Inference | ~30s para ~60s de audio |
| RTF | 0.4-0.6 |
| Custo/1000 sinteses | $5-8 (depende do tamanho do texto) |

## Tarefa 1: Criar endpoint Modal (FastAPI)

Transformar `scripts/modal_xtts_bench.py` de `modal run` para `modal deploy` com endpoint HTTP.

### O que fazer

1. Manter a classe `TTS_Model` como esta (image, GPU config, `@modal.enter`, `synthesize`)
2. Adicionar `@modal.fastapi_endpoint()` que recebe JSON e retorna audio
3. Configurar `min_containers=0`, `scaledown_window` configuravel (default 300s)
4. Endpoint deve aceitar todos os params de sintese + ref_audio como upload ou path

### Contrato da API

```
POST /synthesize
Content-Type: application/json

{
  "text": "Texto para sintetizar",
  "ref_audio_base64": "<base64 do WAV de referencia>",
  "language": "pt",
  "speed": 1.0,
  "temperature": 0.75,
  "top_k": 20,
  "top_p": 0.75,
  "repetition_penalty": 2.0,
  "length_penalty": 1.0
}

Response: audio/wav (bytes direto) ou JSON com base64

Headers de resposta:
  X-Inference-Time: 7.8
  X-Audio-Duration: 9.4
  X-Model-Load-Time: 10.1
```

### Scaling config (deve ser configuravel no app)

- `scaledown_window`: tempo que container fica vivo apos ultimo request (default: 300s)
- `min_containers`: containers minimos sempre ativos (default: 0 = escala a zero)
- `max_containers`: maximo de containers paralelos (default: 1)

Esses valores NAO devem ser hardcoded. O app deve poder alterar via config/UI.

## Tarefa 2: UI de parametros TTS no app

O usuario deve poder ajustar os parametros de sintese diretamente no app, sem rebuild.

### Params expostos na UI

Cada param precisa de:
- Slider com range definido
- Valor atual visivel
- Botao "Reset to default"
- Tooltip com descricao curta

| Param | Tipo UI | Range | Step | Default | Tooltip |
|-------|---------|-------|------|---------|---------|
| `speed` | Slider | 0.5-2.0 | 0.05 | 1.0 | Velocidade da fala |
| `temperature` | Slider | 0.1-0.9 | 0.05 | 0.75 | Variacao na prosodia. >0.8 gera lixo |
| `top_k` | Slider | 1-100 | 1 | 20 | Tokens considerados por passo |
| `top_p` | Slider | 0.1-1.0 | 0.05 | 0.75 | Probabilidade acumulada de corte |
| `repetition_penalty` | Slider | 1.0-5.0 | 0.1 | 2.0 | Penalidade por repeticao de padroes |
| `length_penalty` | Slider | 0.5-2.0 | 0.1 | 1.0 | Penalidade por comprimento |

### Funcionalidades da UI

1. **Textarea** para o texto a sintetizar
2. **Upload de audio de referencia** (WAV, ate 30s) -- ou usar o default do servidor
3. **Botao "Gerar Audio"** que chama o endpoint
4. **Player de audio** para ouvir o resultado inline
5. **Indicador de status**: "Gerando..." com tempo estimado baseado no tamanho do texto
6. **Historico** dos ultimos N audios gerados (opcional, prioridade baixa)

### Consideracoes de UX

- Cold start pode levar 40-70s na primeira geracao. Mostrar mensagem clara: "Iniciando servidor de voz... (primeira vez demora mais)"
- Geracoes subsequentes (container quente): ~10-30s dependendo do texto
- Salvar params do usuario em localStorage para persistir entre sessoes
- Nao expor `language` na UI por enquanto (fixo em "pt")

## Arquivos relevantes

| Arquivo | O que contem |
|---------|-------------|
| `scripts/modal_xtts_bench.py` | Script completo de benchmark -- base para o endpoint |
| `docs/Refaudio.wav` | Audio de referencia PT-BR (10s) |
| `docs/XTTS-deps-image.md` | Pesquisa de deps minimas (conclusao: nao vale enxugar) |
| `docs/xtts_v2_reference.md` | Referencia tecnica XTTS v2 |
| `docs/xtts-official-doc.md` | Doc oficial Coqui |
| `docs/contexto/04032026-tts-xtts-v2-benchmark.md` | Contexto completo da sessao de benchmark |

## Decisoes ja tomadas (nao revisitar)

- **GPU L4**: suficiente, custo marginal vs T4, inference 2x mais rapida
- **coqui-tts==0.26.0 do PyPI**: fork Idiap tem bug. Nao trocar
- **Imagem Docker completa**: tentativa de slim falhou. coqui-tts importa tudo incondicionalmente
- **API low-level**: `Xtts.init_from_config()`, nao `TTS.api.TTS()`
- **temperature <= 0.8**: acima gera gibberish. Hard limit na UI
- **Sem presets de mood/emocao**: XTTS v2 nao tem. Emocao vem do ref audio
- **Multiplos ref audios**: caminho futuro para variar "tom" da voz

## O que NAO fazer

- Nao tentar enxugar a imagem Docker (ja testado, falhou)
- Nao usar `TTS.api.TTS()` (pede aceite de licenca interativo)
- Nao subir temperatura acima de 0.8 (gibberish)
- Nao mexer em `transformers>=4.43.0,<4.50.0` (erro `isin_mps_friendly`)
- Nao alterar o download do modelo (usar `snapshot_download`, nao `TTS.api`)
