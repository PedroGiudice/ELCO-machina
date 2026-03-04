# Modal STT Backend -- Plano de Implementacao

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir que o usuario escolha entre processar STT na VM (whisper.cpp CPU) ou no Modal (faster-whisper GPU), via toggle no app.

**Architecture:** O sidecar recebe um campo `stt_backend: "vm" | "modal"` no request. Se `"vm"`, usa `STTService` (whisper.cpp CLI) como hoje. Se `"modal"`, usa novo `STTModalClient` que chama `Whisper().transcribe.remote()` via Modal Python SDK. O refinamento (Claude CLI) continua sempre local na VM. O frontend expoe um select no PanelConfig para o usuario escolher. O parametro trafega no body JSON em todos os paths (desktop safeFetch, Android NativeAudio).

**Tech Stack:** Python (Modal SDK, FastAPI), TypeScript/React (frontend)

**Script base:** `scripts/modal_whisper_bench.py` -- ja tem a classe `Whisper` com image, GPU config e metodo `transcribe()`. NAO alterar este script. O novo servico importa/reutiliza a mesma app Modal.

---

## Task 1: Criar STTModalClient no sidecar

**Files:**
- Create: `sidecar/voice_ai/services/stt_modal_client.py`

**Step 1: Criar o cliente Modal para STT**

```python
"""
STT Modal Client -- Transcreve audio via Modal (faster-whisper GPU).

Usa a mesma app Modal definida em scripts/modal_whisper_bench.py.
O script ja tem a imagem com modelo cacheado no snapshot.

Requisito: MODAL_TOKEN_ID e MODAL_TOKEN_SECRET no ambiente.
"""
import base64
import logging
import os
import time

logger = logging.getLogger(__name__)


class STTModalClient:
    """
    Cliente para transcricao via Modal.

    Chama Whisper().transcribe.remote(audio_bytes, language) e retorna
    resultado no mesmo formato que STTService.TranscriptionResult.
    """

    def __init__(self):
        self._available = False
        try:
            import modal  # noqa: F401
            # Verifica credenciais
            token_id = os.environ.get("MODAL_TOKEN_ID")
            token_secret = os.environ.get("MODAL_TOKEN_SECRET")
            if token_id and token_secret:
                self._available = True
                logger.info("STT Modal client disponivel")
            else:
                logger.info("STT Modal client: credenciais ausentes (MODAL_TOKEN_ID/SECRET)")
        except ImportError:
            logger.info("STT Modal client: modal SDK nao instalado")

    @property
    def is_available(self) -> bool:
        return self._available

    def transcribe(
        self,
        audio_base64: str,
        format: str = "webm",
        language: str | None = "pt",
    ) -> dict:
        """
        Transcreve audio via Modal GPU.

        Args:
            audio_base64: Audio codificado em base64
            format: Formato do audio (webm, wav, mp3, ogg, m4a)
            language: Codigo do idioma ou None para auto-detect

        Returns:
            dict com keys: text, language, confidence, duration, segments
        """
        if not self._available:
            raise RuntimeError("Modal STT nao disponivel (credenciais ou SDK ausentes)")

        import modal

        audio_bytes = base64.b64decode(audio_base64)

        # Lookup da classe Whisper na app whisper-bench (ja deployada)
        Whisper = modal.Cls.from_name("whisper-bench", "Whisper")

        t0 = time.perf_counter()
        result = Whisper().transcribe.remote(audio_bytes, language or "pt")
        wall_time = time.perf_counter() - t0

        logger.info(
            "Modal STT: %.1fs wall, %.1fs inference, %.1fs audio, RTF %.3f",
            wall_time, result["inference_s"], result["duration_audio_s"], result["rtf"],
        )

        # Converte para formato compativel com TranscriptionResult
        segments = [
            {
                "start": s["start"],
                "end": s["end"],
                "text": s["text"],
                "confidence": 0.95,
            }
            for s in result.get("segments", [])
        ]

        return {
            "text": result["text"],
            "language": result.get("language", language or "pt"),
            "confidence": 0.95,
            "duration": result.get("duration_audio_s", 0.0),
            "segments": segments,
        }
```

**Step 2: Verificar import manual**

Run: `cd /home/opc/ELCO-machina/sidecar && .venv/bin/python -c "from voice_ai.services.stt_modal_client import STTModalClient; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add sidecar/voice_ai/services/stt_modal_client.py
git commit -m "feat(sidecar): add STTModalClient para transcricao via Modal GPU"
```

