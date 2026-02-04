# TTS Implementation Design - ELCO-machina

**Data:** 2026-02-04
**Status:** Draft

---

## 1. Objetivo

Adicionar funcionalidade de Text-to-Speech (TTS) ao app ELCO-machina, permitindo:
- Leitura de textos com vozes naturais
- Clonagem de voz do usuario para leitura personalizada

---

## 2. Arquitetura Hibrida

```
+-------------------+     +-------------------+
|   ELCO-machina    |     |    VM Oracle      |
|   (Frontend)      |     |   (Sidecar)       |
+-------------------+     +-------------------+
         |                         |
         |  /synthesize            |
         +------------------------>|
         |  (texto + config)       |
         |                         |
         |   Piper (CPU)           |  <-- Leitura rapida
         |   OU                    |
         |   proxy para Modal      |  <-- Voz clonada
         |                         |
         |<------------------------+
         |  (audio WAV/MP3)        |
+-------------------+     +-------------------+

                    Modal (T4 GPU)
                    +-------------------+
                    |   Chatterbox      |
                    |   (batching)      |
                    +-------------------+
```

---

## 3. Modelos Escolhidos

### 3.1 Leitura Utilitaria (VM - CPU)

**Piper TTS**
- Parametros: ~15M (ONNX)
- RAM: 2-4 GB
- Velocidade: 10-50x tempo real
- Vozes: Catalogo pre-treinado (PT-BR disponivel)
- Clonagem: Nao
- SSML: Nao nativo (preprocessamento necessario)

### 3.2 Voz Clonada (Modal - GPU)

**Chatterbox**
- GPU: T4 (minimo)
- Velocidade: Tempo real ou melhor
- Clonagem: Zero-shot com ~10s de referencia
- Qualidade: Alta fidelidade
- Custo: ~$0.20-0.30/hora (batching minimiza)

---

## 4. Componentes a Implementar

### 4.1 Backend (Sidecar Python)

**Novos arquivos:**
```
sidecar/voice_ai/
  services/
    tts_service.py      # Piper local
    tts_modal_client.py # Cliente para Modal
  routers/
    synthesize.py       # Endpoint /synthesize
  utils/
    text_preprocessor.py # Markdown -> texto limpo
```

**Endpoint `/synthesize`:**
```python
POST /synthesize
{
  "text": "Texto para ler",
  "voice": "pt-br-edresson" | "cloned",
  "speed": 1.0,
  "format": "wav" | "mp3"
}

Response: audio/wav ou audio/mpeg (streaming ou arquivo)
```

### 4.2 Modal Function (Chatterbox)

**Novo repositorio ou modulo:**
```
modal_functions/
  tts_chatterbox.py  # @modal.function para Chatterbox
```

**Estrutura:**
```python
import modal

app = modal.App("elco-tts")

image = modal.Image.debian_slim().pip_install(
    "chatterbox-tts",
    "torch",
    "torchaudio"
)

@app.function(
    image=image,
    gpu="T4",
    timeout=300,
    secrets=[modal.Secret.from_name("elco-tts-config")]
)
def synthesize_with_clone(text: str, voice_ref: bytes) -> bytes:
    # Carrega Chatterbox
    # Processa texto
    # Retorna audio
    pass
```

### 4.3 Frontend (App.tsx)

**Mudancas:**
1. Botao "Read Text" abaixo de "Refine Text"
2. Seletor de voz nas configuracoes
3. Player de audio para ouvir resultado
4. Download do audio gerado

**Estado novo:**
```typescript
const [isSpeaking, setIsSpeaking] = useState(false);
const [selectedVoice, setSelectedVoice] = useState<'local' | 'cloned'>('local');
const [audioUrl, setAudioUrl] = useState<string | null>(null);
```

---

## 5. Preprocessamento de Texto

### 5.1 Estrategia

Markdown/formatacao -> Texto limpo com instrucoes de prosody

| Input | Output |
|-------|--------|
| `# Titulo` | `[PAUSA LONGA] Titulo [PAUSA LONGA]` |
| `## Subtitulo` | `[PAUSA MEDIA] Subtitulo [PAUSA MEDIA]` |
| `- item` | `Item um. Item dois.` |
| `**bold**` | `bold` (sem asteriscos) |
| ``` code ``` | `[Bloco de codigo omitido]` |
| `[link](url)` | `link` (sem URL) |

### 5.2 Implementacao

```python
# text_preprocessor.py
import re

def preprocess_for_tts(text: str, read_code: bool = False) -> str:
    # Remove code blocks
    if not read_code:
        text = re.sub(r'```[\s\S]*?```', '[Bloco de codigo omitido]', text)

    # Headers -> pausas
    text = re.sub(r'^# (.+)$', r'... \1 ...', text, flags=re.MULTILINE)
    text = re.sub(r'^## (.+)$', r'.. \1 ..', text, flags=re.MULTILINE)

    # Remove formatting
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)  # bold
    text = re.sub(r'\*(.+?)\*', r'\1', text)       # italic
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text) # links

    # Lists
    text = re.sub(r'^[-*] ', '', text, flags=re.MULTILINE)

    return text.strip()
```

---

## 6. Fluxo de Dados

### 6.1 Leitura Local (Piper)

