# Contratos de API -- Sidecar Voice AI

Data: 2026-02-11
Status: Referencia para execucao dos PLANs

---

## Visao Geral

```
Frontend (Tauri)                      Sidecar (FastAPI, VM OCI)
================                      ========================
VoiceAIClient.ts  --HTTP-->  /health           GET
                  --HTTP-->  /transcribe        POST   (STT)
                  --HTTP-->  /synthesize        POST   (TTS)
                  --HTTP-->  /synthesize/*      GET    (meta)
```

Base URL configuravel: `localStorage('whisper_server_url')`, default `http://localhost:8765`.
Todas as chamadas passam por `safeFetch` (tauriFetch -> fallback fetch nativo).
CORS: `allow_origins=["*"]`.

---

## 1. Health Check

### `GET /health`

**Contrato atual:**

```typescript
// Response
{
  status: "healthy" | "degraded",
  version: "0.2.0",
  models: {
    whisper: { status: "loaded" | "available" | "not_loaded", model: string | null },
    piper:  { status: "loaded" | "available" | "not_installed", voice: string | null },
    modal:  { status: "disabled" | "available" | "credentials_missing", engine: "chatterbox" }
  },
  error: string | null
}
```

**Frontend espera (VoiceAIClient.ts:82-96):**

```typescript
interface HealthResponse {
  status: "healthy" | "degraded";
  version: string;
  models: {
    whisper: { status: "loaded" | "available" | "not_loaded"; model: string | null };
    xtts:   { status: "loaded" | "available" | "not_implemented"; model: string | null };
    //  ^^^ DESALINHADO: frontend espera "xtts", backend retorna "piper" + "modal"
  };
  error: string | null;
}
```

**Desalinhamento:** Frontend define `models.xtts` (vestigio do XTTS, engine TTS anterior). Backend retorna `models.piper` + `models.modal`. O frontend nunca le esses campos alem do health check, entao nao quebra, mas o tipo esta errado.

**Contrato alvo (pos-migracao):**

```typescript
{
  status: "healthy" | "degraded",
  version: string,
  models: {
    whisper:     { status: "loaded" | "available" | "not_loaded", model: string | null },
    chatterbox:  { status: "loaded" | "available" | "not_installed", device: "cuda" | "cpu" | null },
    piper:       { status: "loaded" | "available" | "not_installed", voice: string | null }
  },
  error: string | null
}
```

Mudanca: `modal` vira `chatterbox` (rodando local na VM, nao mais serverless).

---

## 2. Transcricao (STT)

### `POST /transcribe`

**Contrato atual = contrato alvo** (sem mudanca prevista)

```typescript
// Request
{
  audio: string,                                    // REQUIRED, base64
  format: "webm" | "wav" | "mp3" | "ogg" | "m4a",  // default "webm"
  language: string | null,                          // default "pt", null=auto
  refine: boolean,                                  // default false
  style: OutputStyle                                // default "verbatim"
}

// Response
{
  text: string,                       // Whisper bruto
  refined_text: string | null,        // Gemini refinado (se refine=true)
  language: string,
  confidence: number,                 // 0-1
  duration: number,                   // segundos
  segments: TranscriptionSegment[],
  refine_success: boolean | null,
  refine_error: string | null
}

// TranscriptionSegment
{ start: number, end: number, text: string, confidence: number }
```

**OutputStyle:**
`"verbatim" | "elegant_prose" | "formal" | "casual" | "prompt" | "bullet_points" | "summary"`

**Timeouts:** Frontend 60s (VoiceAIClient). Sem timeout explicito no backend.

**Status codes:** 200 ok, 400 bad request, 500 erro, 503 servico indisponivel.

**Nota para PLAN.md (ATT):** O refiner atualmente e acoplado ao transcribe. No PLAN.md Fase 1, a ideia e criar `POST /transcribe/refine` separado para permitir re-refinamento sem re-transcricao. Mas o `POST /transcribe` com `refine=true` continua funcionando como esta -- mudanca e aditiva.

### Endpoint futuro: `POST /transcribe/refine` (PLAN.md Fase 1)

```typescript
// Request (novo)
{
  text: string,          // REQUIRED, texto para refinar
  style: OutputStyle,    // REQUIRED
  context?: string       // Contexto adicional (ex: "documento juridico")
}

// Response
{
  refined_text: string,
  style: OutputStyle,
  success: boolean,
  error: string | null
}
```

Isso desacopla refinamento da transcricao: usuario pode refinar qualquer texto, re-refinar com estilo diferente, ou refinar texto colado (nao gravado).

---

## 3. Sintese (TTS)

### `POST /synthesize`

**Contrato atual:**

