"""Schemas para XTTS v2 TTS."""
from typing import Optional
from pydantic import BaseModel, Field


class TTSParameters(BaseModel):
    """Parametros do XTTS v2."""

    # Parametros de inferencia
    temperature: float = Field(default=0.75, ge=0.1, le=0.8)
    top_k: int = Field(default=20, ge=1, le=100)
    top_p: float = Field(default=0.75, ge=0.1, le=1.0)
    repetition_penalty: float = Field(default=2.0, ge=1.0, le=5.0)
    length_penalty: float = Field(default=1.0, ge=0.5, le=2.0)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    language: str = Field(default="pt")


# Profiles pre-definidos
BUILTIN_PROFILES: dict[str, TTSParameters] = {
    "standard": TTSParameters(),
    "legal": TTSParameters(
        temperature=0.5,
        top_k=10,
        top_p=0.6,
        repetition_penalty=2.5,
        speed=0.9,
    ),
    "expressive": TTSParameters(
        temperature=0.8,
        top_k=50,
        top_p=0.9,
        repetition_penalty=1.5,
        speed=1.0,
    ),
    "fast_preview": TTSParameters(
        temperature=0.5,
        top_k=10,
        top_p=0.5,
        speed=1.3,
    ),
}


def get_profile(name: str) -> TTSParameters:
    """Retorna profile por nome ou default."""
    return BUILTIN_PROFILES.get(name, BUILTIN_PROFILES["standard"])


# Descricoes dos parametros para UI
PARAM_DESCRIPTIONS: dict[str, str] = {
    "temperature": "Variabilidade (0.1=deterministico, 0.8=criativo)",
    "top_k": "Top-K sampling (1=conservador, 100=diverso)",
    "top_p": "Nucleus sampling (0.1=focado, 1.0=amplo)",
    "repetition_penalty": "Penalidade para repeticoes (1.0=nenhuma, 5.0=severa)",
    "length_penalty": "Penalidade de comprimento (0.5=curto, 2.0=longo)",
    "speed": "Velocidade de fala (0.5=lento, 2.0=rapido)",
    "language": "Idioma (pt, en, es, etc.)",
}
