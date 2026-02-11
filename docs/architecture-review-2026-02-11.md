# Analise Arquitetural ELCO-machina

Data: 2026-02-11
Escopo: Mapeamento dos 3 motores (Whisper, Gemini, Chatterbox), fluxo de dados, gaps e falhas.

---

## Mapa de Servicos (XML)

```xml
<analysis>

<whisper loc="sidecar/voice_ai/services/stt_service.py" router="sidecar/voice_ai/routers/transcribe.py" client="src/services/VoiceAIClient.ts">
  <engine>Faster-Whisper (CTranslate2)</engine>
  <model>medium (1.5GB, PT-BR otimizado)</model>
  <device>auto (CUDA float16 | CPU int8)</device>
  <loading>lazy -- primeiro request carrega</loading>
  <input>base64 audio via POST /transcribe</input>
  <decode>soundfile direto (wav/ogg/mp3) | ffmpeg fallback (webm/m4a/opus/aac)</decode>
  <resample>interpolacao linear para 16kHz mono (np.interp) -- DEGRADANTE</resample>
  <vad>ativo, min_silence=500ms, beam_size=5</vad>
  <output>TranscriptionResult {text, language, confidence, duration, segments[]}</output>
  <confidence>avg_logprob normalizado: min(1.0, max(0.0, 1.0 + avg/5))</confidence>
  <debug_leak>salva /tmp/last_audio_debug.wav a cada transcricao (hardcoded, incondicionalmente)</debug_leak>
</whisper>

<gemini loc="App.tsx:430-558" sidecar_alt="sidecar/voice_ai/services/refiner.py">
  <role>recebe texto cru do Whisper, aplica estilo, devolve texto polido</role>
  <sdk>@google/genai (frontend, ATIVO) | google.generativeai (sidecar, MORTO)</sdk>
  <model_frontend>settings.aiModel (configuravel: gemini-2.5-flash, gemini-2.5-pro, gemini-3-flash-preview, gemini-3-pro-preview)</model_frontend>
  <model_sidecar>gemini-1.5-flash (HARDCODED, MODELO DESCONTINUADO, NAO FUNCIONA)</model_sidecar>
  <invocation>direto no frontend -- App.tsx:544 ai.models.generateContent()</invocation>
  <chamada_gemini>
    contents: {
      parts: [
        { text: "Texto transcrito para refinar:\n\n{rawText}" },
        { text: systemPrompt }
      ]
    }
    PROBLEMA: nao usa systemInstruction. Ambos os parts sao tratados como mensagem
    do usuario. O modelo confunde texto transcrito com pergunta a responder.
  </chamada_gemini>
  <context_memory>ultimos 2000 chars do contexto ativo injetados no system prompt (salva 5000, usa 2000)</context_memory>
  <temperature>
    prompt_engineering=0.2 | verbatim=0.1 | outros=0.4
  </temperature>
  <output_structure>
    linha 1: filename sugerido
    linha 2: vazia
    linha 3+: conteudo
  </output_structure>
  <styles count="18">
    Whisper Only (bypass Gemini), Verbatim, Elegant Prose, Ana Suy, Poetic/Verses,
    Normal, Verbose, Concise, Formal, Prompt(Claude), Prompt(Gemini),
    Bullet Points, Summary, Tech Docs, Email, Tweet Thread, Code Generator, Custom
  </styles>
  <sidecar_refiner status="CODIGO_MORTO">
    loc="sidecar/voice_ai/services/refiner.py"
    model="gemini-1.5-flash" (DESCONTINUADO)
    styles=7 (vs 18 no frontend -- verbatim, elegant_prose, formal, casual, prompt, bullet_points, summary)
    uso=ZERO -- App.tsx SEMPRE envia refine:false (linha 611) e refina localmente (linha 617-626)
    O sidecar recebe o parametro refine mas ele nunca e true.
  </sidecar_refiner>
</gemini>

<chatterbox loc="sidecar/voice_ai/services/tts_modal_client.py" router="sidecar/voice_ai/routers/synthesize.py">
  <engine>Chatterbox via Modal (GPU serverless)</engine>
  <capability>clonagem de voz com audio de referencia</capability>
  <min_ref>5s audio, ideal 10s</min_ref>
  <fallback_ref>
    Piper gera referencia PT-BR automatica usando texto pre-definido
    (cobre fonemas variados do portugues) -- cacheado em memoria global
  </fallback_ref>
  <params>
    exaggeration(0-2), speed(0.5-2), stability(0-1), steps(1-25),
    sentence_silence(0-2), cfg_weight, embedding_scale, temperature,
    repetition_penalty, top_p, seed
  </params>
  <profiles>standard, aggressive, subtle, custom</profiles>
  <auth>MODAL_ENABLED + MODAL_TOKEN_ID + MODAL_TOKEN_SECRET</auth>
  <invocation>modal.Cls.from_name("elco-tts", "TTSEngine").synthesize.remote(...)</invocation>
  <piper_local>
    loc="sidecar/voice_ai/services/tts_service.py"
    engine=Piper TTS (ONNX)
    vozes=2 PT-BR (edresson-low, faber-medium)
    download=HuggingFace automatico
    uso=fallback quando Modal indisponivel + gerador de voice_ref default
  </piper_local>
</chatterbox>

<pipeline>
  <step n="1" label="captura">
    web: MediaRecorder -> webm blob
    tauri: CPAL (audio.rs) -> WAV via hound -> readFile -> blob
    upload: input[file] max 10MB
    persistencia: IndexedDB "current_audio"
  </step>
  <step n="2" label="decisao">
    transcriptionMode=="local" AND sidecarAvailable -> Whisper
    else -> BLOQUEADO (sem fallback cloud, Gemini STT foi removido)
  </step>
  <step n="3" label="stt">
    blob -> base64 -> POST sidecar:8765/transcribe (refine:false, style:"verbatim") -> Whisper medium -> texto cru
  </step>
  <step n="4" label="refinamento_frontend">
    style != "Whisper Only" AND apiKey presente:
      GoogleGenAI({ apiKey })
      ai.models.generateContent({
        model: settings.aiModel,
        config: { temperature: 0.1-0.4 },
        contents: { parts: [{text: rawText}, {text: systemPrompt}] }  <-- BUG: nao usa systemInstruction
      })
    style == "Whisper Only" OR sem apiKey:
      texto cru direto (sem Gemini)
  </step>
  <step n="5" label="output">
    setTranscription -> localStorage("gemini_current_work")
    updateContextMemory -> IndexedDB (trunca 5000 chars)
    addToHistory -> Tauri Store / IndexedDB
  </step>
  <step n="6" label="tts_opcional">
    usuario clica "Read" -> fetch() direto (NAO safeFetch) -> POST sidecar:8765/synthesize
    chatterbox (voice=="cloned"): GPU Modal com clonagem
    piper (voice=="pt-br-*"): local sem clonagem
    -> WAV blob -> Audio().play()
  </step>
</pipeline>

<state_management>
  <context>GlobalAppContext agrega 6 hooks: auth, settings, persistence, panel, updater, sidecar</context>
  <storage>
    IndexedDB: GeminiArchitectDB v2 (audio, contexts), ProATTHistoryDB v1 (historico)
    localStorage: outputLanguage, outputStyle, customPrompt, aiModel, transcriptionMode, whisperServerUrl, currentWork, ttsSettings
    Tauri Store: apiKey (encriptado), history
  </storage>
  <hooks_ativos>useAuth, useSettings, usePersistence, useActivePanel, useUpdater, useSidecar</hooks_ativos>
  <hooks_mortos>useAudioRecording, useAudioProcessing, useTTS -- existem em src/hooks/ mas NAO sao importados por App.tsx</hooks_mortos>
</state_management>

<infra>
  <sidecar host="VM Oracle Cloud 137.131.201.119 | Tailscale 100.114.203.28" port="8765">
    FastAPI + uvicorn, CORS wildcard (allow_origins=["*"]), middleware injeta servicos
  </sidecar>
  <frontend>React 19 + Vite 6 + Tauri 2.9 + TailwindCSS (CDN), porta dev 3000</frontend>
  <seguranca>
    CSP: null (DESABILITADO -- zero protecao XSS)
    CORS: wildcard (qualquer origem acessa sidecar)
    Auth: hardcoded (MCBS/PGR -> Chicago00@, texto plano no bundle JS)
  </seguranca>
</infra>

</analysis>
```

