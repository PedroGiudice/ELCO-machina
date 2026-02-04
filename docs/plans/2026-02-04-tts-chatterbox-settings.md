# TTS Chatterbox Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar sistema de configuracao TTS com profiles prontos e custom, incluindo gravador de voz para clonagem.

**Architecture:** Backend (Modal + Sidecar) recebe parametros expandidos; Frontend (Settings) oferece UI com profiles e sliders.

**Tech Stack:** Modal (GPU), FastAPI (Sidecar), React + TypeScript (Frontend), Tauri Store (persistencia)

---

## Fase 1: Backend - Schema de Profiles

### Task 1.1: Criar arquivo de schemas TTS

**Files:** Create `sidecar/voice_ai/schemas/tts_profiles.py`

**Step 1:** Criar diretorio schemas se nao existir
```bash
mkdir -p sidecar/voice_ai/schemas
touch sidecar/voice_ai/schemas/__init__.py
```

**Step 2:** Criar arquivo tts_profiles.py com classe TTSParameters
```python
"""Schemas para TTS Chatterbox."""
from typing import Optional
from pydantic import BaseModel, Field


class TTSParameters(BaseModel):
    """Parametros do Chatterbox TTS."""

    # Tier 1 - Essenciais (com UI)
    exaggeration: float = Field(default=0.5, ge=0.0, le=2.0)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    stability: float = Field(default=0.5, ge=0.0, le=1.0)
    steps: int = Field(default=10, ge=4, le=20)
    sentence_silence: float = Field(default=0.2, ge=0.0, le=1.0)

    # Tier 2 - Avancados (ocultos)
    cfg_weight: float = Field(default=0.5, ge=0.0, le=1.0)
    embedding_scale: float = Field(default=1.0, ge=0.0, le=2.0)
    temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    repetition_penalty: float = Field(default=1.1, ge=1.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    seed: Optional[int] = Field(default=None)
```

**Step 3:** Commit
```bash
git add sidecar/voice_ai/schemas/
git commit -m "feat(sidecar): Cria schema TTSParameters"
```

---

### Task 1.2: Adicionar profiles pre-definidos

**Files:** Modify `sidecar/voice_ai/schemas/tts_profiles.py`

**Step 1:** Adicionar dicionario BUILTIN_PROFILES ao final do arquivo
```python
BUILTIN_PROFILES: dict[str, TTSParameters] = {
    "standard": TTSParameters(),
    "legal": TTSParameters(
        exaggeration=0.35,
        cfg_weight=0.85,
        stability=0.8,
        steps=12,
        repetition_penalty=1.2,
        sentence_silence=0.4,
    ),
    "expressive": TTSParameters(
        exaggeration=0.9,
        cfg_weight=0.3,
        stability=0.3,
        steps=15,
        temperature=0.5,
    ),
    "fast_preview": TTSParameters(
        speed=1.2,
        steps=4,
    ),
}


def get_profile(name: str) -> TTSParameters:
    """Retorna profile por nome ou default."""
    return BUILTIN_PROFILES.get(name, BUILTIN_PROFILES["standard"])
```

**Step 2:** Commit
```bash
git add sidecar/voice_ai/schemas/tts_profiles.py
git commit -m "feat(sidecar): Adiciona 4 profiles TTS pre-definidos"
```

---

### Task 1.3: Adicionar descricoes dos parametros

**Files:** Modify `sidecar/voice_ai/schemas/tts_profiles.py`

**Step 1:** Adicionar dicionario PARAM_DESCRIPTIONS
```python
PARAM_DESCRIPTIONS: dict[str, str] = {
    "exaggeration": "Expressividade (0=monotono, 2=dramatico)",
    "speed": "Velocidade de fala (0.5=lento, 2=rapido)",
    "stability": "Consistencia (0=variavel, 1=uniforme)",
    "steps": "Qualidade (4=rapido, 20=alta qualidade)",
    "sentence_silence": "Pausa entre frases (segundos)",
    "cfg_weight": "Fidelidade ao texto (0=criativo, 1=literal)",
    "embedding_scale": "Intensidade da voz clonada",
    "temperature": "Variabilidade (0=deterministico, 1=aleatorio)",
    "repetition_penalty": "Penalidade para repeticoes",
    "top_p": "Nucleus sampling",
    "seed": "Seed para reproducao",
}
```