---

## Task 2: Integrar stt_backend no router /transcribe

**Files:**
- Modify: `sidecar/voice_ai/routers/transcribe.py`
- Modify: `sidecar/voice_ai/main.py`

**Step 1: Adicionar campo stt_backend ao TranscribeRequest**

Em `sidecar/voice_ai/routers/transcribe.py`, adicionar campo no modelo Pydantic:

```python
# Dentro de class TranscribeRequest, apos o campo temperature:
stt_backend: Literal["vm", "modal"] = Field(
    default="vm",
    description="Backend STT: 'vm' (whisper.cpp local) ou 'modal' (faster-whisper GPU)",
)
```

**Step 2: Rotear pelo backend no endpoint transcribe_audio**

Em `sidecar/voice_ai/routers/transcribe.py`, na funcao `transcribe_audio`, substituir o bloco de transcricao (linhas 151-160) por:

```python
    try:
        # 1. Transcreve com backend escolhido pelo usuario
        if body.stt_backend == "modal":
            # Modal: faster-whisper GPU (T4)
            stt_modal = getattr(request.state, "stt_modal_client", None)
            if not stt_modal or not stt_modal.is_available:
                raise HTTPException(
                    status_code=503,
                    detail="Modal STT nao disponivel (credenciais ou SDK ausentes)",
                )
            logger.info("STT via Modal (faster-whisper GPU)")
            raw = await asyncio.to_thread(
                stt_modal.transcribe,
                audio_base64=body.audio,
                format=body.format,
                language=body.language,
            )
            # raw e dict, converter para TranscriptionResult-like
            from dataclasses import SimpleNamespace
            result = SimpleNamespace(**raw)
        else:
            # VM: whisper.cpp CLI (default)
            if not stt_service:
                raise HTTPException(
                    status_code=503,
                    detail="Servico STT nao disponivel",
                )
            logger.info("STT via VM (whisper.cpp CLI)")
            result = await asyncio.to_thread(
                stt_service.transcribe,
                audio_base64=body.audio,
                format=body.format,
                language=body.language,
                model=body.stt_model,
            )
```

Nota: `SimpleNamespace` e built-in, nao precisa de import externo. Importar no topo do arquivo: `from types import SimpleNamespace`.

**Step 3: Injetar stt_modal_client no middleware**

Em `sidecar/voice_ai/main.py`:

1. Adicionar import: `from voice_ai.services.stt_modal_client import STTModalClient`
2. Em `AppState`, adicionar: `stt_modal_client: STTModalClient | None = None`
3. No `lifespan`, apos inicializar `state.stt_service`, adicionar:
```python
        # Inicializa Modal STT Client
        state.stt_modal_client = STTModalClient()
        if state.stt_modal_client.is_available:
            logger.info("STT (Modal/faster-whisper) disponivel")
        else:
            logger.info("STT (Modal) nao disponivel")
```
4. No middleware `inject_services`, adicionar:
```python
    request.state.stt_modal_client = state.stt_modal_client
```

**Step 4: Testar manualmente**

```bash
# Restart sidecar
cd /home/opc/ELCO-machina/sidecar
pkill -f "uvicorn voice_ai"
sleep 2
.venv/bin/uvicorn voice_ai.main:app --host 0.0.0.0 --port 8765 &

# Health check
curl -s http://localhost:8765/health | python3 -m json.tool

# Teste com VM (default)
# (usar audio de teste se disponivel)
```

**Step 5: Commit**

```bash
git add sidecar/voice_ai/routers/transcribe.py sidecar/voice_ai/main.py
git commit -m "feat(sidecar): rotear STT por backend (vm/modal) via campo stt_backend"
```

---

## Task 3: Adicionar stt_backend ao frontend (settings + request)

**Files:**
- Modify: `src/hooks/useSettings.ts`
- Modify: `src/services/VoiceAIClient.ts`
- Modify: `src/hooks/useAudioProcessing.ts`

**Step 1: Novo estado sttBackend em useSettings**

Em `src/hooks/useSettings.ts`:

