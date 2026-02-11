# Plano de Reestruturacao ELCO-machina

## Principio: Frontend e UI. Sidecar e processamento. Sem mistura.

---

## Fase 1: Sidecar -- Gemini REST Client

### 1.1 Reescrever `sidecar/voice_ai/services/refiner.py`

**Remover:** SDK `google-generativeai`, modelo hardcoded `gemini-1.5-flash`, singleton global.

**Criar:** Cliente REST puro que faz POST para `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.

Aceita:
- `text`: texto cru do Whisper
- `system_instruction`: string (prompt do usuario)
- `model`: model ID (gemini-2.5-pro, gemini-2.5-flash, gemini-3-pro-preview, gemini-3-flash-preview)
- `temperature`: float
- `api_key`: string (env var GEMINI_API_KEY do sidecar)

Retorna:
- `refined_text`: string
- `model_used`: string
- `success`: bool
- `error`: string | None

Payload REST:
```json
{
  "systemInstruction": { "parts": [{ "text": "{system_instruction}" }] },
  "contents": [{ "role": "user", "parts": [{ "text": "{text}" }] }],
  "generationConfig": {
    "temperature": 0.4,
    "maxOutputTokens": 8192,
    "responseMimeType": "text/plain"
  }
}
```

### 1.2 Atualizar `sidecar/voice_ai/routers/transcribe.py`

**Request body expandido:**
```python
class TranscribeRequest(BaseModel):
    audio: str                          # base64
    format: str = "webm"
    language: str | None = "pt"
    refine: bool = False
    system_instruction: str | None = None   # NOVO: prompt do usuario
    model: str = "gemini-2.5-pro"           # NOVO: model ID
    temperature: float = 0.4                # NOVO
