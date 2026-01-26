"""
Gemini Refiner Service - Refinamento de texto via cloud

Papel REDUZIDO:
- NAO faz mais STT (Whisper faz localmente)
- SO formata/refina texto transcrito
- Aplica estilos (Verbatim, Elegant Prose, Prompt, etc)
- OPCIONAL - sistema funciona 100% offline sem ele
"""
import os
from dataclasses import dataclass
from typing import Literal

# Estilos de output disponiveis
OutputStyle = Literal[
    "verbatim",      # Fiel a fala original
    "elegant_prose", # Prosa elegante e fluida
    "formal",        # Linguagem formal
    "casual",        # Linguagem casual
    "prompt",        # Otimizado para prompts de IA
    "bullet_points", # Lista com pontos
    "summary",       # Resumo conciso
]

# Prompts para cada estilo
STYLE_PROMPTS: dict[OutputStyle, str] = {
    "verbatim": """
Refine o texto transcrito mantendo-o o mais fiel possivel a fala original.
Corrija apenas:
- Erros obvios de transcricao
- Pontuacao basica
- Capitalizacao

NAO altere:
- Estrutura das frases
- Vocabulario usado
- Expressoes coloquiais

Texto transcrito:
{text}

Texto refinado:
""",

    "elegant_prose": """
Transforme o texto transcrito em prosa elegante e fluida.
Mantenha todas as ideias originais, mas:
- Melhore a estrutura das frases
- Use vocabulario mais rico
- Adicione transicoes suaves
- Corrija redundancias

Texto transcrito:
{text}

Prosa refinada:
""",

    "formal": """
Converta o texto transcrito para linguagem formal.
- Use terceira pessoa quando apropriado
- Evite contracoces e girias
- Mantenha tom profissional
- Estruture em paragrafos claros

Texto transcrito:
{text}

Versao formal:
""",

    "casual": """
Mantenha o texto em tom casual e conversacional.
- Preserve expressoes coloquiais apropriadas
- Use linguagem acessivel
- Corrija apenas erros graves
- Mantenha a personalidade do falante

Texto transcrito:
{text}

Versao casual:
""",

    "prompt": """
Otimize o texto para uso como prompt de IA.
- Seja claro e especifico
- Remova ambiguidades
- Estruture instrucoes logicamente
- Adicione contexto quando necessario

Texto transcrito:
{text}

Prompt otimizado:
""",

    "bullet_points": """
Converta o texto em lista de pontos organizados.
- Identifique ideias principais
- Use marcadores claros
- Agrupe itens relacionados
- Mantenha cada ponto conciso

Texto transcrito:
{text}

Lista de pontos:
""",

    "summary": """
Crie um resumo conciso do texto.
- Capture as ideias principais
- Mantenha em 2-3 sentencas
- Preserve informacoes essenciais
- Seja objetivo

Texto transcrito:
{text}

Resumo:
""",
}


@dataclass
class RefineResult:
    """Resultado do refinamento."""
    original_text: str
    refined_text: str
    style: OutputStyle
    success: bool
    error: str | None = None


class GeminiRefiner:
    """
    Servico de refinamento de texto usando Gemini.

    Atributos:
        api_key: Chave da API do Gemini (ou None para desabilitar)
        model: Modelo Gemini a usar (default: gemini-1.5-flash)
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gemini-1.5-flash",
    ):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self.model = model
        self._client = None

        if self.api_key:
            self._init_client()

    def _init_client(self):
        """Inicializa cliente Gemini."""
        try:
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            self._client = genai.GenerativeModel(self.model)
            print(f"[Refiner] Cliente Gemini inicializado ({self.model})")
        except Exception as e:
            print(f"[Refiner] Erro ao inicializar Gemini: {e}")
            self._client = None

    @property
    def is_available(self) -> bool:
        """Verifica se o refinador esta disponivel."""
        return self._client is not None

    def refine(
        self,
        text: str,
        style: OutputStyle = "verbatim",
    ) -> RefineResult:
        """
        Refina texto transcrito usando Gemini.

        Args:
            text: Texto transcrito para refinar
            style: Estilo de output desejado

        Returns:
            RefineResult com texto refinado
        """
        # Se Gemini nao disponivel, retorna texto original
        if not self.is_available:
            return RefineResult(
                original_text=text,
                refined_text=text,
                style=style,
                success=False,
                error="Gemini nao configurado. Configure GEMINI_API_KEY.",
            )

        # Monta prompt
        prompt_template = STYLE_PROMPTS.get(style, STYLE_PROMPTS["verbatim"])
        full_prompt = prompt_template.format(text=text)

        try:
            # Chama Gemini
            response = self._client.generate_content(
                full_prompt,
                generation_config={
                    "temperature": 0.3,  # Baixa para manter fidelidade
                    "max_output_tokens": 8192,
                },
            )

            refined_text = response.text.strip()

            return RefineResult(
                original_text=text,
                refined_text=refined_text,
                style=style,
                success=True,
            )

        except Exception as e:
            return RefineResult(
                original_text=text,
                refined_text=text,
                style=style,
                success=False,
                error=str(e),
            )


# Instancia singleton para uso global
_refiner_instance: GeminiRefiner | None = None


def get_refiner() -> GeminiRefiner:
    """Retorna instancia singleton do refiner."""
    global _refiner_instance
    if _refiner_instance is None:
        _refiner_instance = GeminiRefiner()
    return _refiner_instance