```typescript
// Request
{
  text: string,                      // REQUIRED, 1-10000 chars
  voice: string,                     // default "pt-br-faber-medium", "cloned" para Chatterbox
  speed: number,                     // default 1.0, 0.5-2.0 (so Piper)
  format: "wav" | "mp3",            // default "wav" (MP3 NAO IMPLEMENTADO)
  preprocess: boolean,               // default true
  read_code: boolean,                // default false
  voice_ref: string | null,          // base64 audio ref para clonagem
  profile: string | null,            // default "standard"
  params: TTSParameters | null       // override custom
}

// TTSParameters
{
  exaggeration: number,       // 0.0-2.0, default 0.5    -- FUNCIONA
  speed: number,              // 0.5-2.0, default 1.0    -- IGNORADO pelo Chatterbox
  stability: number,          // 0.0-1.0, default 0.5    -- IGNORADO
  steps: number,              // 4-20,    default 10     -- IGNORADO
  sentence_silence: number,   // 0.0-1.0, default 0.2    -- IGNORADO
  cfg_weight: number,         // 0.0-1.0, default 0.5    -- FUNCIONA
  embedding_scale: number,    // 0.0-2.0, default 1.0    -- IGNORADO
  temperature: number,        // 0.0-1.0, default 0.1    -- IGNORADO
  repetition_penalty: number, // 1.0-2.0, default 1.1    -- IGNORADO
  top_p: number,              // 0.0-1.0, default 0.9    -- IGNORADO
  seed: number | null         // null,                    -- IGNORADO (torch.manual_seed feito mas nao afeta generate)
}
```

**Response:** Binary audio (WAV bytes)
```
Content-Type: audio/wav
Content-Disposition: attachment; filename="speech.{format}"
X-TTS-Engine: "piper" | "modal-chatterbox"
X-TTS-Profile: string (se Chatterbox)
```

**Status codes:** 200 ok (binary), 400 bad request, 500 erro, 503 indisponivel.

**Desalinhamentos identificados:**

| Problema | Detalhe |
|----------|---------|
| 9 params ignorados | `model.generate()` so recebe `exaggeration` + `cfg_weight` |
| MP3 nao implementado | Aceita `format: "mp3"` mas retorna WAV com header errado |
| `voice` como discriminador | `"cloned"` aciona Modal, qualquer outra string aciona Piper -- fragil |
| Sem chunking | `split_into_chunks()` existe mas nao e usado no router |
| Voice ref em base64 | MB de audio em JSON body -- ineficiente |
| Sem streaming | Audio inteiro gerado antes de retornar |

**Contrato alvo (pos-migracao):**

```typescript
// Request (limpo)
{
  text: string,                      // REQUIRED, 1-10000 chars
  engine: "chatterbox" | "piper",    // EXPLICITO em vez de voice=="cloned"
  voice: string | null,              // Para Piper: "pt-br-faber-medium". Para Chatterbox: null
  format: "wav",                     // So WAV (remover MP3 ate implementar)
  preprocess: boolean,               // default true
  read_code: boolean,                // default false
  voice_ref: string | null,          // base64 audio ref (Chatterbox)
  params: ChatterboxParams | null    // So params que FUNCIONAM
}

// ChatterboxParams (so parametros reais)
// DEPENDE da auditoria do ChatterboxTTS.generate() -- Fase 1.4 do PLAN-TTS
{
  exaggeration: number,       // 0.0-2.0, default 0.5
  cfg_weight: number,         // 0.0-1.0, default 0.5
  // + outros que generate() realmente aceite (a descobrir)
}

// PiperParams (se necessario)
{
  speed: number               // 0.5-2.0, default 1.0
}
```

**Mudancas-chave:**
1. `engine` explicito substitui `voice=="cloned"` como discriminador
2. `TTSParameters` reduzido aos parametros que realmente funcionam
3. `format: "mp3"` removido ate ser implementado
4. Profiles recalculados com parametros reais

### `POST /synthesize/info`

**Contrato atual = contrato alvo** (sem mudanca)

```typescript
// Request: mesmo schema do POST /synthesize
// Response
{
  text_length: number,
  preprocessed_length: number,
  estimated_duration: number,    // segundos
  chunks: number,
  voice: string
}
```

### `GET /synthesize/voices`

**Contrato atual:**

```typescript
{
  local: {
    voices: Record<string, VoiceInfo>,
    default: string | null,
    available: boolean
  },
  cloned: {
    available: boolean,
    description: string
  },
  // Retrocompatibilidade (duplicado)
  voices: Record<string, VoiceInfo>,
  default: string | null,
  available: boolean
}
```

**Contrato alvo:**

```typescript
{
  engines: {
    chatterbox: {
      available: boolean,
      device: "cuda" | "cpu" | null,
      voice_ref_required: boolean    // false se default ref configurado
    },
    piper: {
      available: boolean,
      voices: Record<string, VoiceInfo>,
      default: string | null
    }
  }
}
```

Mudanca: estrutura por engine, remove retrocompatibilidade, remove `cloned`.

### `GET /synthesize/profiles`

**Contrato atual:**

```typescript
{
  builtin: Record<string, TTSParameters>,   // standard, legal, expressive, fast_preview
  default: "standard",
  descriptions: Record<string, string>      // descricoes dos 11 params
}
```

