#!/usr/bin/env bash
# STT Refiner via Claude Code headless
# Uso: ./stt-refiner.sh <arquivo_texto> [prompt] [modelo]
# Ou:  echo "texto" | ./stt-refiner.sh - [prompt] [modelo]

set -euo pipefail

PROMPT_FILE="${2:-/home/opc/prompts/stt-refiner-tech-docs.md}"
MODEL="${3:-sonnet}"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERRO: Prompt nao encontrado: $PROMPT_FILE" >&2
  exit 1
fi

# Ler input de arquivo ou stdin
if [[ "${1:-}" == "-" ]] || [[ -z "${1:-}" ]]; then
  INPUT=$(cat)
else
  INPUT=$(cat "$1")
fi

if [[ -z "$INPUT" ]]; then
  echo "ERRO: Input vazio" >&2
  exit 1
fi

SYSTEM=$(cat "$PROMPT_FILE")

env -u CLAUDECODE claude -p "$INPUT" \
  --system-prompt "$SYSTEM" \
  --model "$MODEL" \
  --effort low \
  --output-format text \
  --no-session-persistence \
  --tools "" \
  --disable-slash-commands