1. Adicionar tipo: `export type SttBackend = 'vm' | 'modal';`
2. Adicionar estado:
```typescript
const [sttBackend, setSttBackend] = useState<SttBackend>(() => {
  return (localStorage.getItem('stt_backend') as SttBackend) || 'vm';
});
```
3. Adicionar persist effect:
```typescript
useEffect(() => localStorage.setItem('stt_backend', sttBackend), [sttBackend]);
```
4. Adicionar ao `UseSettingsReturn` interface:
```typescript
sttBackend: SttBackend;
setSttBackend: (v: SttBackend) => void;
```
5. Adicionar ao retorno do `useMemo` e ao array de deps.

**Step 2: Adicionar stt_backend ao TranscribeRequest**

Em `src/services/VoiceAIClient.ts`, na interface `TranscribeRequest`:

```typescript
stt_backend?: "vm" | "modal"; // default "vm"
```

No metodo `transcribe()` da classe `VoiceAIClient`, adicionar ao body:

```typescript
if (request.stt_backend !== undefined) {
  body.stt_backend = request.stt_backend;
}
```

**Step 3: Propagar sttBackend no useAudioProcessing**

Em `src/hooks/useAudioProcessing.ts`:

1. Adicionar `sttBackend: string;` ao `UseAudioProcessingConfig`
2. Extrair do config: `sttBackend` junto com os demais
3. No `voiceAIClient.transcribe({...})`, adicionar:
```typescript
stt_backend: sttBackend as "vm" | "modal",
```
4. Adicionar `sttBackend` ao array de deps do `useCallback`.

**Step 4: Verificar TypeScript**

Run: `cd /home/opc/ELCO-machina && bun run tsc --noEmit`
Expected: sem erros

**Step 5: Commit**

```bash
git add src/hooks/useSettings.ts src/services/VoiceAIClient.ts src/hooks/useAudioProcessing.ts
git commit -m "feat(frontend): propagar stt_backend (vm/modal) do settings ate o request"
```

---

## Task 4: Toggle no PanelConfig

**Files:**
- Modify: `src/components/panels/PanelConfig.tsx`
- Modify: arquivo que instancia PanelConfig (verificar onde as props sao passadas)

**Step 1: Adicionar props de sttBackend**

Em `PanelConfigProps`:

```typescript
// STT Backend
sttBackend: "vm" | "modal";
onSttBackendChange: (backend: "vm" | "modal") => void;
```

**Step 2: Adicionar UI de selecao**

Apos a secao de "Transcription Mode" (ou onde fizer mais sentido visualmente), adicionar bloco similar aos `transcriptionModes`:

```typescript
const sttBackends = [
  { id: "vm" as const, label: "VM", desc: "whisper.cpp (CPU)" },
  { id: "modal" as const, label: "Modal", desc: "faster-whisper (GPU)" },
];
```

E no JSX, um grupo de botoes similar ao grupo de `aiModels`:

```tsx
{/* STT Backend */}
<div className="space-y-2">
  <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
    STT Backend
  </label>
  <div className="grid grid-cols-2 gap-2">
    {sttBackends.map((b) => (
      <button
        key={b.id}
        onClick={() => onSttBackendChange(b.id)}
        className={`px-3 py-2 rounded-lg text-sm transition-all ${
          sttBackend === b.id
            ? "bg-indigo-600 text-white"
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
        }`}
      >
        <div className="font-medium">{b.label}</div>
        <div className="text-xs opacity-70">{b.desc}</div>
      </button>
    ))}
  </div>
</div>
```

**Step 3: Passar props onde PanelConfig e instanciado**

Localizar o componente pai que renderiza `<PanelConfig ... />` e adicionar:

```tsx
sttBackend={settings.sttBackend}
onSttBackendChange={settings.setSttBackend}
```

**Step 4: Verificar TypeScript**

Run: `cd /home/opc/ELCO-machina && bun run tsc --noEmit`

**Step 5: Commit**

```bash
git add src/components/panels/PanelConfig.tsx <arquivo-pai>
git commit -m "feat(ui): toggle STT backend (VM/Modal) no PanelConfig"
```

---

## Task 5: Passar sttBackend no call site do useAudioProcessing

**Files:**
- Modify: arquivo que chama `useAudioProcessing(config)` (provavelmente `App.tsx` ou componente que monta o config)

**Step 1: Encontrar call site**

```bash
grep -rn "useAudioProcessing" src/ --include="*.tsx" --include="*.ts"
```

