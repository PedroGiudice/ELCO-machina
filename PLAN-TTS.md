# Analise TTS (Chatterbox/Piper) + Plano de Migracao para VM

Data: 2026-02-11
Escopo: Mapeamento do pipeline TTS, infraestrutura Modal atual, gaps, e plano de migracao para VM OCI (16 vCPUs / 64GB RAM).

---

## Mapa de Servicos TTS (XML)

```xml
<tts_analysis>

<chatterbox_modal loc="modal_functions/tts_chatterbox.py" client="sidecar/voice_ai/services/tts_modal_client.py">
  <engine>Chatterbox TTS (resemble-ai/chatterbox)</engine>
  <infra>Modal serverless GPU (T4), app="elco-tts", class="TTSEngine"</infra>
  <deploy>modal deploy modal_functions/tts_chatterbox.py</deploy>
  <cold_start>
    Com memory snapshot + GPU snapshot: ~10s
    Sem snapshot (primeiro deploy): ~2min
  </cold_start>
  <model_loading>
    Fase 1 (snap=True): carrega ChatterboxTTS na CPU (capturado no snapshot)
    Fase 2 (snap=False): re-carrega na GPU apos restore
    Cache: Modal Volume "elco-tts-cache" em /cache/chatterbox
  </model_loading>
  <image>
    debian_slim python3.11
    apt: libsndfile1, ffmpeg
    pip: chatterbox-tts, torch>=2.0.0, torchaudio, soundfile
  </image>
  <generate>
    model.generate(text, audio_prompt_path=ref_file, exaggeration=X, cfg_weight=Y)
    NOTA: so passa exaggeration e cfg_weight ao model.generate()
    Os outros 9 parametros (speed, stability, steps, sentence_silence, embedding_scale,
    temperature, repetition_penalty, top_p, seed) sao DECLARADOS na assinatura
    mas NAO sao passados ao modelo. Sao ignorados silenciosamente.
  </generate>
  <output>WAV bytes via torchaudio.save()</output>
  <voice_cloning>
    voice_ref_bytes -> tempfile .wav -> audio_prompt_path
    Sem ref: model.generate(text) sem clonagem (voz default inglesa)
  </voice_cloning>
  <auth>MODAL_TOKEN_ID + MODAL_TOKEN_SECRET (env vars no sidecar)</auth>
</chatterbox_modal>

<piper_local loc="sidecar/voice_ai/services/tts_service.py">
  <engine>Piper TTS (ONNX, rhasspy/piper)</engine>
  <vozes>
    pt-br-edresson-low (masculina, baixa qualidade)
    pt-br-faber-medium (masculina, qualidade media) -- DEFAULT
  </vozes>
  <download>HuggingFace automatico (rhasspy/piper-voices)</download>
  <uso_real>
    1. Fallback quando Modal indisponivel
    2. Gera voice_ref PT-BR default para Chatterbox (synthesize.py:40-66)
  </uso_real>
  <output>WAV bytes via wave.open()</output>
</piper_local>

<sidecar_router loc="sidecar/voice_ai/routers/synthesize.py">
  <endpoint>POST /synthesize</endpoint>
  <decisao>
    voice=="cloned" -> _synthesize_with_modal() -> TTSModalClient -> Modal GPU
    voice=="pt-br-*" -> _synthesize_with_piper() -> TTSService local
  </decisao>
  <voice_ref_fallback>
    Se usuario nao envia voice_ref E engine=chatterbox:
    Piper gera referencia PT-BR automatica (texto pre-definido, cacheado em global _default_ptbr_ref)
    Texto: "A comunicacao clara e objetiva e fundamental em qualquer contexto profissional..."
  </voice_ref_fallback>
  <preprocessamento>
    preprocess=true -> text_preprocessor.preprocess_for_tts()
    Remove markdown, headers viram pausas, limpa formatacao
  </preprocessamento>
  <endpoints_auxiliares>
    POST /synthesize/info -- estimativa de duracao sem gerar audio
    GET /synthesize/voices -- lista vozes disponiveis (local + Modal)
    GET /synthesize/profiles -- lista profiles TTS e descricoes
    GET /synthesize/modal/status -- health check do Modal
  </endpoints_auxiliares>
</sidecar_router>

<tts_modal_client loc="sidecar/voice_ai/services/tts_modal_client.py">
  <papel>Ponte entre sidecar FastAPI e Modal serverless</papel>
  <invocacao>modal.Cls.from_name("elco-tts", "TTSEngine").synthesize.remote(...)</invocacao>
  <check>_check_modal_available(): verifica import modal + env vars</check>
  <health>engine().health.remote() -> dict com GPU info</health>
</tts_modal_client>

<frontend_tts>
  <app_tsx loc="App.tsx:671-794">
    Estado: ttsEngine, ttsProfile, voiceRefAudio, ttsCustomParams, isSpeaking
    Persistencia: localStorage("tts_settings")
    Chamada: fetch() DIRETO (nao safeFetch) -> POST sidecar/synthesize
    Sem timeout. Sem tratamento diferenciado piper vs chatterbox.
    Playback: new Audio(URL.createObjectURL(blob)).play()
  </app_tsx>
  <hook_morto loc="src/hooks/useTTS.ts">
    Implementacao completa (331 linhas), NAO importada pelo App.tsx
    Superior: usa safeFetch, timeout 180s (chatterbox) / 30s (piper),
    error handling GStreamer Linux, cleanup de URL
  </hook_morto>
  <panel loc="src/components/panels/PanelTTS.tsx">
    Engine toggle: Chatterbox | Piper
    Profiles: standard, legal, expressive, fast_preview, custom
    Custom params: sliders para exaggeration, speed, stability, steps
    Voice cloning: upload de audio ref (base64)
  </panel>
</frontend_tts>

<pipeline_completo>
  <step n="1">Usuario clica "Read Text Aloud" no Editor ou PanelTTS</step>
  <step n="2">App.tsx:713 monta requestBody com texto, engine, profile/params, voice_ref</step>
  <step n="3">fetch() -> POST sidecar:8765/synthesize</step>
  <step n="4">Sidecar decide: voice=="cloned" -> Modal, else -> Piper local</step>
  <step n="5a_modal">
    TTSModalClient.synthesize() -> modal.Cls.from_name("elco-tts","TTSEngine").synthesize.remote()
    Modal container (T4 GPU) carrega Chatterbox, gera WAV
    Retorna bytes ao sidecar
  </step>
  <step n="5b_piper">
    TTSService.synthesize() -> Piper ONNX local
    Gera WAV na CPU do sidecar
  </step>
  <step n="6">Sidecar retorna WAV bytes como Response (media_type="audio/wav")</step>
  <step n="7">Frontend: Blob -> URL.createObjectURL -> Audio().play()</step>
</pipeline_completo>

<profiles loc="sidecar/voice_ai/schemas/tts_profiles.py">
  <standard>defaults (exag=0.5, speed=1.0, stability=0.5, steps=10)</standard>
  <legal>formal (exag=0.35, cfg=0.85, stability=0.8, steps=12, rep_penalty=1.2, silence=0.4)</legal>
  <expressive>emocional (exag=0.9, cfg=0.3, stability=0.3, steps=15, temp=0.5)</expressive>
  <fast_preview>rapido (speed=1.2, steps=4)</fast_preview>
  <nota>PanelTTS.tsx define 5 profiles (inclui "custom") mas BUILTIN_PROFILES tem 4 (sem "custom")</nota>
</profiles>

</tts_analysis>
```

