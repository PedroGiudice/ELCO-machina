"""
Gemini Refiner Service - Refinamento de texto via REST API

Cliente REST puro para a API do Gemini (generativelanguage.googleapis.com).
Sem SDK, sem singleton global. Apenas httpx + JSON.

Papel:
- NAO faz STT (Whisper faz localmente)
- SO formata/refina texto transcrito
- Aplica system_instruction fornecido pelo chamador
- OPCIONAL - sistema funciona 100% offline sem ele
"""
import logging
import os
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


@dataclass
class RefineResult:
    """Resultado do refinamento."""

    refined_text: str
    model_used: str
    success: bool
    error: str | None = None


class GeminiRestRefiner:
    """
    Cliente REST para refinamento de texto via Gemini API.

    Nao usa SDK. Faz POST direto para a API REST do Gemini.
    A api_key vem da env var GEMINI_API_KEY do sidecar.
    """

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or os.environ.get("GEMINI_API_KEY")

    @property
    def is_available(self) -> bool:
        """Verifica se o refinador esta disponivel (tem api_key)."""
        return bool(self._api_key)

    async def refine(
        self,
        text: str,
        system_instruction: str,
        model: str = "gemini-2.5-flash",
        temperature: float = 0.4,
    ) -> RefineResult:
        """
        Refina texto transcrito usando a API REST do Gemini.

        Args:
            text: Texto transcrito para refinar
            system_instruction: Prompt do sistema (estilo de output)
            model: ID do modelo Gemini
            temperature: Temperatura de geracao (0.0 - 1.0)

        Returns:
            RefineResult com texto refinado ou erro
        """
        if not self.is_available:
            return RefineResult(
                refined_text=text,
                model_used=model,
                success=False,
                error="GEMINI_API_KEY nao configurada.",
            )

        url = f"{GEMINI_API_BASE}/{model}:generateContent"

        payload = {
            "systemInstruction": {
                "parts": [{"text": system_instruction}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": text}],
                },
            ],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": 8192,
                "responseMimeType": "text/plain",
            },
        }

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    url,
                    params={"key": self._api_key},
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )

                if response.status_code != 200:
                    error_detail = response.text[:500]
                    logger.error(
                        "Gemini API erro %d: %s",
                        response.status_code,
                        error_detail,
                    )
                    return RefineResult(
                        refined_text=text,
                        model_used=model,
                        success=False,
                        error=f"HTTP {response.status_code}: {error_detail}",
                    )

                data = response.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    return RefineResult(
                        refined_text=text,
                        model_used=model,
                        success=False,
                        error="Resposta sem candidates",
                    )

                parts = candidates[0].get("content", {}).get("parts", [])
                refined = "".join(p.get("text", "") for p in parts).strip()

                if not refined:
                    return RefineResult(
                        refined_text=text,
                        model_used=model,
                        success=False,
                        error="Resposta vazia do Gemini",
                    )

                logger.info("Refinamento concluido via %s", model)
                return RefineResult(
                    refined_text=refined,
                    model_used=model,
                    success=True,
                )

        except httpx.TimeoutException:
            logger.error("Timeout ao chamar Gemini API")
            return RefineResult(
                refined_text=text,
                model_used=model,
                success=False,
                error="Timeout na chamada ao Gemini",
            )
        except Exception as e:
            logger.error("Erro no refinamento: %s", e)
            return RefineResult(
                refined_text=text,
                model_used=model,
                success=False,
                error=str(e),
            )