**Step 2:** Commit
```bash
git add sidecar/voice_ai/schemas/tts_profiles.py
git commit -m "feat(sidecar): Adiciona descricoes dos parametros TTS"
```

---

## Fase 2: Backend - Atualizar Cliente Modal

### Task 2.1: Expandir assinatura do metodo synthesize

**Files:** Modify `sidecar/voice_ai/services/tts_modal_client.py`

**Step 1:** Atualizar imports
```python
from voice_ai.schemas.tts_profiles import TTSParameters
```

**Step 2:** Atualizar assinatura do metodo synthesize para aceitar TTSParameters
```python
def synthesize(
    self,
    text: str,
    voice_ref_bytes: Optional[bytes] = None,
    params: Optional[TTSParameters] = None,
) -> bytes:
```

**Step 3:** Usar params ou default dentro do metodo
```python
if params is None:
    params = TTSParameters()

audio_bytes = engine().synthesize.remote(
    text=text,
    voice_ref_bytes=voice_ref_bytes,
    exaggeration=params.exaggeration,
    speed=params.speed,
    stability=params.stability,
    steps=params.steps,
    # ... demais params
)
```

**Step 4:** Commit
```bash
git add sidecar/voice_ai/services/tts_modal_client.py
git commit -m "feat(sidecar): Cliente Modal aceita TTSParameters"
```

---

### Task 2.2: Atualizar SynthesizeRequest no router

**Files:** Modify `sidecar/voice_ai/routers/synthesize.py`

**Step 1:** Adicionar imports
```python
from voice_ai.schemas.tts_profiles import TTSParameters, get_profile, BUILTIN_PROFILES
```

**Step 2:** Adicionar campos profile e params ao SynthesizeRequest
```python
class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    voice: str = Field(default="cloned")
    preprocess: bool = Field(default=True)
    read_code: bool = Field(default=False)
    voice_ref: Optional[str] = Field(default=None)

    # Novos campos
    profile: Optional[str] = Field(default="standard")
    params: Optional[TTSParameters] = Field(default=None)
```

**Step 3:** Commit
```bash
git add sidecar/voice_ai/routers/synthesize.py
git commit -m "feat(sidecar): SynthesizeRequest aceita profile e params"
```

---

### Task 2.3: Atualizar funcao _synthesize_with_modal

**Files:** Modify `sidecar/voice_ai/routers/synthesize.py`

**Step 1:** Resolver parametros (custom > profile > default)
```python
# No inicio de _synthesize_with_modal:
if body.params:
    params = body.params
else:
    params = get_profile(body.profile or "standard")
```

**Step 2:** Passar params para modal_client.synthesize
```python
audio_bytes = modal_client.synthesize(
    text=text,
    voice_ref_bytes=voice_ref_bytes,
    params=params,
)
```

**Step 3:** Commit
```bash
git add sidecar/voice_ai/routers/synthesize.py
git commit -m "feat(sidecar): _synthesize_with_modal usa profiles"
```

---

### Task 2.4: Adicionar endpoint /profiles

**Files:** Modify `sidecar/voice_ai/routers/synthesize.py`

**Step 1:** Adicionar import PARAM_DESCRIPTIONS
```python
from voice_ai.schemas.tts_profiles import (
    TTSParameters, get_profile, BUILTIN_PROFILES, PARAM_DESCRIPTIONS
)
```

**Step 2:** Criar endpoint
```python
@router.get("/profiles")
async def list_profiles() -> dict:
    """Lista profiles disponiveis."""
    return {
        "builtin": {
            name: profile.model_dump()
            for name, profile in BUILTIN_PROFILES.items()
        },
        "default": "standard",
        "descriptions": PARAM_DESCRIPTIONS,
    }
```

**Step 3:** Commit
```bash
git add sidecar/voice_ai/routers/synthesize.py
git commit -m "feat(sidecar): Endpoint GET /synthesize/profiles"
```

---

### Task 2.5: Testar endpoint profiles

**Step 1:** Reiniciar sidecar
```bash
pkill -f "uvicorn.*voice_ai" || true
cd /home/opc/ELCO-machina/sidecar
source .venv/bin/activate
MODAL_ENABLED=true MODAL_TOKEN_ID=xxx MODAL_TOKEN_SECRET=xxx \
  python -m uvicorn voice_ai.main:app --host 0.0.0.0 --port 8765 &
```

**Step 2:** Testar endpoint
```bash
curl -s http://localhost:8765/synthesize/profiles | python3 -m json.tool
```