---

## Falhas e Gaps do TTS

### CRITICO: 9 de 11 parametros do Chatterbox sao ignorados silenciosamente

`modal_functions/tts_chatterbox.py:170-183`:

```python
gen_kwargs = {
    "exaggeration": exaggeration,
    "cfg_weight": cfg_weight,
}

wav = self.model.generate(text, audio_prompt_path=..., **gen_kwargs)
```

O metodo `synthesize()` aceita 11 parametros na assinatura (exaggeration, speed, stability, steps, sentence_silence, cfg_weight, embedding_scale, temperature, repetition_penalty, top_p, seed). Mas `model.generate()` so recebe **2**: `exaggeration` e `cfg_weight`.

Os outros 9 parametros sao recebidos pelo metodo, **descartados**, e nunca chegam ao modelo. O usuario ajusta sliders de "speed", "stability", "steps" no PanelTTS e **nada muda** no audio gerado.

Isso significa que:
- O profile "legal" com `stability=0.8, steps=12, repetition_penalty=1.2` nao faz nada alem de `exaggeration=0.35, cfg_weight=0.85`
- O profile "expressive" com `stability=0.3, steps=15, temperature=0.5` nao faz nada alem de `exaggeration=0.9, cfg_weight=0.3`
- O profile "fast_preview" com `speed=1.2, steps=4` nao faz **absolutamente nada** (nem exaggeration nem cfg_weight diferem do default)