```
1. Usuario clica "Read Text"
2. Frontend envia POST /synthesize {text, voice: "local"}
3. Sidecar preprocessa texto
4. Piper gera audio WAV
5. Sidecar retorna audio
6. Frontend toca audio / oferece download
```

### 6.2 Voz Clonada (Modal)

```
1. Usuario clica "Read Text" com voz clonada selecionada
2. Frontend envia POST /synthesize {text, voice: "cloned"}
3. Sidecar preprocessa texto
4. Sidecar chama Modal function (batching)
5. Modal acorda T4, carrega Chatterbox
6. Chatterbox processa com referencia de voz
7. Modal retorna audio
8. Sidecar repassa para frontend
9. Frontend toca audio / oferece download
```

---

## 7. Configuracoes do Usuario

### 7.1 Novas opcoes em Settings

| Config | Tipo | Default | Descricao |
|--------|------|---------|-----------|
| `tts_voice` | select | `pt-br-edresson` | Voz para leitura local |
| `tts_speed` | slider | 1.0 | Velocidade (0.5 - 2.0) |
| `tts_use_clone` | boolean | false | Usar voz clonada |
| `tts_voice_ref` | file | null | Audio de referencia para clonagem |

### 7.2 Persistencia

Usar Tauri Store existente (`settings.json`).

---

## 8. Fases de Implementacao

### Fase 1: Piper Local (MVP)

**Escopo:**
- [ ] Instalar Piper na VM
- [ ] Criar endpoint `/synthesize`
- [ ] Preprocessador basico
- [ ] Botao "Read Text" no frontend
- [ ] Player de audio simples

**Estimativa:** 1-2 sessoes

### Fase 2: Modal + Chatterbox

**Escopo:**
- [ ] Configurar Modal function
- [ ] Integrar com sidecar
- [ ] Upload de audio de referencia
- [ ] Seletor local/clonado no frontend

**Estimativa:** 1-2 sessoes

### Fase 3: Polish

**Escopo:**
- [ ] Controle de velocidade
- [ ] Mais vozes Piper
- [ ] Cache de audios gerados
- [ ] Progress indicator para Modal

**Estimativa:** 1 sessao

---

## 9. Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|---------------|---------|-----------|
| Piper nao tem voz PT-BR boa | Media | Alto | Testar vozes, considerar Kokoro |
| Cold start Modal muito lento | Baixa | Medio | Keep-warm ou aceitar delay |
| Texto muito longo causa timeout | Media | Medio | Chunking + streaming |
| Qualidade Chatterbox insuficiente | Baixa | Alto | Testar antes, ter fallback |

---

## 10. Proximos Passos

1. **Testar Piper localmente** - validar vozes PT-BR
2. **Implementar endpoint basico** - sem clonagem
3. **Adicionar botao no frontend** - MVP funcional
4. **Configurar Modal** - baseado em configs do text-extractor
5. **Integrar Chatterbox** - voz clonada funcionando

---

## Apendice A: Vozes Piper Disponiveis (PT-BR)

Verificar em: https://rhasspy.github.io/piper-samples/

- `pt_BR-edresson-low`
- `pt_BR-faber-medium`

## Apendice B: Referencia Modal (text-extractor)

### Padroes Extraidos do lex-vector

**Estrutura base:**
```python
import modal

app = modal.App("elco-tts")  # Nome do app

# Imagem com dependencias
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libsndfile1", "ffmpeg")  # Audio deps
    .pip_install(
        "chatterbox-tts",
        "torch>=2.0.0",
        "torchaudio",
    )
)

# Volume para cache de modelos
model_cache = modal.Volume.from_name("elco-tts-cache", create_if_missing=True)
```

**Funcao com GPU T4 + Snapshot (cold start rapido):**
```python
@app.cls(
    image=image,
    gpu="T4",
    timeout=1800,
    volumes={"/cache": model_cache},
    enable_memory_snapshot=True,
)
class TTSEngine:
    @modal.enter(snap=True)
    def warmup(self):
        # Carrega modelos - estado capturado no snapshot
        from chatterbox import ChatterboxTTS
        self.model = ChatterboxTTS.from_pretrained()

    @modal.method()
    def synthesize(self, text: str, voice_ref: bytes) -> bytes:
        # self.model ja disponivel instantaneamente
        audio = self.model.generate(text, voice_ref)
        return audio
```

**Integracao com backend (chamar do sidecar):**
```python
import modal

def synthesize_with_modal(text: str, voice_ref: bytes) -> bytes:
    tts_fn = modal.Function.from_name("elco-tts", "TTSEngine.synthesize")
    return tts_fn.remote(text, voice_ref)
```

**Comandos de deploy:**
```bash
# Deploy
modal deploy modal_tts.py

# Pre-warmup (cria snapshot)
modal run modal_tts.py --warmup

# Health check
modal run modal_tts.py --health
```

**Variaveis de ambiente (no sidecar):**
```
MODAL_ENABLED=true
MODAL_TOKEN_ID=<token>
MODAL_TOKEN_SECRET=<secret>
```

### Custos

| GPU | Custo/hora | Uso |
|-----|------------|-----|
| T4 | $0.59 | Recomendado para TTS |
| A100-80GB | $3.50 | Overkill para TTS |

Com GPU Snapshot, cold start reduz de ~2min para ~10s.