**Expected:** JSON com builtin profiles e descriptions

---

## Fase 3: Backend - Atualizar Modal Function

### Task 3.1: Expandir parametros no Modal

**Files:** Modify `modal_functions/tts_chatterbox.py`

**Step 1:** Atualizar assinatura do metodo synthesize
```python
@modal.method()
def synthesize(
    self,
    text: str,
    voice_ref_bytes: bytes | None = None,
    exaggeration: float = 0.5,
    speed: float = 1.0,
    stability: float = 0.5,
    steps: int = 10,
    sentence_silence: float = 0.2,
    cfg_weight: float = 0.5,
    embedding_scale: float = 1.0,
    temperature: float = 0.1,
    repetition_penalty: float = 1.1,
    top_p: float = 0.9,
    seed: int | None = None,
) -> bytes:
```

**Step 2:** Commit
```bash
git add modal_functions/tts_chatterbox.py
git commit -m "feat(modal): Expande parametros do Chatterbox"
```

---

### Task 3.2: Deploy Modal atualizado

**Step 1:** Deploy
```bash
cd /home/opc/ELCO-machina
modal deploy modal_functions/tts_chatterbox.py
```

**Expected:** Deploy sem erros

**Step 2:** Commit (se houve mudancas)
```bash
git add modal_functions/
git commit -m "chore(modal): Deploy com parametros expandidos" || true
```

---

## Fase 4: Frontend - Estados TTS

### Task 4.1: Adicionar estados TTS no App.tsx

**Files:** Modify `App.tsx`

**Step 1:** Localizar onde estao os outros useState (proximo de isSpeaking)

**Step 2:** Adicionar novos estados
```typescript
// TTS Settings
const [ttsEngine, setTtsEngine] = useState<'piper' | 'chatterbox'>('chatterbox');
const [ttsProfile, setTtsProfile] = useState<string>('standard');
const [voiceRefAudio, setVoiceRefAudio] = useState<string | null>(null);
```

**Step 3:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Adiciona estados TTS engine/profile"
```

---

### Task 4.2: Adicionar estado para parametros custom

**Files:** Modify `App.tsx`

**Step 1:** Adicionar estado para parametros custom
```typescript
const [ttsCustomParams, setTtsCustomParams] = useState({
  exaggeration: 0.5,
  speed: 1.0,
  stability: 0.5,
  steps: 10,
  sentence_silence: 0.2,
});
```

**Step 2:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Adiciona estado ttsCustomParams"
```

---

### Task 4.3: Atualizar handleReadText para usar configuracoes

**Files:** Modify `App.tsx`

**Step 1:** Localizar funcao handleReadText

**Step 2:** Atualizar body da requisicao
```typescript
const requestBody: Record<string, unknown> = {
  text: transcription,
  voice: ttsEngine === 'chatterbox' ? 'cloned' : 'pt-br-faber-medium',
  preprocess: true,
};

if (ttsEngine === 'chatterbox') {
  if (ttsProfile === 'custom') {
    requestBody.params = ttsCustomParams;
  } else {
    requestBody.profile = ttsProfile;
  }
  if (voiceRefAudio) {
    requestBody.voice_ref = voiceRefAudio;
  }
}
```

**Step 3:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): handleReadText usa configuracoes TTS"
```

---

## Fase 5: Frontend - UI Settings

### Task 5.1: Localizar secao Settings no App.tsx

**Step 1:** Buscar onde fica a UI de Settings
```bash
grep -n "Settings" App.tsx | head -20
```

**Step 2:** Identificar o local para adicionar nova secao TTS

---

### Task 5.2: Adicionar seletor de engine (Piper vs Chatterbox)

**Files:** Modify `App.tsx`

**Step 1:** Adicionar dentro da secao Settings
```tsx
{/* TTS Engine */}
<div className="space-y-2">
  <label className="text-xs text-zinc-500">TTS Engine</label>
  <div className="flex gap-2">
    <button
      onClick={() => setTtsEngine('chatterbox')}
      className={`px-3 py-1.5 rounded text-xs ${
        ttsEngine === 'chatterbox' ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400'
      }`}
    >
      Chatterbox (Natural)
    </button>
    <button
      onClick={() => setTtsEngine('piper')}
      className={`px-3 py-1.5 rounded text-xs ${
        ttsEngine === 'piper' ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400'
      }`}
    >
      Piper (Local)
    </button>
  </div>