**Causa provavel:** a API do ChatterboxTTS.generate() pode nao aceitar esses parametros, ou aceita com nomes diferentes. Precisa verificar a documentacao do `chatterbox-tts` para saber quais kwargs `generate()` realmente suporta.

### CRITICO: TTS no App.tsx usa fetch() sem safeFetch, sem timeout

`App.tsx:749`:
```typescript
const response = await fetch(`${sidecar.whisperServerUrl}/synthesize`, { ... });
```

- Sem `safeFetch` -- pode quebrar no AppImage (scope Tauri)
- Sem timeout -- Chatterbox com cold start pode travar indefinidamente
- Sem tratamento diferenciado por engine

O hook `useTTS.ts` (nao utilizado) ja resolve todos esses problemas:
- Usa `safeFetch`
- Timeout 180s para Chatterbox, 30s para Piper
- Tratamento de AbortError com mensagem especifica
- Tratamento de erro GStreamer no Linux

### CRITICO: useTTS.ts existe completo mas nao e usado

Mesmo padrao do ATT. Hook completo, implementacao superior, ignorado pelo App.tsx que reimplementa tudo inline.

### GRAVE: Profiles desalinhados entre frontend e sidecar

| Frontend (PanelTTS.tsx) | Sidecar (tts_profiles.py) |
|-------------------------|--------------------------|
| standard | standard |
| legal | legal |
| expressive | expressive |
| fast_preview | fast_preview |
| **custom** | **(nao existe)** |

`PanelTTS.tsx:42-48` lista 5 profiles. `BUILTIN_PROFILES` tem 4. O profile "custom" no frontend envia `ttsCustomParams` diretamente -- funciona porque o sidecar aceita `params` como override. Mas nao ha validacao: se o frontend enviar `profile="custom"`, o sidecar chama `get_profile("custom")` que retorna o default "standard".

### GRAVE: Conversao MP3 nao implementada

`synthesize.py:165`:
```python
content_type = "audio/wav"
# TODO: Converter para MP3 se solicitado
```

O request aceita `format: "wav" | "mp3"` mas sempre retorna WAV. O header `Content-Disposition` mente dizendo `speech.mp3` quando o conteudo e WAV.

### MODERADO: Voice ref PT-BR gerada por Piper e mediocre

O Chatterbox usa como referencia de clonagem um audio gerado pelo Piper (voz sintetica de qualidade media). Clonar uma voz sintetica produz resultado inferior a clonar uma voz humana real. O texto pre-definido ("A comunicacao clara e objetiva...") e generico e nao cobre todos os fonemas do PT-BR de forma otimizada.

Na migracao para VM, com Chatterbox rodando localmente, seria possivel usar uma amostra de voz humana real pre-gravada como default.

### MODERADO: Sem chunking no synthesize

`text_preprocessor.py` implementa `split_into_chunks()` mas o router `synthesize.py` nao usa. Textos longos sao enviados inteiros ao Chatterbox. Para textos > ~500 chars, a qualidade degrada e o tempo de geracao cresce exponencialmente.

### MENOR: TTS settings persistidos em localStorage cru

`App.tsx:689-711`: `tts_settings` em localStorage sem encriptacao. Inclui `voiceRef` (audio de referencia em base64) que pode ser grande (MB) e nao pertence ao localStorage (limite ~5-10MB).

---

## Plano de Migracao: Modal -> VM OCI

### Contexto

- VM OCI: 16 vCPUs, 64GB RAM (mesma maquina do Whisper)
- Chatterbox ja esta na VM (modelos baixados)
- Objetivo: eliminar dependencia do Modal, rodar Chatterbox localmente na VM
- Piper continua como fallback rapido (CPU)

### Fase 1: Novo servico Chatterbox na VM

#### 1.1 Criar `sidecar/voice_ai/services/tts_chatterbox_local.py`

Equivalente local do que roda no Modal, mas como servico dentro do sidecar FastAPI.

