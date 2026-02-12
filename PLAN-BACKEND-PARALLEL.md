# Plano: Melhorias Backend (paralelo ao Prompt Editor)

## Contexto

O backend do sidecar (`sidecar/voice_ai/`) esta funcional apos a Fase 1 do PLAN.md.
O frontend esta sendo reestruturado (Prompt Editor UI). Este plano cobre melhorias
backend independentes que podem ser executadas em paralelo sem conflitos.

Nenhuma mudanca de contrato de API. O `POST /transcribe` e o `GET /health` mantem
suas interfaces. As mudancas sao internas: performance, robustez, observabilidade.

---

## Fase 1: stt_service.transcribe() blocking -> async

**Problema:** `stt_service.transcribe()` e sincrono (CPU-bound, Whisper inference).
Ele e chamado dentro de um handler async do FastAPI (`transcribe_audio`). Isso bloqueia
o event loop do uvicorn durante 2-5 segundos, impedindo health checks e requests TTS.

**Arquivo:** `sidecar/voice_ai/services/stt_service.py`

**Mudanca:**

```python
# ANTES (transcribe.py, linha 145)
result = stt_service.transcribe(...)

# DEPOIS
import asyncio
result = await asyncio.to_thread(
    stt_service.transcribe,
    audio_base64=body.audio,
    format=body.format,
    language=body.language,
)
```

**Escopo:**

1. `sidecar/voice_ai/routers/transcribe.py` -- envolver chamada em `asyncio.to_thread()`
2. Nao mudar a assinatura de `stt_service.transcribe()` (continua sync)
3. Validar que `_model.transcribe()` do faster-whisper e thread-safe (e -- e puro C)

**Validacao:**

- `curl POST /transcribe` funciona normalmente
- Durante transcricao, `curl GET /health` responde em <100ms (nao bloqueia)
- Nenhuma regressao no tempo de transcricao

**Risco:** Baixo. `asyncio.to_thread()` e o padrao oficial para CPU-bound em FastAPI.

---

## Fase 2: Migrar print() para logging

**Problema:** `main.py` e `stt_service.py` usam `print()` para output. Os modulos
novos (`refiner.py`, `transcribe.py`) ja usam `logging`. Inconsistencia dificulta
filtragem e rotacao de logs.

**Arquivos:**

| Arquivo | prints | Acao |
|---------|--------|------|
| `sidecar/voice_ai/main.py` | ~15 | Migrar para `logger.info/error` |
| `sidecar/voice_ai/services/stt_service.py` | ~10 | Migrar para `logger.info/warning/error` |
| `sidecar/voice_ai/services/tts_service.py` | verificar | Migrar se houver |

**Padrao a seguir (ja usado em refiner.py):**

```python
import logging
logger = logging.getLogger(__name__)

# Antes: print(f"[VoiceAI] Iniciando sidecar...")
# Depois:
logger.info("Iniciando sidecar...")
```

**Configuracao de logging (adicionar em main.py):**

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
```

**Validacao:**

- Startup do sidecar mostra logs formatados com timestamp e modulo
- `grep -r "print(" sidecar/voice_ai/` retorna zero hits (exceto `__main__`)
- Logs do Whisper, Piper e refiner aparecem com formatacao consistente

**Risco:** Zero. Mudanca puramente cosmética.

---

## Fase 3: Health check -- resposta tipada para TTS engines

**Problema:** O frontend (`VoiceAIClient.ts`) espera `models.piper` e `models.modal`
no `HealthResponse`. O backend ja retorna isso. Mas o tipo `HealthResponse` no
`main.py` usa `dict[str, Any]` para `models`, perdendo documentacao e validacao.

**Arquivo:** `sidecar/voice_ai/main.py`

**Mudanca:** Criar schemas tipados para o campo `models` do HealthResponse.

```python
class WhisperModelStatus(BaseModel):
    status: Literal["loaded", "available", "not_loaded"]
    model: str | None = None

