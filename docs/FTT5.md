# F5-TTS: guia completo de instalação e API Python

O pacote oficial se chama **`f5-tts`** (com hífen) no pip, mas todos os imports Python usam **`f5_tts`** (com underscore). A API programática de alto nível vive em `f5_tts.api.F5TTS` — uma classe que carrega o modelo, o vocoder e faz inferência em três linhas de código. O modelo v1 Base ocupa **~1,4 GB** em disco (1,35 GB do checkpoint + 54 MB do vocoder Vocos), requer **Python ≥ 3.10** e **PyTorch ≥ 2.0**, e gera áudio a 24 kHz com até ~30 segundos de duração total (referência + gerado).

---

## Instalação: pip, conda e from source

O comando de instalação mais simples é direto do PyPI (versão mais recente: **1.1.16**, fevereiro de 2026):

```bash
pip install f5-tts
```

Antes disso, o projeto recomenda criar um ambiente isolado e instalar PyTorch com suporte à sua GPU:

```bash
conda create -n f5-tts python=3.11
conda activate f5-tts
conda install ffmpeg

# PyTorch com CUDA (ajuste a versão conforme sua GPU)
pip install torch==2.8.0+cu128 torchaudio==2.8.0+cu128 \
  --extra-index-url https://download.pytorch.org/whl/cu128

# Depois o F5-TTS
pip install f5-tts
```

Para desenvolvimento ou uso do vocoder BigVGAN, instale a partir do source:

```bash
git clone https://github.com/SWivid/F5-TTS.git
cd F5-TTS
pip install -e .
```

O **FFmpeg** é dependência obrigatória para processamento de áudio e deve estar instalado no sistema (`conda install ffmpeg` ou `apt install ffmpeg`).

---

## API Python de alto nível: três linhas para gerar áudio

A classe `F5TTS` em `f5_tts.api` é a interface oficial recomendada. Na primeira execução, ela baixa automaticamente o checkpoint (~1,35 GB) e o vocoder Vocos (~54 MB) do HuggingFace.

```python
from f5_tts.api import F5TTS

# Inicializa o modelo (auto-download do HuggingFace na primeira vez)
f5tts = F5TTS()

# Gera áudio a partir de texto + áudio de referência
wav, sr, spec = f5tts.infer(
    ref_file="meu_audio_referencia.wav",
    ref_text="Transcrição exata do áudio de referência.",
    gen_text="Texto que você quer que o modelo sintetize como fala.",
    file_wave="saida.wav",        # opcional: salva o WAV em disco
    file_spec="saida_spec.png",   # opcional: salva o espectrograma
    seed=None,                    # None = aleatório
)
```

O retorno é uma tupla `(wav, sr, spec)` onde **`wav`** é um numpy array float32 mono a **24 kHz**, `sr` é o sample rate (24000), e `spec` é o espectrograma. O parâmetro `file_wave` salva o áudio direto em disco. O exemplo completo oficial do repositório usa `importlib.resources` para localizar o áudio de exemplo embutido no pacote:

```python
from importlib.resources import files
from f5_tts.api import F5TTS

f5tts = F5TTS()

wav, sr, spec = f5tts.infer(
    ref_file=str(files("f5_tts").joinpath("infer/examples/basic/basic_ref_en.wav")),
    ref_text="some call me nature, others call me mother nature.",
    gen_text="I don't really care what you call me. I've been a silent spectator, "
             "watching species evolve, empires rise and fall.",
    file_wave="output.wav",
    seed=42,
)
```

O construtor `F5TTS()` aceita parâmetros para customização avançada:

| Parâmetro | Default | Descrição |
|---|---|---|
| `model` | `"F5TTS_v1_Base"` | Modelo: `"F5TTS_v1_Base"`, `"F5TTS_Base"`, `"E2TTS_Base"` |
| `ckpt_file` | `None` | Caminho local do checkpoint (None = auto-download) |
| `vocab_file` | `""` | Arquivo de vocabulário customizado |
| `device` | `None` | Device (`"cuda"`, `"cpu"`, `"mps"`; None = auto-detect) |
| `ode_method` | `"euler"` | Solver ODE: `"euler"` (rápido) ou `"midpoint"` (melhor qualidade) |
| `use_ema` | `True` | Usar pesos EMA |

---

## API de baixo nível para controle granular

Para quem precisa de controle fino sobre cada etapa do pipeline, o módulo `f5_tts.infer.utils_infer` expõe funções individuais:

