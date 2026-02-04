"""
Text Preprocessor for TTS

Converte Markdown e texto formatado em texto limpo otimizado para TTS.
Adiciona pausas semanticas baseadas na estrutura do documento.
"""

import re


def preprocess_for_tts(text: str, read_code: bool = False) -> str:
    """
    Preprocessa texto para TTS.

    Args:
        text: Texto original (pode conter Markdown)
        read_code: Se True, tenta ler blocos de codigo; se False, omite

    Returns:
        Texto limpo com marcadores de pausa
    """
    if not text:
        return ""

    # Remove blocos de codigo (ou substitui por aviso)
    if not read_code:
        text = re.sub(
            r"```[\s\S]*?```",
            " ... bloco de codigo omitido ... ",
            text,
        )
        # Codigo inline
        text = re.sub(r"`[^`]+`", lambda m: m.group(0)[1:-1], text)

    # Headers -> pausas longas
    text = re.sub(r"^# (.+)$", r"... \1 ...", text, flags=re.MULTILINE)
    text = re.sub(r"^## (.+)$", r".. \1 ..", text, flags=re.MULTILINE)
    text = re.sub(r"^### (.+)$", r". \1 .", text, flags=re.MULTILINE)
    text = re.sub(r"^#{4,} (.+)$", r"\1.", text, flags=re.MULTILINE)

    # Formatacao de texto
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)  # bold
    text = re.sub(r"\*(.+?)\*", r"\1", text)  # italic
    text = re.sub(r"__(.+?)__", r"\1", text)  # bold alternativo
    text = re.sub(r"_(.+?)_", r"\1", text)  # italic alternativo
    text = re.sub(r"~~(.+?)~~", r"\1", text)  # strikethrough

    # Links - mantem apenas o texto
    text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text)

    # Imagens - remove completamente
    text = re.sub(r"!\[.*?\]\(.+?\)", "", text)

    # Listas - remove marcadores mas mantem conteudo
    text = re.sub(r"^[-*+] ", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\d+\. ", "", text, flags=re.MULTILINE)

    # Blockquotes
    text = re.sub(r"^> ?", "", text, flags=re.MULTILINE)

    # Linhas horizontais
    text = re.sub(r"^[-*_]{3,}$", "...", text, flags=re.MULTILINE)

    # Tabelas - simplifica
    text = re.sub(r"\|", " ", text)
    text = re.sub(r"^[-:| ]+$", "", text, flags=re.MULTILINE)

    # HTML tags
    text = re.sub(r"<[^>]+>", "", text)

    # Multiplas linhas em branco -> uma pausa
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Espacos multiplos
    text = re.sub(r" {2,}", " ", text)

    # Remove linhas vazias no inicio/fim
    text = text.strip()

    return text


def estimate_duration(text: str, words_per_minute: float = 150) -> float:
    """
    Estima duracao da leitura em segundos.

    Args:
        text: Texto preprocessado
        words_per_minute: Velocidade de leitura (default: 150 wpm)

    Returns:
        Duracao estimada em segundos
    """
    words = len(text.split())
    # Adiciona tempo para pausas (...)
    pauses = text.count("...")
    pause_time = pauses * 0.5  # 0.5s por pausa longa

    reading_time = (words / words_per_minute) * 60
    return reading_time + pause_time


def split_into_chunks(text: str, max_chars: int = 500) -> list[str]:
    """
    Divide texto em chunks para processamento.

    Tenta quebrar em limites naturais (pontos, paragrafos).

    Args:
        text: Texto preprocessado
        max_chars: Tamanho maximo de cada chunk

    Returns:
        Lista de chunks
    """
    if len(text) <= max_chars:
        return [text]

    chunks = []
    current_chunk = ""

    # Divide por paragrafos primeiro
    paragraphs = text.split("\n\n")

    for para in paragraphs:
        if len(current_chunk) + len(para) + 2 <= max_chars:
            if current_chunk:
                current_chunk += "\n\n" + para
            else:
                current_chunk = para
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())

            # Se paragrafo e maior que max_chars, divide por sentencas
            if len(para) > max_chars:
                sentences = re.split(r"(?<=[.!?])\s+", para)
                current_chunk = ""
                for sentence in sentences:
                    if len(current_chunk) + len(sentence) + 1 <= max_chars:
                        if current_chunk:
                            current_chunk += " " + sentence
                        else:
                            current_chunk = sentence
                    else:
                        if current_chunk:
                            chunks.append(current_chunk.strip())
                        current_chunk = sentence
            else:
                current_chunk = para

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks
