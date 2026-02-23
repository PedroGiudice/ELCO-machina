# Claude Refiner Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Substituir completamente Ollama/Gemini refiners por Claude CLI headless no sidecar Python.

**Architecture:** Sidecar chama `stt-refiner.sh` via `asyncio.create_subprocess_exec`. O script recebe texto via stdin, prompt_file e model como args. Sem fallbacks, sem factory. Claude e o unico refiner.

**Tech Stack:** Python/FastAPI, asyncio subprocess, Claude CLI (`claude -p`), bash script existente.

---

### Task 1: Reescrever refiner.py -- substituir Ollama/Gemini por ClaudeRefiner

**Files:**
- Rewrite: `sidecar/voice_ai/services/refiner.py`

**Step 1: Escrever o novo refiner.py completo**

```python
"""
Refiner Service - Refinamento de texto via Claude CLI headless.

Unico backend: Claude CLI (`claude -p`) via subprocess.
Sem fallbacks. Se Claude CLI nao estiver no PATH, refinamento falha.
"""
import asyncio
import logging
import shutil
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Path do script refiner (relativo ao repo ou absoluto)
REFINER_SCRIPT = shutil.which("stt-refiner.sh") or "/home/opc/scripts/stt-refiner.sh"
DEFAULT_MODEL = "sonnet"
TIMEOUT_SECONDS = 120


@dataclass
class RefineResult:
    """Resultado do refinamento."""
    refined_text: str
    model_used: str
    success: bool
    error: str | None = None


async def refine(
    text: str,
    system_instruction: str | None = None,
    prompt_file: str | None = None,
    model: str = DEFAULT_MODEL,
) -> RefineResult:
    """
    Refina texto via Claude CLI headless.

    O texto e passado via stdin ao script stt-refiner.sh.
    O script aceita: <input> <prompt_file> <model>

    Args:
        text: Texto transcrito para refinar.
        system_instruction: System prompt inline (ignorado se prompt_file fornecido).
        prompt_file: Caminho para arquivo .md com system prompt.
        model: Modelo Claude (sonnet, haiku, opus).

    Returns:
        RefineResult com texto refinado ou erro.
    """
    if not text or not text.strip():
        return RefineResult(
            refined_text=text,
            model_used=model,
            success=False,
            error="Input vazio",
        )

    # Monta comando
    cmd = [REFINER_SCRIPT, "-", prompt_file or "", model]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=None,  # herda env do sidecar
        )

        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=text.encode()),
            timeout=TIMEOUT_SECONDS,
        )

        if proc.returncode != 0:
            error_msg = stderr.decode().strip() or f"Exit code {proc.returncode}"
            logger.error("Claude refiner falhou: %s", error_msg)
            return RefineResult(
                refined_text=text,
                model_used=model,
                success=False,
                error=error_msg,
            )

        refined = stdout.decode().strip()
        if not refined:
            return RefineResult(
                refined_text=text,
                model_used=model,
                success=False,
                error="Resposta vazia do Claude",
            )

        logger.info("Refinamento concluido via Claude/%s", model)
        return RefineResult(
            refined_text=refined,
            model_used=model,
            success=True,
        )

    except asyncio.TimeoutError:
        logger.error("Timeout (%ds) no Claude refiner", TIMEOUT_SECONDS)
        return RefineResult(
            refined_text=text,
            model_used=model,
            success=False,
            error=f"Timeout ({TIMEOUT_SECONDS}s)",
        )
    except FileNotFoundError:
        logger.error("Script refiner nao encontrado: %s", REFINER_SCRIPT)
        return RefineResult(
            refined_text=text,
            model_used=model,
            success=False,
            error=f"Script nao encontrado: {REFINER_SCRIPT}",
        )
    except Exception as e:
        logger.error("Erro no refinamento: %s", e)
        return RefineResult(
            refined_text=text,
            model_used=model,
            success=False,
            error=str(e),
        )


def is_available() -> bool:
    """Verifica se o script refiner existe no PATH."""
    import os
    return os.path.isfile(REFINER_SCRIPT) and os.access(REFINER_SCRIPT, os.X_OK)
```

**Step 2: Verificar que nao tem erros de sintaxe**

Run: `cd ~/ELCO-machina/sidecar && python -c "from voice_ai.services.refiner import refine, is_available; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add sidecar/voice_ai/services/refiner.py
git commit -m "refactor(sidecar): substituir Ollama/Gemini por ClaudeRefiner"
```

---

### Task 2: Atualizar transcribe router -- usar novo refiner

**Files:**
- Modify: `sidecar/voice_ai/routers/transcribe.py`

**Step 1: Atualizar imports e chamada de refinamento**

Mudancas:
- Import: `from voice_ai.services.refiner import refine as claude_refine` (em vez de `get_refiner`)
- Remover logica de factory/backend detection
- Chamar `await claude_refine(text=..., model=..., prompt_file=...)` direto
- Remover campo `refine_backend` do response (sempre "claude")
- Simplificar bloco de refinamento (linhas 180-201)

O bloco de refinamento (linhas 180-201) fica:

```python
        # 2. Refina com Claude se solicitado
        if body.refine and result.text and body.system_instruction:
            from voice_ai.services.refiner import refine as claude_refine

            refine_result = await claude_refine(
                text=result.text,
                system_instruction=body.system_instruction,
                model=body.model or "sonnet",
            )
            response.refined_text = refine_result.refined_text
            response.refine_success = refine_result.success
            response.refine_error = refine_result.error
            response.model_used = refine_result.model_used
            response.refine_backend = "claude"
```

**Step 2: Verificar endpoint carrega**

Run: `cd ~/ELCO-machina/sidecar && python -c "from voice_ai.routers.transcribe import router; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add sidecar/voice_ai/routers/transcribe.py
git commit -m "refactor(sidecar): transcribe router usa ClaudeRefiner direto"
```

---

### Task 3: Atualizar main.py -- limpar startup de refiner

**Files:**
- Modify: `sidecar/voice_ai/main.py`

**Step 1: Simplificar lifespan e health**

Mudancas:
- Import: `from voice_ai.services.refiner import is_available as refiner_available` (em vez de `get_refiner, OllamaRefiner`)
- Startup (linhas 76-87): substituir deteccao Ollama/Gemini por `refiner_available()`
- `state.refiner_backend` sempre "claude" se disponivel
- `state.refiner_model` sempre "sonnet" (default)
- Description do app: remover "Ollama/Gemini"
- Health: `RefinerStatus.backend` = "claude" ou None

**Step 2: Verificar app inicia**

Run: `cd ~/ELCO-machina/sidecar && timeout 5 python -c "from voice_ai.main import app; print('App criado:', app.title)" 2>&1 || true`
Expected: `App criado: Voice AI Sidecar`

**Step 3: Commit**

```bash
git add sidecar/voice_ai/main.py
git commit -m "refactor(sidecar): main.py limpo, refiner sempre Claude"
```

---

### Task 4: Limpar dependencias e docstrings

**Files:**
- Modify: `sidecar/requirements.txt` -- httpx pode sair SE nenhum outro servico usa (verificar tts_modal_client.py)
- Modify: `sidecar/voice_ai/routers/transcribe.py` -- atualizar docstrings
- Delete: nada (manter test_refiner_quality.ipynb como referencia)

**Step 1: Verificar se httpx e usado por outros modulos**

Run: `grep -r "httpx" ~/ELCO-machina/sidecar/voice_ai/ --include="*.py" -l`
Expected: Se aparece em outros arquivos alem de refiner.py, manter httpx no requirements.

**Step 2: Atualizar docstrings que mencionam Ollama/Gemini**

Buscar e substituir referencias em todos os .py do sidecar.

**Step 3: Commit**

```bash
git add -A sidecar/
git commit -m "chore(sidecar): limpar referencias Ollama/Gemini, atualizar docs"
```

---

### Task 5: Mover script e prompt para o repo

**Files:**
- Copy: `~/scripts/stt-refiner.sh` -> `sidecar/scripts/stt-refiner.sh`
- Copy: `~/prompts/stt-refiner-tech-docs.md` -> `sidecar/prompts/stt-refiner-tech-docs.md`
- Modify: `sidecar/voice_ai/services/refiner.py` -- atualizar REFINER_SCRIPT path

**Step 1: Copiar arquivos**

```bash
mkdir -p ~/ELCO-machina/sidecar/scripts ~/ELCO-machina/sidecar/prompts
cp ~/scripts/stt-refiner.sh ~/ELCO-machina/sidecar/scripts/
cp ~/prompts/stt-refiner-tech-docs.md ~/ELCO-machina/sidecar/prompts/
chmod +x ~/ELCO-machina/sidecar/scripts/stt-refiner.sh
```

**Step 2: Atualizar path no refiner.py**

```python
import os

# Path relativo ao diretorio do sidecar
_SIDECAR_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REFINER_SCRIPT = os.path.join(_SIDECAR_DIR, "scripts", "stt-refiner.sh")
```

**Step 3: Verificar path resolve**

Run: `cd ~/ELCO-machina/sidecar && python -c "from voice_ai.services.refiner import REFINER_SCRIPT; import os; print(REFINER_SCRIPT, os.path.exists(REFINER_SCRIPT))"`
Expected: `/home/opc/ELCO-machina/sidecar/scripts/stt-refiner.sh True`

**Step 4: Commit**

```bash
git add sidecar/scripts/ sidecar/prompts/ sidecar/voice_ai/services/refiner.py
git commit -m "feat(sidecar): mover script e prompt refiner para o repo"
```

---

### Task 6: Teste end-to-end manual

**Step 1: Iniciar sidecar**

```bash
cd ~/ELCO-machina/sidecar && python -m uvicorn voice_ai.main:app --host 0.0.0.0 --port 8765
```

**Step 2: Testar health**

```bash
curl -s http://localhost:8765/health | python3 -m json.tool
```
Expected: `refiner.status = "available"`, `refiner.backend = "claude"`

**Step 3: Testar refinamento isolado via script**

```bash
echo "Entao basicamente a gente tem o cloud code rodando ne e ele faz o refinamento do texto" | ~/ELCO-machina/sidecar/scripts/stt-refiner.sh -
```
Expected: Texto limpo, "Cloud" corrigido para "Claude"

**Step 4: Testar transcricao + refinamento via API (se audio disponivel)**

Usar notebook ou curl com audio base64 de teste.

---

## Fora de escopo (proxima sessao)

- Frontend dropdown de modelo refiner (ja envia `model` no request, so falta UI)
- Reescrever 13 system prompts dos output styles
- Adaptar PromptStore para prompts .md puros vs placeholders