---

## Falhas e Gaps (por severidade)

### CRITICO: Gemini confunde texto com pergunta (App.tsx:544-555)

O problema mais grave e o que causa inconsistencia de resultados.

A chamada ao Gemini esta assim:

```typescript
// App.tsx:544-555
const response = await ai.models.generateContent({
    model: settings.aiModel,
    config: { temperature: ... },
    contents: {
        parts: [
            { text: `Texto transcrito para refinar:\n\n${rawText}` },
            { text: systemPrompt },
        ],
    },
});
```

**O que acontece:** ambos os `parts` sao enviados como uma unica mensagem do usuario. O SDK `@google/genai` suporta o campo `systemInstruction` para instrucoes de sistema, mas ele nao esta sendo usado. O modelo recebe tudo como se fosse uma unica mensagem e **nao consegue distinguir de forma confiavel** entre "este e o texto a processar" e "estas sao suas instrucoes".

**Consequencia direta:** quando o texto transcrito tem formato de pergunta ("como faco X?", "o que voce acha de Y?"), o Gemini interpreta como pergunta direcionada a ele e **tenta responder** em vez de refinar/formatar o texto.

**Correcao necessaria:**
```typescript
const response = await ai.models.generateContent({
    model: settings.aiModel,
    config: {
        temperature: ...,
        systemInstruction: systemPrompt,  // instrucoes vao aqui
    },
    contents: rawText,  // texto a processar vai aqui
});
```