</div>
```

**Step 2:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Seletor de engine TTS no Settings"
```

---

### Task 5.3: Adicionar seletor de profile

**Files:** Modify `App.tsx`

**Step 1:** Adicionar condicional para Chatterbox
```tsx
{ttsEngine === 'chatterbox' && (
  <div className="space-y-2">
    <label className="text-xs text-zinc-500">Profile</label>
    <select
      value={ttsProfile}
      onChange={(e) => setTtsProfile(e.target.value)}
      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
    >
      <option value="standard">Standard</option>
      <option value="legal">Legal (Formal)</option>
      <option value="expressive">Expressive</option>
      <option value="fast_preview">Fast Preview</option>
      <option value="custom">Custom</option>
    </select>
  </div>
)}
```

**Step 2:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Seletor de profile TTS"
```

---

### Task 5.4: Adicionar slider de Expressividade

**Files:** Modify `App.tsx`

**Step 1:** Dentro do bloco condicional ttsProfile === 'custom'
```tsx
{ttsProfile === 'custom' && (
  <div className="space-y-3 p-3 bg-zinc-900 rounded">
    {/* Exaggeration */}
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-400">Expressividade</span>
        <span className="text-zinc-500">{ttsCustomParams.exaggeration.toFixed(1)}</span>
      </div>
      <input
        type="range" min="0" max="2" step="0.1"
        value={ttsCustomParams.exaggeration}
        onChange={(e) => setTtsCustomParams(p => ({...p, exaggeration: parseFloat(e.target.value)}))}
        className="w-full"
      />
      <p className="text-[10px] text-zinc-600">0=monotono, 2=dramatico</p>
    </div>
  </div>
)}
```

**Step 2:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Slider de expressividade TTS"
```

---

### Task 5.5: Adicionar slider de Velocidade

**Files:** Modify `App.tsx`

**Step 1:** Adicionar dentro do bloco custom
```tsx
{/* Speed */}
<div>
  <div className="flex justify-between text-xs mb-1">
    <span className="text-zinc-400">Velocidade</span>
    <span className="text-zinc-500">{ttsCustomParams.speed.toFixed(1)}x</span>
  </div>
  <input
    type="range" min="0.5" max="2" step="0.1"
    value={ttsCustomParams.speed}
    onChange={(e) => setTtsCustomParams(p => ({...p, speed: parseFloat(e.target.value)}))}
    className="w-full"
  />
</div>
```

**Step 2:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Slider de velocidade TTS"
```

---

### Task 5.6: Adicionar slider de Estabilidade

**Files:** Modify `App.tsx`

**Step 1:** Adicionar dentro do bloco custom
```tsx
{/* Stability */}
<div>
  <div className="flex justify-between text-xs mb-1">
    <span className="text-zinc-400">Estabilidade</span>
    <span className="text-zinc-500">{ttsCustomParams.stability.toFixed(1)}</span>
  </div>
  <input
    type="range" min="0" max="1" step="0.1"
    value={ttsCustomParams.stability}
    onChange={(e) => setTtsCustomParams(p => ({...p, stability: parseFloat(e.target.value)}))}
    className="w-full"
  />
  <p className="text-[10px] text-zinc-600">0=variavel, 1=uniforme</p>
</div>
```

**Step 2:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Slider de estabilidade TTS"
```

---

### Task 5.7: Adicionar slider de Qualidade (steps)

**Files:** Modify `App.tsx`

**Step 1:** Adicionar dentro do bloco custom
```tsx
{/* Steps */}
<div>
  <div className="flex justify-between text-xs mb-1">
    <span className="text-zinc-400">Qualidade</span>
    <span className="text-zinc-500">{ttsCustomParams.steps} steps</span>
  </div>
  <input
    type="range" min="4" max="20" step="1"
    value={ttsCustomParams.steps}
    onChange={(e) => setTtsCustomParams(p => ({...p, steps: parseInt(e.target.value)}))}
    className="w-full"
  />
  <p className="text-[10px] text-zinc-600">4=rapido, 20=alta qualidade</p>
</div>
```

**Step 2:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Slider de qualidade TTS"
```

---

### Task 5.8: Adicionar slider de Pausa entre frases

**Files:** Modify `App.tsx`

**Step 1:** Adicionar dentro do bloco custom
```tsx
{/* Sentence Silence */}
<div>
  <div className="flex justify-between text-xs mb-1">
    <span className="text-zinc-400">Pausa entre frases</span>
    <span className="text-zinc-500">{ttsCustomParams.sentence_silence.toFixed(1)}s</span>
  </div>
  <input
    type="range" min="0" max="1" step="0.1"
    value={ttsCustomParams.sentence_silence}
    onChange={(e) => setTtsCustomParams(p => ({...p, sentence_silence: parseFloat(e.target.value)}))}
    className="w-full"
  />