```

**Fluxo:**
1. Whisper transcreve (como hoje)
2. Se `refine=True` e `system_instruction` presente:
   - Chama novo refiner com REST
   - Retorna `text` (bruto) + `refined_text` (polido)
3. Se `refine=False`: retorna so `text`

### 1.3 Remover `google-generativeai` do `requirements.txt`

Sem SDK. Apenas `httpx` (ou `requests`) para REST calls.

---

## Fase 2: Frontend -- Prompt Store

### 2.1 Criar `src/services/PromptStore.ts`

Armazena estilos/prompts editaveis em Tauri Store (ou IndexedDB como fallback).

```typescript
interface PromptTemplate {
  id: string;                    // UUID
  name: string;                  // "Elegant Prose", "Meu Estilo Custom", etc.
  systemInstruction: string;     // O texto completo do prompt
  temperature: number;           // 0.0 - 1.0
  isBuiltin: boolean;            // true = vem com o app, false = criado pelo usuario
  createdAt: number;
  updatedAt: number;
}
```

Operacoes:
- `getAll()` -> lista todos (builtins + custom)
- `getById(id)` -> um template
- `save(template)` -> cria ou atualiza
- `delete(id)` -> so deleta custom (builtins sao protegidos)
- `resetBuiltins()` -> restaura builtins ao estado original
- `export()` / `import()` -> JSON

**Builtins iniciais:** migrar os 18 estilos atuais como templates default com `isBuiltin: true`.

### 2.2 Criar UI de edicao de prompts

No PanelATT (ou modal dedicado):
- Lista de estilos com preview do systemInstruction
- Botao "Ver Prompt" que abre editor
- Textarea editavel para systemInstruction
- Slider para temperature
- Botao "Duplicar" (cria copia editavel de um builtin)
- Botao "Novo Estilo"
- Botao "Resetar" (restaura builtins)

---

## Fase 3: Frontend -- Decomposicao do App.tsx

### 3.1 Remover do App.tsx

- `buildStylePrompt` (toda a funcao, ~100 linhas)
- `refineWithGemini` (toda a funcao, ~25 linhas)
- `new GoogleGenAI()` e import do `@google/genai`
- Toda logica de recording inline (usa hook)
- Toda logica de TTS inline (usa hook)
- Toda logica de processamento inline (usa hook)

### 3.2 Ativar hooks existentes

Os hooks ja existem e estao completos. Precisam ser:

1. **`useAudioRecording`** -- conectar ao App.tsx (substituir estado inline)
2. **`useAudioProcessing`** -- reescrever para usar sidecar com refinamento (nao Gemini direto)
3. **`useTTS`** -- conectar ao App.tsx (substituir logica inline)

### 3.3 Reescrever `useAudioProcessing`

**Antes:** chama Whisper no sidecar + Gemini no frontend (SDK).
**Depois:** chama sidecar unico que faz Whisper + Gemini REST.

```typescript
const processAudio = async () => {
  const selectedPrompt = promptStore.getById(selectedStyleId);

  const result = await voiceAIClient.transcribe({
    audio: base64Audio,
    format,
    language,
    refine: selectedPrompt.name !== "Whisper Only",
    system_instruction: selectedPrompt.systemInstruction,
    model: settings.aiModel,
    temperature: selectedPrompt.temperature,
  });

  // result.text = bruto
  // result.refined_text = polido (se refine=true)
  setTranscription(result.refined_text || result.text);
};
```

### 3.4 App.tsx final (~50 linhas de logica, resto e JSX)

```typescript
export default function App() {
  const { auth, settings, persistence, panel, updater, sidecar } = useAppContext();
  const recording = useAudioRecording({ ... });
  const processing = useAudioProcessing({ ... });
  const tts = useTTS(sidecar.whisperServerUrl, persistence.addLog);
  const promptStore = usePromptStore();

  if (!auth.isAuthenticated) return <LoginScreen />;

  return (
    <AppLayout
      editor={<Editor ... />}
      panelATT={<PanelATT ... />}
      panelTTS={<PanelTTS ... />}
      panelConfig={<PanelConfig ... />}
      panelStats={<PanelStats ... />}
    />
  );
}
```

---

## Fase 4: Limpeza

### 4.1 Remover dependencia `@google/genai`
```bash
bun remove @google/genai
```

### 4.2 Corrigir feedback visual falso

- `useSidecar.ts:73`: remover "usando Gemini" (nao existe fallback STT cloud)
- `PanelStats.tsx:182-188`: remover "Gemini (fallback)" como engine STT
- Status STT offline: `error` (vermelho), nao `warning` (amarelo)

### 4.3 Remover debug hardcoded
- `stt_service.py:245-246`: remover `_sf.write("/tmp/last_audio_debug.wav")`

### 4.4 Alinhar tipos
- `VoiceAIClient.ts`: atualizar `TranscribeRequest` com novos campos (system_instruction, model, temperature)
- `VoiceAIClient.ts`: remover `OutputStyle` (estilos agora sao dados, nao tipos)
- `VoiceAIClient.ts`: corrigir `HealthResponse` (piper/modal em vez de xtts)

### 4.5 Remover codigo morto
- `src/hooks/useAudioProcessing.ts` inline `buildStylePrompt` (substituido por PromptStore)
- `blobToBase64` duplicado no App.tsx
- `bufferToWav` (nao usado no fluxo principal)

### 4.6 Seguranca
- CSP: definir allowlist (sidecar + generativelanguage.googleapis.com)
- CORS sidecar: restringir origins para `tauri://localhost` e `http://localhost:3000`

---

## Ordem de execucao

1. Fase 1 (sidecar) -- pode ser testada independente com curl
2. Fase 2 (prompt store) -- pode ser testada independente
3. Fase 3 (decomposicao) -- conecta tudo
4. Fase 4 (limpeza) -- polish

## Fora de escopo nesta reestruturacao

- Resampling (np.interp -> librosa) -- melhoria separada
- DuckDB + embeddings para context memory -- feature separada
- Autenticacao real -- feature separada