### CRITICO: Duplicacao tripla de logica core

O `buildStylePrompt` (prompt engineering, o core do produto) existe em **3 lugares**:

| Local | Linhas | Estilos | Status |
|-------|--------|---------|--------|
| `App.tsx:430-532` | ~100 | 18 | **ATIVO** (unico usado) |
| `src/hooks/useAudioProcessing.ts:206-388` | ~180 | 18 | **MORTO** (nao importado) |
| `sidecar/voice_ai/services/refiner.py:26-123` | ~100 | 7 | **MORTO** (nunca chamado) |

A funcao `blobToBase64` existe em 3 lugares:

| Local | Status |
|-------|--------|
| `App.tsx:46-60` | **MORTO** (App.tsx usa `VoiceAIClient.blobToBase64` na linha 601) |
| `src/hooks/useAudioProcessing.ts:105-119` | **MORTO** (hook nao importado) |
| `src/services/VoiceAIClient.ts:242-254` | **ATIVO** |

### CRITICO: Refiner do sidecar e codigo morto com modelo descontinuado

`sidecar/voice_ai/services/refiner.py` usa `gemini-1.5-flash` (modelo que nao existe mais). Mesmo que fosse chamado, falharia. Mas nao e chamado -- App.tsx envia `refine: false` na linha 611, entao o endpoint `/transcribe` nunca invoca `get_refiner()`.

Os 7 estilos do sidecar (`verbatim`, `elegant_prose`, `formal`, `casual`, `prompt`, `bullet_points`, `summary`) tambem divergem dos 18 do frontend (nomes diferentes, formato diferente).

### CRITICO: Hooks completos nao utilizados (refatoracao incompleta)

3 hooks existem em `src/hooks/` com implementacoes completas e bem estruturadas:

- `useAudioRecording.ts` (436 linhas) -- captura, upload, analise de metricas
- `useAudioProcessing.ts` (618 linhas) -- processAudio identico ao App.tsx, com buildStylePrompt duplicado
- `useTTS.ts` (331 linhas) -- TTS com safeFetch, timeout diferenciado, error handling mais robusto

**Nenhum deles e importado pelo App.tsx.** O App.tsx reimplementa tudo inline.

Consequencias:
- Toda correcao precisa ser feita no App.tsx, nao nos hooks
- Os hooks vao ficando desatualizados em relacao ao App.tsx sem que ninguem perceba
- Nao e possivel testar a logica isoladamente

