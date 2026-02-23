"""
Refiner Service - Refinamento de texto via Claude CLI headless

Unico backend: ClaudeRefiner via `claude` CLI com asyncio.create_subprocess_exec.
Sem Ollama, sem Gemini, sem fallbacks.

Invocacao equivalente ao script validado stt-refiner.sh:
    env -u CLAUDECODE claude -p "$INPUT" \
        --system-prompt "$SYSTEM" \
        --model "$MODEL" \
        --effort low \
        --output-format text \
        --no-session-persistence \
        --tools "" \
        --disable-slash-commands
"""
import asyncio
import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)

CLAUDE_REFINE_TIMEOUT = int(os.environ.get("CLAUDE_REFINE_TIMEOUT", "60"))


@dataclass
class RefineResult:
    """Resultado do refinamento."""

    refined_text: str
    model_used: str
    success: bool
    error: str | None = None


class ClaudeRefiner:
    """
    Refinador de texto via Claude CLI headless.

    Invoca `claude` como subprocess com stdin para o input e captura stdout.
    Usa env -u CLAUDECODE para evitar deteccao de contexto Claude Code.
    """

    def __init__(self):
        self._timeout = CLAUDE_REFINE_TIMEOUT

    async def refine(
        self,
        text: str,
        system_instruction: str,
        model: str = "sonnet",
    ) -> RefineResult:
        """
        Refina texto transcrito via Claude CLI.

        Args:
            text: Texto transcrito para refinar
            system_instruction: Prompt do sistema (estilo de output)
            model: Modelo Claude (sonnet, opus, haiku, ou ID completo)

        Returns:
            RefineResult com texto refinado ou erro
        """
        cmd = [
            "env",
            "-u",
            "CLAUDECODE",
            "claude",
            "-p",
            text,
            "--system-prompt",
            system_instruction,
            "--model",
            model,
            "--effort",
            "low",
            "--output-format",
            "text",
            "--no-session-persistence",
            "--tools",
            "",
            "--disable-slash-commands",
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=self._timeout,
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                logger.error("Timeout (%ds) ao chamar Claude CLI", self._timeout)
                return RefineResult(
                    refined_text=text,
                    model_used=model,
                    success=False,
                    error=f"Timeout ({self._timeout}s) na chamada ao Claude CLI",
                )

            if proc.returncode != 0:
                error_output = stderr.decode("utf-8", errors="replace").strip()
                logger.error(
                    "Claude CLI saiu com codigo %d: %s",
                    proc.returncode,
                    error_output[:500],
                )
                return RefineResult(
                    refined_text=text,
                    model_used=model,
                    success=False,
                    error=f"Claude CLI erro (exit {proc.returncode}): {error_output[:200]}",
                )

            refined = stdout.decode("utf-8", errors="replace").strip()

            if not refined:
                logger.warning("Claude CLI retornou output vazio")
                return RefineResult(
                    refined_text=text,
                    model_used=model,
                    success=False,
                    error="Resposta vazia do Claude CLI",
                )

            logger.info("Refinamento concluido via claude/%s", model)
            return RefineResult(
                refined_text=refined,
                model_used=model,
                success=True,
            )

        except FileNotFoundError:
            logger.error("claude CLI nao encontrado no PATH")
            return RefineResult(
                refined_text=text,
                model_used=model,
                success=False,
                error="claude CLI nao encontrado. Verifique se esta instalado e no PATH.",
            )
        except Exception as e:
            logger.error("Erro ao executar Claude CLI: %s", e)
            return RefineResult(
                refined_text=text,
                model_used=model,
                success=False,
                error=str(e),
            )