```python
import soundfile as sf
from f5_tts.infer.utils_infer import (
    load_vocoder,
    load_model,
    preprocess_ref_audio_text,
    infer_process,
)
from f5_tts.model.backbones.dit import DiT

device = "cuda"

# 1. Carregar vocoder
vocoder = load_vocoder(vocoder_name="vocos", device=device)

# 2. Carregar modelo com config explícita
model_cfg = dict(dim=1024, depth=22, heads=16, ff_mult=2, text_dim=512, conv_layers=4)
ema_model = load_model(
    model_cls=DiT,
    model_cfg=model_cfg,
    ckpt_path="hf://SWivid/F5-TTS/F5TTS_v1_Base/model_1250000.safetensors",
    mel_spec_type="vocos",
    vocab_file="",
    ode_method="euler",
    use_ema=True,
    device=device,
)

# 3. Pré-processar referência (resampling para 24kHz, opcionalmente ASR)
ref_audio, ref_text = preprocess_ref_audio_text(
    "referencia.wav",
    "Transcrição do áudio de referência.",
    device=device,
)

# 4. Inferência
generated_wave, generated_spec, combined_spec = infer_process(
    ref_audio, ref_text,
    gen_text="Texto a ser sintetizado.",
    ema_model=ema_model,
    vocoder=vocoder,
    mel_spec_type="vocos",
    nfe_step=32,          # mais steps = melhor qualidade, mais lento
    cfg_strength=2.0,     # guidance strength
    sway_sampling_coef=-1.0,
    speed=1.0,
    seed=None,
)

# 5. Salvar
sf.write("saida.wav", generated_wave, 24000)
```

Se o `ref_text` for passado como string vazia `""`, o F5-TTS usa automaticamente o **Whisper** para transcrever o áudio de referência — mas isso consome GPU adicional.

---

## Tamanho do modelo e espaço em disco

O modelo principal é um **Diffusion Transformer (DiT)** com ~335M parâmetros, 22 camadas, 16 attention heads e dimensão 1024. Os arquivos de peso ficam no HuggingFace em `SWivid/F5-TTS`:

| Componente | Arquivo | Tamanho |
|---|---|---|
| **F5TTS v1 Base** (recomendado) | `model_1250000.safetensors` | **1,35 GB** |
| **Vocoder Vocos** | `pytorch_model.bin` (charactr/vocos-mel-24khz) | **54 MB** |
| F5TTS Base original | `model_1200000.safetensors` | 1,35 GB |
| F5TTS BigVGAN variant | `model_1250000.pt` | 5,39 GB |
| E2TTS Base | `model_1200000.safetensors` | 1,33 GB |

**Para uso típico, o espaço total necessário é ~1,4 GB** (modelo v1 Base + vocoder Vocos). Ambos são baixados automaticamente na primeira execução e ficam cacheados em `~/.cache/huggingface/hub/`. A variante BigVGAN é significativamente maior (5,39 GB) e raramente necessária.

---

## Dependências completas do pyproject.toml

O pacote declara **28 dependências diretas** no `pyproject.toml`. As mais críticas são:

**Core ML:** `torch>=2.0.0`, `torchaudio>=2.0.0`, `torchdiffeq`, `transformers`, `x_transformers>=1.31.14`, `accelerate>=0.33.0`, `safetensors`

**Vocoder e áudio:** `vocos`, `librosa`, `soundfile`, `pydub`, `torchcodec`

**Processamento de texto:** `jieba` (chinês), `pypinyin` (pinyin), `unidecode`

**Treinamento/logging:** `wandb`, `ema_pytorch>=0.5.2`, `bitsandbytes>0.37.0`, `datasets`, `matplotlib`

**Infraestrutura:** `gradio>=5.0.0`, `click`, `tomli`, `cached_path`, `hydra-core>=1.3.0`, `pydantic<=2.10.6`, `tqdm>=4.65.0`, `transformers_stream_generator`

Vale notar que `numpy<=1.26.4` é exigido apenas para Python 3.10, e `bitsandbytes` é excluído em macOS ARM64. O PyTorch precisa ser instalado separadamente com suporte à sua GPU antes de instalar o `f5-tts`.

## Conclusão

O F5-TTS oferece uma API Python surpreendentemente limpa para um projeto de pesquisa: `from f5_tts.api import F5TTS` seguido de `.infer()` é tudo que se precisa para inferência básica. A distinção importante é **`f5-tts`** (hífen) para o pip e **`f5_tts`** (underscore) para imports — uma convenção padrão Python mas que causa confusão frequente. O modelo v1 Base com 335M parâmetros ocupa apenas 1,4 GB em disco e produz áudio de qualidade com voice cloning zero-shot a partir de ~10-15 segundos de áudio de referência, com limite prático de ~30 segundos de geração total por chamada.