### GRAVE: Feedback visual falso no PanelStats (useSidecar.ts:73, PanelStats.tsx:182-188)

Quando o sidecar esta offline, o sistema exibe:

| Componente | Exibe | Realidade |
|------------|-------|-----------|
| `useSidecar.ts:73` | `"Sidecar offline - usando Gemini"` | **NAO existe fallback Gemini para STT** (foi removido) |
| `PanelStats.tsx:186` | Engine: `"Gemini (fallback)"` | **Mentira.** O app para e mostra erro. |
| `PanelStats.tsx:131-133` | STT status: `warning` (amarelo) | Deveria ser `error` (vermelho) -- nao ha fallback |

O usuario ve "usando Gemini" e acredita que o sistema esta funcionando com degradacao graceful, quando na verdade **nao esta funcionando**.

### GRAVE: Debug hardcoded em producao (stt_service.py:245-246)

```python
# stt_service.py:245-246
import soundfile as _sf
_sf.write("/tmp/last_audio_debug.wav", audio_data, 16000)
```

Todo audio processado e gravado em `/tmp` incondicionalmente. Em producao:
- Leak de dados de audio do usuario
- IO desnecessario a cada request
- Arquivo sobrescrito a cada transcricao (sem rotacao)

### GRAVE: TTS usa fetch() nativo em vez de safeFetch (App.tsx:749)

```typescript
// App.tsx:749
const response = await fetch(`${sidecar.whisperServerUrl}/synthesize`, {
```

O `useTTS.ts` (hook nao utilizado) implementa a chamada com `safeFetch` e tratamento de timeout diferenciado (180s para Chatterbox, 30s para Piper). O App.tsx usa `fetch()` cru sem timeout, sem fallback para scope Tauri.

### GRAVE: Resampling por interpolacao linear (stt_service.py:196)

```python
indices = np.linspace(0, len(audio_data) - 1, target_samples)
audio_data = np.interp(indices, np.arange(len(audio_data)), audio_data)
```

`np.interp` faz interpolacao linear entre amostras. Isso introduz aliasing e degrada qualidade de audio, especialmente para voz. `scipy.signal.resample` ou `librosa.resample` (polyphase filtering) sao significativamente superiores para STT.

### GRAVE: CSP desabilitado + CORS wildcard

- `tauri.conf.json`: `"csp": null` -- zero protecao contra XSS
- `main.py:92`: `allow_origins=["*"]` -- qualquer site pode acessar o sidecar

Combinados: se o usuario abrir qualquer pagina web maliciosa no mesmo computador, essa pagina pode fazer requests ao sidecar, transcrever audio, e sintetizar voz.

### MODERADO: Tipos desalinhados entre camadas

| Tipo | Frontend (VoiceAIClient.ts) | Sidecar (real) | App.tsx |
|------|-----------------------------|----------------|---------|
| OutputStyle | 7 valores snake_case | 7 valores snake_case | 18 valores Title Case |
| HealthResponse.models | `xtts` (descontinuado) | `piper` + `modal` | n/a |
| AudioFormat | inclui `m4a` | inclui `m4a`, `mp4`, `opus`, `aac` | n/a |

### MODERADO: `useVoiceAI()` nao e um hook React (VoiceAIClient.ts:347)

```typescript
export function useVoiceAI() {
    const client = getVoiceAIClient();
    return {
        client,
        transcribe: client.transcribe.bind(client),
        health: client.health.bind(client),
        ...
    };
}
```

Zero hooks do React (nenhum useState, useEffect, useRef, useCallback). E uma funcao que retorna metodos. Nao reage a mudancas, nao causa re-render. O prefixo `use` viola as regras de hooks do React e engana o linter.

### MODERADO: Context memory salva 5000, usa 2000

```typescript
// App.tsx:566 -- salva
const updatedMemory = (currentMemory + "\n" + cleanedText).slice(-5000);
// App.tsx:474 -- usa
"${currentMemory.slice(-2000)}"
```

3000 caracteres sao persistidos no IndexedDB mas nunca vistos pelo Gemini. O tamanho util e 2000.

