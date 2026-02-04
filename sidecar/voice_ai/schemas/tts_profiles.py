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


# Profiles pre-definidos
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


# Descricoes dos parametros para UI
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
