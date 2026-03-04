# Dependências mínimas do XTTS v2 para inferência Docker slim

**O fork idiap/coqui-ai-TTS (pacote `coqui-tts`) exige Python ≥3.10 e PyTorch ≥2.3 com 27 dependências Python obrigatórias no `pyproject.toml`, mas apenas ~15 são realmente utilizadas no caminho de inferência do XTTS v2.** Várias dependências obrigatórias no arquivo servem exclusivamente outros modelos (Bark, VITS, GlowTTS) ou treinamento, e podem ser eliminadas numa imagem Docker slim que instale apenas os módulos necessários. A nível de sistema, apenas três pacotes `apt` são essenciais: `espeak-ng`, `libsndfile1` e `ffmpeg`. Este relatório mapeia cada dependência à sua função real, separando o que é indispensável do que é descartável.

## Dados extraídos do pyproject.toml (branch `dev`, idiap/coqui-ai-TTS)

O repositório idiap migrou do `setup.py` para `pyproject.toml`. Não existem ficheiros `requirements.txt` separados — tudo está inline. A secção `[project] dependencies` contém **27 pacotes** obrigatórios, com comentários inline que indicam a finalidade de alguns grupos. Eis a lista completa confirmada:

| Dependência | Versão mínima | Comentário no arquivo | Necessária p/ XTTS v2 inference? |
|---|---|---|---|
| `numpy` | **≥2** | — | ✅ Sim |
| `cython` | **≥3.0.0** | — | ❌ Apenas build |
| `scipy` | **≥1.13.0** | — | ⚠️ Indireta (via librosa) |
| `torch` | **≥2.3** | — | ✅ Sim |
| `torchaudio` | **≥2.3.0** | — | ✅ Sim |
| `soundfile` | **≥0.12.0** | — | ✅ Sim (I/O de áudio) |
| `librosa` | **≥0.11.0** | — | ✅ Sim (importado em `xtts.py`) |
| `inflect` | **≥5.6.0** | — | ⚠️ Usado por outros modelos, não XTTS |
| `tqdm` | **≥4.64.1** | — | ⚠️ Barra de progresso (pode ser removido com patch) |
| `anyascii` | **≥0.3.0** | — | ⚠️ Normalização de texto genérica |
| `pyyaml` | **≥6.0** | — | ✅ Sim (configs) |
| `fsspec[http]` | **≥2023.6.0** | — | ✅ Sim (carregamento de checkpoints) |
| `packaging` | **≥23.1** | — | ✅ Sim (verificação de versão PyTorch) |
| `typing_extensions` | **≥4.10** | — | ✅ Sim |
| `pysbd` | **≥0.3.4** | `# Inference` | ✅ Sim (divisão de frases) |
| `matplotlib` | **≥3.8.4** | `# Training` | ❌ Apenas treinamento |
| `coqui-tts-trainer` | **≥0.2.0, <0.3.0** | `# Coqui stack` | ✅ Sim (`trainer.io.load_fsspec`) |
| `coqpit-config` | **≥0.2.0, <0.3.0** | `# Coqui stack` | ✅ Sim (base class `Coqpit`) |
| `monotonic-alignment-search` | **≥0.1.0** | `# Coqui stack` | ❌ Apenas VITS/GlowTTS |
| `gruut[de,es,fr]` | **≥2.4.0** | `# Gruut + langs` | ❌ Fonematizador para modelos não-XTTS |
| `einops` | **≥0.6.0** | `# Tortoise` | ✅ Sim (usado no `perceiver_encoder.py` do XTTS v2) |
| `transformers` | **≥4.47.0** | `# Tortoise` | ✅ Sim (GPT2Config, geração HF) |
| `encodec` | **≥0.1.1** | `# Bark` | ❌ Apenas Bark |
| `num2words` | **≥0.5.14** | `# XTTS` | ✅ Sim (expansão de números no tokenizer) |
| `spacy[ja]` | **≥3.8, <4** | `# XTTS` | ⚠️ Apenas japonês (pode omitir se não usar `ja`) |

O campo `requires-python` é **`">=3.10,<3.15"`**. A partir da versão **0.27.4**, PyTorch não é incluído por default e precisa ser instalado separadamente.

## Dependências opcionais e de desenvolvimento declaradas no pyproject.toml

O arquivo declara extras em `[project.optional-dependencies]` e groups em `[dependency-groups]`. Nenhuma destas é necessária para inferência XTTS v2 básica:

**Extras opcionais (podem ser totalmente omitidos):**

- **`notebooks`**: `bokeh>=3.0.3`, `pandas>=1.4,<3.0`, `umap-learn>=0.5.1`
- **`server`**: Dependências Flask para o servidor web TTS embutido
- **`ja`**: `mecab-python3>=1.0.6`, `unidic-lite==1.0.8`, `cutlet>=0.2.0` (G2P japonês avançado)
- **`ko`**: `jamo`, `g2pkk>=0.1.1`, `hangul_romanize` (G2P coreano)
- **`zh`**: `jieba>=0.42.1`, `pypinyin>=0.40.0` (G2P chinês)
- **`bn`**: `bangla`, `bnnumerizer`, `bnunicodenormalizer` (G2P bangla)
- **`languages`**: Todas as dependências de idiomas (`bn + ja + ko + zh`)
- **`all`**: `notebooks + server + languages`
- **`cpu`/`cuda`/`codec`/`codec-cuda`**: Extras de conveniência para instalação de PyTorch