```python
class ChatterboxLocalService:
    def __init__(self, device="auto", cache_dir="~/.cache/chatterbox"):
        self._model = None
        self._device = device
        self._cache_dir = cache_dir

    def _ensure_loaded(self):
        """Lazy load do modelo (primeira chamada carrega)."""
        if self._model:
            return
        from chatterbox.tts import ChatterboxTTS
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self._model = ChatterboxTTS.from_pretrained(device=device)

    def synthesize(self, text, voice_ref_path=None, **kwargs) -> bytes:
        """Sintetiza texto em audio WAV."""
        self._ensure_loaded()
        # Passar TODOS os kwargs que model.generate() realmente aceita
        wav = self._model.generate(text, audio_prompt_path=voice_ref_path, **valid_kwargs)
        # Converter tensor -> WAV bytes
        return wav_bytes

    def unload(self):
        """Libera modelo da memoria."""

    @property
    def is_available(self) -> bool:
        """Verifica se chatterbox-tts esta instalado."""
```

#### 1.2 Atualizar `sidecar/voice_ai/main.py`

Inicializar `ChatterboxLocalService` no lifespan, injetar via middleware (mesmo padrao dos outros servicos).

#### 1.3 Atualizar `sidecar/voice_ai/routers/synthesize.py`

Substituir path Modal:

```python
# ANTES:
if body.voice == "cloned":
    return await _synthesize_with_modal(request, text, body)  # Modal GPU remoto

# DEPOIS:
if body.voice == "cloned":
    return await _synthesize_with_chatterbox(request, text, body)  # Chatterbox local GPU/CPU
```

#### 1.4 Verificar parametros reais do ChatterboxTTS.generate()

Antes de migrar, investigar quais kwargs `model.generate()` realmente aceita. Os 9 parametros ignorados precisam ser:
- Passados ao modelo (se suportados), ou
- Removidos da API e UI (se nao suportados)

Sem isso, a migracao vai herdar o mesmo bug.

### Fase 2: Limpar infraestrutura Modal

#### 2.1 Remover dependencias Modal do sidecar

- Remover `modal` do `requirements.txt`
- Remover `tts_modal_client.py`
- Remover `MODAL_ENABLED`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` do env/docs

#### 2.2 Mover `modal_functions/` para arquivo/docs

O codigo em `modal_functions/tts_chatterbox.py` serve como referencia de como o Chatterbox foi configurado (imagem Docker, deps, snapshot). Pode virar doc ou ser deletado.

#### 2.3 Atualizar health check

`GET /health` deve reportar Chatterbox local em vez de Modal:
```json
{
  "models": {
    "chatterbox": {
      "status": "loaded|available|not_installed",
      "device": "cuda|cpu",
      "model": "chatterbox-tts"
    }
  }
}
```

### Fase 3: Corrigir parametros e profiles

#### 3.1 Auditar ChatterboxTTS.generate() API

Descobrir quais parametros `generate()` aceita de fato. Ajustar:
- `TTSParameters` em `tts_profiles.py` -- so expor parametros reais
- `BUILTIN_PROFILES` -- recalibrar com parametros que funcionam
- `PanelTTS.tsx` sliders -- remover controles que nao fazem nada

#### 3.2 Implementar chunking

Usar `split_into_chunks()` (ja existe) no router `synthesize.py` para textos longos. Sintetizar chunk por chunk e concatenar WAV.

#### 3.3 Voice ref default

Substituir audio Piper sintetico por amostra de voz humana real (~10s, PT-BR, pre-gravada). Armazenar como arquivo no sidecar.

### Fase 4: Frontend (pos-plano ATT)

Executar DEPOIS da reestruturacao ATT (PLAN.md):
- Ativar hook `useTTS.ts` em vez de logica inline no App.tsx
- Ajustar PanelTTS para refletir parametros reais
- Remover selecao de engine se Piper for deprecado (so Chatterbox)
- Mover voice_ref do localStorage para IndexedDB/Tauri Store (dado binario grande)

---

## Ordem de execucao (TTS)

**Pre-requisito:** PLAN.md (ATT) executado e validado primeiro.

1. **Fase 1.4** -- Auditar API real do ChatterboxTTS.generate() (bloqueia tudo)
2. **Fase 1.1-1.3** -- Servico local + router atualizado
3. **Fase 2** -- Remover Modal
4. **Fase 3** -- Parametros, profiles, chunking, voice ref
5. **Fase 4** -- Frontend (hook + UI)

## Dependencias entre planos

```
PLAN.md (ATT)           PLAN-TTS.md (este)
=============           ==================
Fase 1 (sidecar REST)
Fase 2 (prompt store)
Fase 3 (decomposicao)  -->  Fase 4 (frontend TTS -- usa hooks limpos)
Fase 4 (limpeza)        -->  Fase 2 (remover Modal -- limpeza geral)
```
