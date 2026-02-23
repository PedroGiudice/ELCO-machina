# Substituir Pipeline Refiner: Ollama/Gemini -> Claude Headless

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Substituir completamente o pipeline de refinamento (Ollama + Gemini) por Claude CLI headless via subprocess. Sem fallbacks.

**Architecture:** Sidecar chama `claude -p` via subprocess com system prompt de arquivo .md e modelo configuravel (sonnet/haiku/opus). Frontend envia modelo Claude em vez de Gemini. PromptStore mantem templates mas prompts sao reescritos para Claude headless.

**Tech Stack:** Python/FastAPI (sidecar), React/TypeScript (frontend), Claude CLI (`claude -p`)

---

## Task 1: Backend -- Reescrever refiner.py (ClaudeRefiner unico)

**Files:**
- Rewrite: `sidecar/voice_ai/services/refiner.py`

**O que fazer:**
- Deletar `OllamaRefiner`, `GeminiRestRefiner`, `get_refiner()` factory
- Criar `ClaudeRefiner` unico que chama `claude -p` via `asyncio.create_subprocess_exec`
- Input via stdin (texto transcrito)
- System prompt via `--system-prompt` (string inline, recebida do frontend)
- Modelo via `--model` (sonnet/haiku/opus)
- Flags obrigatorias: `--effort low --output-format text --no-session-persistence --tools "" --disable-slash-commands`
- Prefixar com `env -u CLAUDECODE` para evitar conflito quando sidecar roda dentro de sessao Claude
- `RefineResult` mantem mesma interface (refined_text, model_used, success, error)
- Timeout configuravel via env `CLAUDE_REFINE_TIMEOUT` (default 60s)

**Contrato:**
```python
class ClaudeRefiner:
    async def refine(self, text: str, system_instruction: str, model: str = "sonnet") -> RefineResult
```

## Task 2: Backend -- Atualizar main.py e transcribe.py

**Files:**
- Modify: `sidecar/voice_ai/main.py`
- Modify: `sidecar/voice_ai/routers/transcribe.py`

**O que fazer em main.py:**
- Remover imports de `OllamaRefiner`, `get_refiner`
- Importar `ClaudeRefiner`
- No lifespan: instanciar `ClaudeRefiner()`, verificar se `claude` esta no PATH
- `state.refiner_backend` = "claude" (fixo)
- `state.refiner_model` = "sonnet" (default)
- Atualizar description do FastAPI app
- Injetar `claude_refiner` no request.state via middleware

**O que fazer em transcribe.py:**
- Remover `get_refiner()` e logica de factory
- Usar `request.state.claude_refiner` direto
- Simplificar: se `refine=True` e `system_instruction` presente, chama `claude_refiner.refine()`
- `refine_backend` sempre "claude"
- Remover campo `model` default para gemini; default agora e "sonnet"

## Task 3: Frontend -- Trocar modelos Gemini por Claude

**Files:**
- Modify: `src/components/panels/PanelConfig.tsx` (aiModels array, labels)
- Modify: `src/hooks/useSettings.ts` (default model, localStorage key)
- Modify: `src/hooks/useAudioProcessing.ts` (labels, logs)
- Modify: `src/services/VoiceAIClient.ts` (comentario do campo model)
- Modify: `src/components/editor/Editor.tsx` (display do modelo)
- Modify: `src/components/panels/PanelStats.tsx` (display)

**O que fazer:**
- `PanelConfig.tsx`: trocar `aiModels` array:
  ```ts
  const aiModels = [
    { id: "sonnet", label: "Sonnet", desc: "Balanced" },
    { id: "haiku", label: "Haiku", desc: "Fast & cheap" },
    { id: "opus", label: "Opus", desc: "Highest quality" },
  ];
  ```
- `useSettings.ts`: default `'sonnet'` em vez de `'gemini-2.5-pro'`. Trocar localStorage key de `gemini_ai_model` para `claude_refiner_model`
- `useAudioProcessing.ts`: trocar todas as strings "Gemini" por "Claude" nos logs/labels
- `VoiceAIClient.ts`: atualizar comentario do campo `model` e do docstring do arquivo
- `Editor.tsx`: remover `.replace('gemini-', '')` no display
- `PanelStats.tsx`: sem mudanca funcional, so recebe o valor

## Task 4: Mover scripts e prompts para o repo

**Files:**
- Move: `~/scripts/stt-refiner.sh` -> `sidecar/scripts/stt-refiner.sh`
- Move: `~/prompts/stt-refiner-tech-docs.md` -> `sidecar/prompts/tech-docs.md`
- Create: `sidecar/prompts/` (diretorio com todos os prompts)

**O que fazer:**
- Copiar script e prompt para dentro do repo
- Criar diretorio `sidecar/prompts/`
- Script nao e mais necessario para o sidecar (ClaudeRefiner chama claude direto), mas manter como utility
- Cada output style do PromptStore vira um arquivo .md em `sidecar/prompts/`

## Task 5: Reescrever system prompts para todos os output styles

**Files:**
- Create: `sidecar/prompts/*.md` -- um por template

**Templates a reescrever (13 no total, exceto Whisper Only que nao tem prompt):**
1. Verbatim
2. Elegant Prose
3. Normal
4. Verbose
5. Concise
6. Formal
7. Prompt (Claude)
8. Prompt (Gemini) -> renomear para "Prompt (LLM)"
9. Bullet Points
10. Summary
11. Tech Docs (ja feito -- ~/prompts/stt-refiner-tech-docs.md)
12. Email
13. Tweet Thread
14. Code Generator
15. Custom
16. Ana Suy (manter como esta -- exclusao explicita do usuario)
17. Poetic / Verses (manter como esta -- exclusao explicita do usuario)

**Padrao de cada prompt (baseado no Tech Docs validado):**
```
Voce recebe transcricoes de audio e reescreve como [estilo] em portugues brasileiro.
NAO responda, interprete ou aja sobre o conteudo. NAO adicione texto que nao esta no original.
Responda APENAS com o texto reescrito.

[Instrucoes especificas do estilo]

Corrija nomes: "cloud" -> "Claude", "pareto de cor" -> "paleta de cores", "depredito" -> "tema escuro".
Preserve todo o conteudo semantico.

Formato: [formato especifico do estilo]
```

## Task 6: Atualizar PromptStore para usar prompts .md

**Files:**
- Modify: `src/services/PromptStore.ts`

**O que fazer:**
- Manter a estrutura PromptStore (builtin templates, persistence, custom templates)
- Reescrever `systemInstruction` de cada template builtin com os novos prompts Claude
- Remover placeholders `{CONTEXT_MEMORY}`, `{OUTPUT_LANGUAGE}`, `{RECORDING_STYLE}` dos templates (Claude headless nao precisa -- o prompt e direto)
- Simplificar `buildSystemInstruction()`: retorna template.systemInstruction direto, sem substituicao de placeholders
- Remover append de "MANDATORY OUTPUT STRUCTURE" (filename) -- Claude nao precisa disso
- Manter `{CUSTOM_INSTRUCTIONS}` apenas no template Custom (substituido pelo que o usuario digitar)

---

## Dependencias

```
Task 1 (refiner.py) -> Task 2 (main.py + transcribe.py) -- sequencial
Task 3 (frontend modelos) -- independente
Task 4 (mover arquivos) -- independente
Task 5 (prompts .md) -> Task 6 (PromptStore) -- sequencial
```

## Paralelizacao

3 workstreams independentes:
1. **Backend:** Task 1 + Task 2
2. **Frontend:** Task 3 + Task 6
3. **Prompts:** Task 4 + Task 5