**Grupos de desenvolvimento (nunca necessários em produção):**

- **`dev`**: `coverage[toml]>=7`, `pre-commit>=4`, `pytest>=8`, `ruff==0.9.1`
- **`docs`**: `furo>=2024.8.6`, `myst-parser==3.0.1`, `sphinx==7.4.7`, `sphinx_inline_tabs>=2023.4.21`, `sphinx_copybutton>=0.5.2`, `linkify-it-py>=2.0.3`

## Três pacotes apt são tudo o que o sistema operacional precisa

A Makefile do repositório idiap (`make system-deps`) declara exatamente:

```bash
sudo apt-get install -y libsndfile1-dev ffmpeg
```

Adicionalmente, o Dockerfile do repositório original coqui-ai/TTS instala:

```bash
apt-get install -y --no-install-recommends gcc g++ make python3 python3-dev python3-pip python3-venv python3-wheel espeak-ng libsndfile1-dev
```

Para uma imagem de **inferência-only** slim, os requisitos de sistema mínimos são:

| Pacote apt | Propósito | Necessário? |
|---|---|---|
| **`espeak-ng`** | Backend de fonematização — usado pelo XTTS tokenizer | ✅ Essencial |
| **`libsndfile1`** | Biblioteca C para I/O de áudio (WAV, FLAC); requerida por `soundfile` | ✅ Essencial |
| **`ffmpeg`** | Conversão/decodificação de formatos de áudio | ✅ Recomendado |
| `gcc`, `g++`, `make` | Compilação de extensões C/Cython | ❌ Apenas build-time (usar wheel pré-compilado) |
| `python3-dev` | Headers Python para build | ❌ Apenas build-time |
| `libsndfile1-dev` | Headers de desenvolvimento | ❌ Apenas build-time (`libsndfile1` runtime basta) |

Numa imagem de inferência, basta instalar `libsndfile1` (runtime) em vez de `libsndfile1-dev`, pois não há compilação.

## CUDA ≥11.8 e PyTorch ≥2.3 como piso, com ressalvas para 2.6+

O `pyproject.toml` do idiap fork especifica **`torch>=2.3`** e **`torchaudio>=2.3.0`**. A versão de CUDA não é pinned no pyproject.toml — é determinada pela build de PyTorch instalada. Os dados concretos dos repositórios são:

- **xtts-streaming-server Dockerfile padrão**: PyTorch **2.1** + CUDA **11.8**
- **xtts-streaming-server Dockerfile.cuda121**: PyTorch **2.1+** + CUDA **12.1**
- **README do idiap**: "testado com PyTorch **2.2+**"
- **pyproject.toml idiap**: `torch>=2.3` (piso explícito)
- **PyTorch ≥2.9**: Requer instalação adicional de `torchcodec`
- **cuDNN**: Versão não pinned em nenhum arquivo do repositório — depende da build do PyTorch

**Alerta crítico para PyTorch ≥2.6**: A partir desta versão, `torch.load()` passa a usar `weights_only=True` por padrão, o que **quebra o carregamento de checkpoints XTTS v2** que incluem objetos `XttsConfig`. O idiap fork já corrigiu isto internamente, mas builds customizadas devem usar `torch.serialization.add_safe_globals` ou verificar que a versão do `coqui-tts` instalada já inclui o patch.

## Mapa preciso dos imports do XTTS v2 no caminho de inferência

A análise dos ficheiros-fonte do XTTS v2 revela exactamente quais pacotes third-party são importados no caminho de inferência (excluindo stdlib):

| Ficheiro | Imports third-party |
|---|---|
| `TTS/tts/models/xtts.py` | `torch`, `torchaudio`, `librosa`, `coqpit` (via coqpit-config), `trainer.io` (via coqui-tts-trainer) |
| `TTS/tts/layers/xtts/gpt.py` | `torch`, `transformers` (GPT2Config) |
| `TTS/tts/layers/xtts/gpt_inference.py` | `torch`, `transformers` (GPT2PreTrainedModel) |
| `TTS/tts/layers/xtts/tokenizer.py` | `torch`, `num2words`, `spacy` (condicional, apenas `ja`) |
| `TTS/tts/layers/xtts/hifigan_decoder.py` | `torch` |
| `TTS/tts/layers/xtts/perceiver_encoder.py` | `torch`, `einops` |
| `TTS/tts/layers/xtts/latent_encoder.py` | `torch` |
| `TTS/tts/layers/xtts/stream_generator.py` | `torch`, `transformers` |
| `TTS/tts/layers/xtts/xtts_manager.py` | `torch` |
| `TTS/api.py` | `numpy`, `torch` |

