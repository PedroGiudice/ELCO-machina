# XTTS v2 — Referência Completa

## Identidade do Modelo

| Campo | Valor |
|-------|-------|
| Nome completo | XTTS v2 (Cross-lingual Text-to-Speech v2) |
| Organização original | Coqui AI (encerrada jan. 2024) |
| Fork mantido | Idiap Research Institute (`idiap/coqui-ai-TTS`) |
| Autores principais | Edresson Casanova, Enrique Casanova, Kelly Davis, et al. |
| Paper | [XTTS: a Massively Multilingual Zero-Shot Text-to-Speech Model](https://arxiv.org/abs/2406.04904) (Interspeech 2024) |
| GitHub original | github.com/coqui-ai/TTS (arquivado, 44.2k stars) |
| GitHub ativo | github.com/idiap/coqui-ai-TTS |
| HuggingFace modelo | huggingface.co/coqui/XTTS-v2 |
| Última release estável | v0.24.3 (Idiap fork) |

---

## Arquitetura

- **Tipo:** Autoregressive + Diffusion hybrid
- **Backbone:** GPT-2 modificado para token de áudio + HiFi-GAN vocoder
- **Codebook:** DVAE (Discrete Variational AutoEncoder) para compressão de voz
- **Speaker conditioning:** Speaker embedding extraído via encoder dedicado do áudio de referência
- **Parâmetros:** ~456M total (GPT backbone ~330M + DVAE + vocoder)
- **Frequência de amostragem de saída:** 24 kHz
- **Tokens de áudio:** 1024 por segundo de áudio

---

## Idiomas Suportados Nativamente

17 idiomas com PT-BR como idioma de treinamento primário:

`en`, **`pt`**, `es`, `fr`, `de`, `it`, `pl`, `tr`, `ru`, `nl`, `cs`, `ar`, `zh-cn`, `hu`, `ko`, `ja`, `hi`

> PT-BR é passado como `language="pt"` — `"pt-br"` retorna erro.

---

## Requisitos de Hardware

| Configuração | Spec |
|---|---|
| VRAM mínima (inferência) | ~3.5 GB |
| VRAM recomendada | 5–6 GB |
| VRAM com streaming ativo | ~4 GB |
| RAM (CPU fallback) | ~8 GB |
| GPU L4 (caso) | ✅ Suportado, inferência ~200–400ms |
| Apple Silicon | ✅ via MPS |
| CPU only | ✅ (lento, ~10–30s por frase) |

---

## Performance (benchmarks DataRoot Labs, GPU T4, jan. 2026)

| Métrica | XTTS v2 | F5-TTS | Fish Speech |
|---|---|---|---|
| Speaker Similarity ↑ | 0.497 | 0.479 | **0.595** |
| WER ↓ | **0.275** | 0.320 | 0.545 |
| RTF ↓ | **0.482** | 0.894 | 31.5 |
| Latência (frase ~10s) | **3.36s** | 3.44s | 102s |
| VRAM usada | 5.040 MB | 2.994 MB | 4.029 MB |
| Time-to-first-chunk | **~200ms** (streaming) | N/A | N/A |

> RTF (Real-Time Factor): quanto menor, mais rápido que tempo real. RTF 0.482 = gera 10s de áudio em ~4.8s.

---

## Clonagem de Voz — Especificações

| Parâmetro | Valor |
|---|---|
| Tipo | Zero-shot (sem fine-tuning) |
| Duração mínima do áudio de referência | 6 segundos |
| Duração ideal | 10–30 segundos |
| Duração máxima aceita | 30 segundos (acima disso o modelo descarta ou trunca) |
| Sample rate do áudio de referência | Qualquer (internamente resampleado para 22050 Hz) |
| Formato aceito | WAV, MP3, FLAC, OGG |
| Requisito de qualidade | Sem ruído de fundo, sem música, voz limpa e contínua |
| Cross-lingual cloning | ✅ — clonar voz em EN e sintetizar em PT funciona |
| Múltiplos falantes na referência | ❌ — apenas 1 falante por arquivo de referência |

---

## Instalação

```bash
# Via pip (fork Idiap — recomendado)
pip install coqui-tts

# Verificar versão
python -c "import TTS; print(TTS.__version__)"

# Alternativa: instalar do fonte
git clone https://github.com/idiap/coqui-ai-TTS
cd coqui-ai-TTS
pip install -e ".[all,dev]"
```

---

## Uso — API Python

### Básico (arquivo)

```python
from TTS.api import TTS
import torch

device = "cuda" if torch.cuda.is_available() else "cpu"

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

tts.tts_to_file(
    text="Seu texto em português aqui.",
    speaker_wav="referencia.wav",
    language="pt",            # NUNCA "pt-br"
    file_path="saida.wav",
    split_sentences=True      # recomendado para textos longos
)
```

### Streaming (baixa latência)

```python
from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts

config = XttsConfig()
config.load_json("/path/to/xtts_v2/config.json")
model = Xtts.init_from_config(config)
model.load_checkpoint(config, checkpoint_dir="/path/to/xtts_v2/")
model.cuda()

# Calcular speaker embedding UMA vez e reutilizar
gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(
    audio_path=["referencia.wav"]
)

# Streaming
chunks = model.inference_stream(
    "Seu texto em português aqui.",
    "pt",
    gpt_cond_latent,
    speaker_embedding,
    stream_chunk_size=20,       # menor = menor latência, mais fragmentado
    enable_text_splitting=True
)

import sounddevice as sd
import numpy as np

for chunk in chunks:
    audio_np = chunk.cpu().numpy().squeeze()
    sd.play(audio_np, samplerate=24000)
    sd.wait()
```

### Carregamento direto do HuggingFace

```python
from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts
from huggingface_hub import snapshot_download

model_dir = snapshot_download("coqui/XTTS-v2")

config = XttsConfig()
config.load_json(f"{model_dir}/config.json")
model = Xtts.init_from_config(config)
model.load_checkpoint(config, checkpoint_dir=model_dir, use_deepspeed=False)
model.cuda()
```

---

## Uso — REST API (via servidor embutido)

```bash
# Iniciar servidor
tts-server --model_name tts_models/multilingual/multi-dataset/xtts_v2 \
           --port 5002 --use_cuda

# Requisição
curl -X POST "http://localhost:5002/api/tts" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Texto em português",
    "language_id": "pt",
    "speaker_wav": "<base64_do_audio>"
  }' --output saida.wav
```

---

## Parâmetros de Inferência Avançados

```python
output = model.inference(
    text="Texto",
    language="pt",
    gpt_cond_latent=gpt_cond_latent,
    speaker_embedding=speaker_embedding,

    # Controle de qualidade
    temperature=0.7,          # 0.1–1.0 | menor = mais estável, maior = mais expressivo
    length_penalty=1.0,       # penaliza ou favorece durações mais longas
    repetition_penalty=2.0,   # evita repetições no token stream (>1.0 recomendado)
    top_k=50,                 # top-k sampling
    top_p=0.85,               # nucleus sampling

    # Controle de velocidade/fluência
    speed=1.0,                # 0.5–2.0
    enable_text_splitting=True
)
```

---

## Normalização de Texto — PT-BR (crítico para qualidade)

O XTTS **não normaliza texto automaticamente**. Pré-processar antes de inferir:

```python
import re
from num2words import num2words

def normalizar_ptbr(texto: str) -> str:
    # Números para extenso
    texto = re.sub(
        r'\b\d+([.,]\d+)?\b',
        lambda m: num2words(float(m.group().replace(',', '.')), lang='pt_BR'),
        texto
    )
    # Siglas comuns (expandir conforme necessário)
    siglas = {
        "Dr.": "Doutor", "Dra.": "Doutora",
        "Sr.": "Senhor", "Sra.": "Senhora",
        "Art.": "Artigo", "Inc.": "Inciso",
        "CPF": "C P F", "CNPJ": "C N P J",
    }
    for sigla, expansao in siglas.items():
        texto = texto.replace(sigla, expansao)
    return texto
```

---

## Problemas Comuns e Soluções

| Problema | Causa provável | Solução |
|---|---|---|
| Gibberish / fala ininteligível | `language="pt-br"` errado | Usar `language="pt"` |
| Gibberish com áudio curto | Referência < 6s | Usar 10–20s de áudio limpo |
| Voz com sotaque errado | Referência com ruído/eco | Limpar com DeepFilterNet ou RNNoise |
| Números pronunciados errados | Texto não normalizado | Pré-processar com num2words |
| CUDA OOM na L4 | Múltiplos modelos na memória | `torch.cuda.empty_cache()` antes de carregar |
| Áudio cortado no final | Sem padding no texto | Adicionar `"."` ao final do texto |
| Velocidade inconsistente | `speed` não definido | Fixar `speed=1.0` explicitamente |
| Cross-lingual ruim | Embedding calculado uma vez só | Recalcular `get_conditioning_latents` por referência |

---

## Licença

| Componente | Licença |
|---|---|
| Código (coqui-ai/TTS) | MPL-2.0 (Mozilla Public License 2.0) |
| Pesos do modelo (XTTS v2) | **Coqui Public Model License (CPML)** |
| Uso pessoal / pesquisa | ✅ Livre |
| Uso comercial < 1M req/mês | ✅ Permitido |
| Uso comercial > 1M req/mês | ⚠️ Requeria licença comercial com Coqui (empresa encerrada — situação ambígua) |
| Fork Idiap | MPL-2.0 para código; pesos CPML inalterados |

---

## Datasets de Treinamento Declarados

- **LibriTTS** (EN, 585h)
- **VCTK** (EN, 44h, 110 falantes)
- **LJSpeech** (EN)
- **Common Voice** (multilíngue — inclui PT)
- **MLS** (Multilingual LibriSpeech — inclui PT, ~284h)
- **CSS10** (10 idiomas)
- **CMLR** + dados proprietários Coqui não divulgados

---

## Alternativas de Fine-tuning PT-BR sobre XTTS v2

Para melhorar qualidade além do zero-shot:

| Dataset PT-BR | Horas | Falantes | Licença |
|---|---|---|---|
| CML-TTS Portuguese | ~160h | múltiplos | CC-BY-4.0 |
| MLS Portuguese | ~284h | 62 | CC-BY-4.0 |
| Common Voice PT | 50h+ validadas | 1.120+ | CC-0 |
| CETUC | ~145h | 100 | Pesquisa |
| TTS-Portuguese Corpus (Edresson) | ~10.5h | 1 | Open |

Fine-tuning requer ~4h de dados de qualidade para adapter LoRA-style. Script oficial: `TTS/bin/train_tts.py`.