</div>
```

**Step 2:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Slider de pausa TTS"
```

---

## Fase 6: Frontend - Clonagem de Voz

### Task 6.1: Adicionar secao de upload de voz

**Files:** Modify `App.tsx`

**Step 1:** Adicionar dentro do bloco ttsEngine === 'chatterbox'
```tsx
{/* Voice Clone */}
<div className="p-3 bg-zinc-900 rounded border border-zinc-800">
  <h4 className="text-xs font-medium text-zinc-300 mb-2">Clonagem de Voz</h4>
  {voiceRefAudio ? (
    <div className="flex items-center gap-2">
      <span className="text-xs text-green-400">Audio carregado</span>
      <button
        onClick={() => setVoiceRefAudio(null)}
        className="text-xs text-red-400"
      >
        Remover
      </button>
    </div>
  ) : (
    <div>
      <p className="text-[10px] text-zinc-500 mb-2">
        Importe audio de 5-15s da voz a clonar.
      </p>
      <input
        type="file"
        accept="audio/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            const buffer = await file.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            setVoiceRefAudio(base64);
          }
        }}
        className="text-xs"
      />
    </div>
  )}
</div>
```

**Step 2:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Upload de audio para clonagem de voz"
```

---

## Fase 7: Persistencia

### Task 7.1: Salvar configuracoes TTS no store

**Files:** Modify `App.tsx`

**Step 1:** Localizar onde o store e usado (proximo de outros useEffect de persistencia)

**Step 2:** Adicionar useEffect para salvar
```typescript
useEffect(() => {
  if (store) {
    store.set('tts_settings', {
      engine: ttsEngine,
      profile: ttsProfile,
      customParams: ttsCustomParams,
      voiceRef: voiceRefAudio,
    });
  }
}, [store, ttsEngine, ttsProfile, ttsCustomParams, voiceRefAudio]);
```

**Step 3:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Persiste configuracoes TTS no store"
```

---

### Task 7.2: Carregar configuracoes TTS do store

**Files:** Modify `App.tsx`

**Step 1:** Localizar useEffect de carregamento inicial

**Step 2:** Adicionar carregamento de TTS settings
```typescript
// Dentro do useEffect de inicializacao do store
const ttsSettings = await store.get<{
  engine: 'piper' | 'chatterbox';
  profile: string;
  customParams: typeof ttsCustomParams;
  voiceRef: string | null;
}>('tts_settings');

if (ttsSettings) {
  setTtsEngine(ttsSettings.engine);
  setTtsProfile(ttsSettings.profile);
  setTtsCustomParams(ttsSettings.customParams);
  setVoiceRefAudio(ttsSettings.voiceRef);
}
```

**Step 3:** Commit
```bash
git add App.tsx
git commit -m "feat(ui): Carrega configuracoes TTS do store"
```

---

## Fase 8: Build e Teste Final

### Task 8.1: Build frontend

```bash
cd /home/opc/ELCO-machina
bun run build
```

**Expected:** Build sem erros

---

### Task 8.2: Build Tauri

```bash
bun run tauri build
```

**Expected:** Build completo (~1-2 min)

---

### Task 8.3: Teste via MCP Tauri

**Step 1:** Instalar app no notebook
**Step 2:** Abrir Settings e verificar secao TTS
**Step 3:** Testar cada profile
**Step 4:** Testar parametros custom
**Step 5:** Testar upload de voz

---

## Resumo: 22 Tasks em 8 Fases

| Fase | Tasks | Foco |
|------|-------|------|
| 1 | 1.1-1.3 | Schema de profiles |
| 2 | 2.1-2.5 | Cliente Modal + Router |
| 3 | 3.1-3.2 | Modal function |
| 4 | 4.1-4.3 | Estados frontend |
| 5 | 5.1-5.8 | UI Settings (sliders) |
| 6 | 6.1 | Clonagem de voz |
| 7 | 7.1-7.2 | Persistencia |
| 8 | 8.1-8.3 | Build e teste |

Cada task leva 2-5 minutos. Total estimado: ~1.5-2h