O método `train_step()` do `xtts.py` levanta `NotImplementedError`, confirmando que o ficheiro principal do modelo é focado em inferência. O treinamento real está em `TTS/tts/layers/xtts/trainer/gpt_trainer.py`, que importa adicionalmente `matplotlib` e módulos de dataset.

## Dockerfiles e imagens oficiais de referência

Existem **três fontes oficiais** de Dockerfiles/imagens:

**1. idiap/coqui-ai-TTS** (fork ativo):
- `Dockerfile` na raiz do repo (branch `dev`)
- `dockerfiles/Dockerfile.dev` para desenvolvimento
- Imagens publicadas no GHCR:
  - **CPU**: `ghcr.io/idiap/coqui-tts-cpu`
  - **GPU**: `ghcr.io/idiap/coqui-tts`
- Entrypoint: CLI `tts`

**2. coqui-ai/TTS** (original, arquivado):
- Base: imagem Python genérica (não NVIDIA CUDA)
- Apt: `gcc g++ make python3 python3-dev python3-pip python3-venv python3-wheel espeak-ng libsndfile1-dev`
- Instala: `requirements.txt` + `requirements.dev.txt` + `requirements.notebooks.txt` (tudo, sem distinção inferência/treino)
- Entrypoint: `tts`, CMD: `--help`

**3. coqui-ai/xtts-streaming-server** (servidor XTTS dedicado):
- Três variantes: CUDA 11.8, CUDA 12.1, CPU-only
- Base: imagens NVIDIA CUDA (para GPU) ou Python (para CPU)
- Apt: `sox`, `ffmpeg`, `git`
- Usa FastAPI (porta 80 interna → 8000 externa)
- Variáveis de ambiente: `COQUI_TOS_AGREED=1`, `NUM_THREADS`, `USE_CPU`
- Imagens: `ghcr.io/coqui-ai/xtts-streaming-server:{latest,latest-cuda121,latest-cpu}`

## Receita: a imagem Docker mais slim possível para XTTS v2

Com base nos dados factuais acima, a lista mínima absoluta para inferência XTTS v2 (assumindo apenas inglês ou idiomas que não precisam de G2P especial) seria:

**Sistema (apt — runtime only):**
```
espeak-ng libsndfile1 ffmpeg
```

**Python (pip — apenas o necessário para XTTS v2 inference):**
```
torch>=2.3
torchaudio>=2.3.0
numpy>=2
scipy>=1.13.0
librosa>=0.11.0
soundfile>=0.12.0
transformers>=4.47.0
einops>=0.6.0
num2words>=0.5.14
coqpit-config>=0.2.0,<0.3.0
coqui-tts-trainer>=0.2.0,<0.3.0
fsspec[http]>=2023.6.0
pysbd>=0.3.4
pyyaml>=6.0
packaging>=23.1
typing_extensions>=4.10
anyascii>=0.3.0
tqdm>=4.64.1
```

**Dependências que podem ser ELIMINADAS de uma imagem inference-only XTTS v2:**

| Pacote | Razão da exclusão |
|---|---|
| `matplotlib>=3.8.4` | Explicitamente marcado como `# Training` |
| `monotonic-alignment-search>=0.1.0` | Apenas para VITS/GlowTTS (alinhamento monotónico) |
| `gruut[de,es,fr]>=2.4.0` | Fonematizador para modelos não-XTTS (Tacotron, VITS) |
| `encodec>=0.1.1` | Explicitamente marcado como `# Bark` |
| `cython>=3.0.0` | Dependência de build, não runtime |
| `inflect>=5.6.0` | Processamento de números inglês para modelos não-XTTS |
| `spacy[ja]>=3.8,<4` | Apenas tokenização japonesa — omitir se não usar japonês (pacote pesado: ~500MB+) |
| Todos os extras (`notebooks`, `server`, `dev`, `docs`, `bn`, `ja`, `ko`, `zh`) | Opcionais por definição |

## Conclusão

A construção de uma imagem Docker slim para XTTS v2 inference-only pode reduzir significativamente o footprint. Das **27 dependências** obrigatórias no `pyproject.toml`, **7 são elimináveis** por servirem exclusivamente treinamento ou outros modelos. A maior economia vem de excluir `spacy[ja]` (~500MB+), `gruut` (com seus sub-pacotes de idiomas) e `matplotlib`. O `coqui-tts-trainer` é paradoxalmente necessário mesmo para inferência, pois `xtts.py` importa `trainer.io.load_fsspec` para carregamento de checkpoints — este é um acoplamento arquitectural que impede a eliminação total das dependências do stack de treino sem patches no código-fonte. Para a versão mínima de CUDA, nenhum valor está pinned nos ficheiros de configuração; o piso prático é **CUDA 11.8**, derivado dos Dockerfiles do xtts-streaming-server e da compatibilidade com PyTorch ≥2.3.