class PiperModelStatus(BaseModel):
    status: Literal["loaded", "available", "not_installed"]
    voice: str | None = None

class ModalModelStatus(BaseModel):
    status: Literal["available", "credentials_missing", "disabled"]
    engine: str = "chatterbox"

class ModelsStatus(BaseModel):
    whisper: WhisperModelStatus
    piper: PiperModelStatus
    modal: ModalModelStatus

class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded"]
    version: str
    models: ModelsStatus
    error: str | None = None
```

**Beneficio:**

- Documentacao automatica no `/docs` (Swagger)
- Validacao Pydantic garante que campos nunca ficam inconsistentes
- Frontend pode confiar no tipo sem `as any`

**Validacao:**

- `GET /health` retorna exatamente a mesma estrutura JSON de antes
- `/docs` mostra schema detalhado do HealthResponse
- Testes com `py_compile` passam

**Risco:** Baixo. Schema tipado e mais restritivo, pode quebrar se um campo
muda de nome. Mas como temos controle total, e seguro.

---

## Fase 4: Endpoint GET /prompts/builtins (opcional)

**Problema:** Os 18 prompts builtin estao hardcoded no frontend (`PromptStore.ts`).
Se o usuario quiser usar o app em outra maquina, precisa que os builtins estejam no
codigo compilado. Isso e aceitavel para agora, mas num cenario futuro (multi-device
ou app web), ter os builtins servidos pelo backend centraliza a fonte de verdade.

**NOTA:** Esta fase e OPCIONAL e de BAIXA PRIORIDADE. So implementar se as Fases 1-3
estiverem concluidas e houver tempo. O frontend atual NAO depende disso.

**Endpoint:**

```
GET /prompts/builtins

Response:
{
  "templates": [
    {
      "id": "builtin-verbatim",
      "name": "Verbatim",
      "systemInstruction": "ROLE: You are a professional text cleanup engine...",
      "temperature": 0.1,
      "isBuiltin": true
    },
    ...
  ]
}
```

**Implementacao:**

1. Criar `sidecar/voice_ai/routers/prompts.py` com router
2. Definir `PromptTemplate` schema Pydantic
3. Carregar de JSON file (`sidecar/voice_ai/data/builtin_prompts.json`)
4. Registrar router em `main.py`

**Frontend (futuro):** `PromptStore.init()` faz GET para buscar builtins do servidor
em vez de usar constantes compiladas. Fallback para constantes se offline.

**Risco:** Baixo. Endpoint read-only, sem estado mutavel.

---

## Fora de escopo

- Persistencia de prompts custom no backend (prompts custom sao do frontend/Tauri Store)
- Resampling audio (np.interp -> librosa) -- melhoria separada
- DuckDB + embeddings -- feature separada
- Autenticacao real -- feature separada
- Migracao TTS Modal -> VM OCI -- plano separado (PLAN-TTS.md)

## Ordem de execucao

1. Fase 1 (async transcribe) -- impacto imediato em responsividade
2. Fase 2 (logging) -- limpeza, zero risco
3. Fase 3 (health tipado) -- documentacao e robustez
4. Fase 4 (prompts endpoint) -- SOMENTE se 1-3 concluidas

## Validacao final

```bash
# Compilacao
python3 -m py_compile sidecar/voice_ai/main.py
python3 -m py_compile sidecar/voice_ai/routers/transcribe.py
python3 -m py_compile sidecar/voice_ai/services/stt_service.py

# Zero prints no codigo fonte (exceto __main__)
grep -rn "print(" sidecar/voice_ai/ --include="*.py" | grep -v __main__ | grep -v .venv

# Health check tipado
curl -s http://100.114.203.28:8765/health | python3 -m json.tool

# Transcricao round-trip (se sidecar ativo)
# Enviar audio base64 e verificar response com model_used
```