**Step 2: Adicionar sttBackend ao config**

No objeto `config` passado ao `useAudioProcessing({...})`, adicionar:

```typescript
sttBackend: settings.sttBackend,
```

Onde `settings` vem de `useSettings()`.

**Step 3: Verificar TypeScript e testar**

Run: `cd /home/opc/ELCO-machina && bun run tsc --noEmit`

**Step 4: Commit**

```bash
git add <arquivo>
git commit -m "feat: conectar sttBackend do settings ao useAudioProcessing"
```

---

## Task 6: Instalar modal SDK no venv do sidecar

**Files:**
- Modify: `sidecar/requirements.txt` (se existir)

**Step 1: Instalar modal no venv**

```bash
cd /home/opc/ELCO-machina/sidecar
uv pip install --python .venv/bin/python modal
```

**Step 2: Verificar**

```bash
.venv/bin/python -c "import modal; print(modal.__version__)"
```

**Step 3: Adicionar ao requirements.txt se existir**

```bash
echo "modal>=0.73.0" >> requirements.txt
git add requirements.txt
git commit -m "chore(sidecar): add modal SDK dependency"
```

---

## Task 7: Deploy da app Modal (se nao deployada)

**Ponto:** O script `scripts/modal_whisper_bench.py` define a app `whisper-bench` com `@app.cls`. Para usar `modal.Cls.from_name()`, a app precisa estar deployada (nao so `modal run`).

**Step 1: Verificar se ja esta deployada**

```bash
modal app list 2>/dev/null | grep whisper-bench
```

**Step 2: Se nao deployada, deployer**

```bash
cd /home/opc/ELCO-machina
modal deploy scripts/modal_whisper_bench.py
```

Nota: `modal deploy` cria a app persistente. O `modal.Cls.from_name("whisper-bench", "Whisper")` so funciona com app deployada.

**Step 3: Verificar**

```bash
modal app list | grep whisper-bench
```

Expected: linha mostrando `whisper-bench` como deployed.

---

## Task 8: Teste end-to-end e restart do sidecar

**Step 1: Restart sidecar com modal disponivel**

```bash
pkill -f "uvicorn voice_ai"
sleep 2
cd /home/opc/ELCO-machina/sidecar
nohup .venv/bin/uvicorn voice_ai.main:app --host 0.0.0.0 --port 8765 > /tmp/sidecar.log 2>&1 &
sleep 3
curl -s http://localhost:8765/health | python3 -m json.tool
```

**Step 2: Testar transcricao via Modal**

```bash
# Encode audio de teste
AUDIO_B64=$(base64 -w0 /home/opc/ELCO-machina/TesteModal.m4a)

# Request com stt_backend=modal
curl -s -X POST http://localhost:8765/transcribe \
  -H "Content-Type: application/json" \
  -d "{\"audio\": \"$AUDIO_B64\", \"format\": \"m4a\", \"language\": \"pt\", \"stt_backend\": \"modal\"}" \
  | python3 -m json.tool | head -20
```

**Step 3: Testar transcricao via VM (regressao)**

```bash
curl -s -X POST http://localhost:8765/transcribe \
  -H "Content-Type: application/json" \
  -d "{\"audio\": \"$AUDIO_B64\", \"format\": \"m4a\", \"language\": \"pt\", \"stt_backend\": \"vm\"}" \
  | python3 -m json.tool | head -20
```

**Step 4: Build frontend e verificar**

```bash
cd /home/opc/ELCO-machina && bun run tsc --noEmit
```

---

## Resumo de arquivos

| Arquivo | Acao | Task |
|---------|------|------|
| `sidecar/voice_ai/services/stt_modal_client.py` | Criar | 1 |
| `sidecar/voice_ai/routers/transcribe.py` | Modificar | 2 |
| `sidecar/voice_ai/main.py` | Modificar | 2 |
| `src/hooks/useSettings.ts` | Modificar | 3 |
| `src/services/VoiceAIClient.ts` | Modificar | 3 |
| `src/hooks/useAudioProcessing.ts` | Modificar | 3 |
| `src/components/panels/PanelConfig.tsx` | Modificar | 4 |
| Componente pai do PanelConfig | Modificar | 4-5 |
| `sidecar/requirements.txt` | Modificar | 6 |
| `scripts/modal_whisper_bench.py` | **NAO TOCAR** | - |