### MENOR: Autenticacao hardcoded

```typescript
// useAuth.ts
AUTH_USERS = { "MCBS": "Chicago00@", "PGR": "Chicago00@" };
```

Em texto plano no bundle JS. Sem impacto pratico (uso pessoal), mas qualquer pessoa com DevTools ve as credenciais.

---

## Mapa de Feedback Visual: Real vs Construido

| Indicador | Local | Real? | Detalhes |
|-----------|-------|-------|----------|
| `isRecording` | App.tsx:122 | SIM | Set por MediaRecorder.start/stop ou Tauri invoke |
| `isProcessing` | App.tsx:143 | SIM | Set no inicio/fim de processAudio |
| `isSpeaking` | App.tsx:673 | SIM | Set quando Audio().play() inicia, limpo no onended/onerror |
| `sidecarAvailable` | useSidecar.ts:39 | SIM | Baseado em GET /health real com resposta parseada |
| `sidecarStatus` texto | useSidecar.ts:73 | **NAO** | Exibe "usando Gemini" quando offline -- fallback nao existe |
| STT Engine no PanelStats | PanelStats.tsx:182-188 | **NAO** | Mostra "Gemini (fallback)" -- fallback nao existe |
| STT status cor no PanelStats | PanelStats.tsx:129-133 | **NAO** | Warning (amarelo) quando deveria ser error (vermelho) |
| Logs "Transcrevendo com Whisper" | App.tsx:599 | SIM | So aparece quando de fato chama sidecar |
| Logs "Refinando com Gemini" | App.tsx:618 | SIM | So aparece quando de fato chama Gemini |
| Audio size "Ready: X KB" | PanelATT.tsx:341 | SIM | Lido diretamente do Blob.size |
| LIVE indicator na gravacao | PanelATT.tsx:206-210 | SIM | Condicional direto em isRecording |
| "Processing..." no botao | PanelATT.tsx:323 | SIM | Condicional em isProcessing |
| Barra de download update | App.tsx:889-909 | SIM | Condicional em updater.updateStatus/Progress (real) |

**Resumo:** os indicadores de estado primario (gravando, processando, falando) sao reais. O problema esta nos indicadores de **disponibilidade de servico** -- o fallback Gemini para STT e exibido como existente quando nao existe.

---

## Pergunta Respondida: Em que etapa o prompt e enviado ao Gemini?

O Gemini **recebe** texto. O fluxo real e:

1. Whisper transcreve audio -> `result.text` (texto cru)
2. Se `outputStyle != "Whisper Only"` E `apiKey` existe:
   - `buildStylePrompt(rawText)` constroi o system prompt (linhas 430-532)
   - `refineWithGemini(rawText, apiKey)` e chamado (linha 620)
   - Dentro de `refineWithGemini` (linhas 535-558):
     - Cria instancia `GoogleGenAI`
     - Chama `ai.models.generateContent()` com **dois parts numa unica mensagem**
     - Part 1: texto transcrito
     - Part 2: system prompt
   - Retorna `response.text`
3. `finalText` recebe o output do Gemini

**O Gemini recebe o texto E o prompt, mas como uma unica mensagem (contents.parts[]), nao como systemInstruction separado.** Isso e a causa raiz da inconsistencia que voce observou.

---

## Nota sobre os hooks vestigiais

`useAudioProcessing.ts` contem uma copia quase identica da logica de `processAudio` do App.tsx, incluindo `buildStylePrompt` duplicado. A unica diferenca relevante: o hook e mais completo em alguns aspectos (muda para tab "stats" durante processamento, detecta mobile para mudar view). Mas ele **nao e usado**.

`useTTS.ts` e superior ao codigo inline do App.tsx:
- Usa `safeFetch` (App.tsx usa `fetch` cru)
- Tem timeout diferenciado: 180s para Chatterbox (cold start GPU), 30s para Piper
- Trata erros de rede e GStreamer no Linux separadamente
- Usa `useCallback` para evitar re-renders

Ambos foram escritos como parte de uma refatoracao que foi abandonada no meio. O App.tsx continua monolitico.
