"""
TTS Modal Client - Cliente para chamar Chatterbox no Modal.

Permite sintese de voz com clonagem via GPU serverless.
"""

import os
from typing import Optional

# Modal sera importado lazy para evitar erro se nao instalado
_modal_available = False


def _check_modal_available() -> bool:
    """Verifica se Modal esta disponivel e configurado."""
    global _modal_available

    if _modal_available:
        return True

    try:
        import modal  # noqa: F401

        # Verifica se tem credenciais
        token_id = os.environ.get("MODAL_TOKEN_ID")
        token_secret = os.environ.get("MODAL_TOKEN_SECRET")

        if not token_id or not token_secret:
            print("[ModalClient] MODAL_TOKEN_ID ou MODAL_TOKEN_SECRET nao configurados")
            return False

        _modal_available = True
        return True

    except ImportError:
        print("[ModalClient] modal nao instalado")
        return False


class TTSModalClient:
    """
    Cliente para TTS com clonagem de voz via Modal.

    Uso:
        client = TTSModalClient()
        if client.is_available:
            audio = await client.synthesize("Texto", voice_ref_bytes)
    """

    APP_NAME = "elco-tts"
    CLASS_NAME = "TTSEngine"

    def __init__(self):
        """Inicializa o cliente Modal."""
        self._enabled = os.environ.get("MODAL_ENABLED", "false").lower() == "true"
        self._is_available = False
        self._engine = None

        if self._enabled:
            self._is_available = _check_modal_available()

    @property
    def is_available(self) -> bool:
        """Retorna se Modal TTS esta disponivel."""
        return self._enabled and self._is_available

    @property
    def is_enabled(self) -> bool:
        """Retorna se Modal esta habilitado nas configs."""
        return self._enabled

    def _get_engine(self):
        """Obtem referencia para o TTSEngine no Modal."""
        if self._engine is not None:
            return self._engine

        if not self.is_available:
            raise RuntimeError("Modal TTS nao disponivel")

        import modal

        # Lookup para a classe remota
        self._engine = modal.Cls.from_name(self.APP_NAME, self.CLASS_NAME)
        return self._engine

    def synthesize(
        self,
        text: str,
        voice_ref_bytes: Optional[bytes] = None,
        temperature: float = 0.8,
        top_p: float = 0.95,
        repetition_penalty: float = 1.2,
    ) -> bytes:
        """
        Sintetiza audio usando Chatterbox no Modal.

        Args:
            text: Texto para sintetizar
            voice_ref_bytes: Audio de referencia para clonagem (minimo 5s)
            temperature: Controle de variabilidade (0.0 - 1.0)
            top_p: Nucleus sampling (0.0 - 1.0)
            repetition_penalty: Penalidade para repeticoes

        Returns:
            Bytes do audio WAV gerado

        Raises:
            RuntimeError: Se Modal nao disponivel ou erro na sintese
        """
        if not self.is_available:
            raise RuntimeError(
                "Modal TTS nao disponivel. "
                "Verifique MODAL_ENABLED=true e credenciais."
            )

        try:
            engine = self._get_engine()

            # Chama metodo remoto
            audio_bytes = engine().synthesize.remote(
                text=text,
                voice_ref_bytes=voice_ref_bytes,
                temperature=temperature,
                top_p=top_p,
                repetition_penalty=repetition_penalty,
            )

            return audio_bytes

        except Exception as e:
            raise RuntimeError(f"Erro na sintese Modal: {e}")

    def health(self) -> dict:
        """
        Verifica saude do servico Modal.

        Returns:
            dict com status do servico
        """
        if not self.is_available:
            return {
                "status": "unavailable",
                "enabled": self._enabled,
                "reason": "Modal nao configurado ou credenciais ausentes",
            }

        try:
            engine = self._get_engine()
            result = engine().health.remote()
            return {
                "status": "healthy",
                "enabled": True,
                **result,
            }
        except Exception as e:
            return {
                "status": "error",
                "enabled": True,
                "error": str(e),
            }