**Contrato alvo:** Depende da auditoria (Fase 1.4). Profiles serao recalibrados com parametros reais.

### `GET /synthesize/modal/status`

**Sera removido** na migracao. Substituido pelo campo `chatterbox` em `GET /health`.

---

## 4. Frontend -> Backend: Como o App.tsx Chama Hoje

### Transcricao (App.tsx, nao usa VoiceAIClient)

```typescript
// App.tsx chama VoiceAIClient.transcribe() via useSidecar hook
// Mas tambem tem logica inline duplicada em varios lugares
```

O frontend usa `VoiceAIClient.transcribe()` corretamente para STT. O problema e que o App.tsx reimplementa logica de estado, polling, e error handling que deveria estar em hooks.

### Sintese (App.tsx:713-794, NAO usa useTTS.ts)

```typescript
// App.tsx monta request inline:
const requestBody: any = {
  text: textToSpeak,
  voice: ttsEngine === "chatterbox" ? "cloned" : "pt-br-faber-medium",
  preprocess: true,
};

if (ttsEngine === "chatterbox") {
  if (ttsProfile !== "custom") {
    requestBody.profile = ttsProfile;
  } else {
    requestBody.params = ttsCustomParams;
  }
  if (voiceRefAudio) {
    requestBody.voice_ref = voiceRefAudio;
  }
}

// Chamada SEM safeFetch, SEM timeout
const response = await fetch(`${sidecar.whisperServerUrl}/synthesize`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(requestBody),
});
```

**Problemas:**
- `fetch()` direto em vez de `safeFetch` -- quebra no AppImage
- Sem timeout -- Chatterbox cold start pode travar
- `any` como tipo do body -- sem validacao
- Nao usa `useTTS.ts` que resolve tudo isso

---

## 5. Mapa de Desalinhamentos (Frontend vs Backend)

| Local | Frontend | Backend | Status |
|-------|----------|---------|--------|
| Health models | `xtts` | `piper` + `modal` | Desalinhado (nao quebra) |
| TTS engine | `ttsEngine === "chatterbox" ? "cloned" : ...` | `voice=="cloned"` | Funciona mas fragil |
| TTS params | 11 sliders/campos | 2 passados ao modelo | 9 sao teatro |
| TTS profiles | 5 (inclui "custom") | 4 (sem "custom") | `get_profile("custom")` retorna default |
| TTS format | Aceita "mp3" | Retorna WAV sempre | Bug (header mente) |
| TTS timeout | Nenhum (App.tsx) / 180s (useTTS.ts nao usado) | Nenhum | Risco de hang |
| TTS fetch | `fetch()` direto | n/a | Bug no AppImage |
| Voice ref | localStorage (base64, pode ser MB) | Aceita base64 no JSON | Funcional mas fragil |

---

## 6. Resumo: O Que Muda Apos os PLANs

### Mudancas aditivas (nao quebram nada)

| Endpoint | Mudanca |
|----------|---------|
| `POST /transcribe/refine` | **Novo.** Refina texto independente da transcricao |
| `GET /health` | Adiciona `chatterbox` ao `models` |

### Mudancas de contrato (breaking)

| Endpoint | Mudanca | Mitigacao |
|----------|---------|-----------|
| `POST /synthesize` | `voice: "cloned"` vira `engine: "chatterbox"` | Aceitar ambos durante transicao |
| `POST /synthesize` | `TTSParameters` reduzido (9 campos removidos) | Ignorar campos desconhecidos (ja acontece) |
| `GET /synthesize/modal/status` | Removido | Substituido por `GET /health` |
| `GET /synthesize/voices` | Estrutura muda | Versionamento ou manter retrocompat |
| `GET /health` | `modal` sai, `chatterbox` entra | Frontend nao depende desse campo |

### Mudancas internas (mesmo contrato, implementacao diferente)

| O que | Antes | Depois |
|-------|-------|--------|
| Chatterbox runtime | Modal serverless (T4 GPU) | Local na VM (CPU ou GPU se disponivel) |
| Chatterbox invocacao | `modal.Cls.from_name().synthesize.remote()` | `ChatterboxLocalService.synthesize()` |
| Voice ref default | Piper sintetico | Amostra humana real pre-gravada |
| Chunking | Nao usado | `split_into_chunks()` ativo |
| Refiner | Acoplado ao transcribe | Disponivel standalone tambem |

---

## 7. Ordem de Execucao dos Contratos

```
1. Auditar ChatterboxTTS.generate() kwargs    --> define TTSParameters real
2. Criar POST /transcribe/refine (aditivo)    --> nao quebra nada
3. Migrar Chatterbox para local               --> mesmo contrato, impl diferente
4. Limpar POST /synthesize (engine explicito)  --> breaking, frontend junto
5. Atualizar GET /health (chatterbox local)    --> breaking minor
6. Remover GET /synthesize/modal/status        --> deprecate primeiro
7. Ativar useTTS.ts no frontend                --> corrige fetch/timeout
```
