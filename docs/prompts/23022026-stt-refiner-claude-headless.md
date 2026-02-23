# Retomada: Integrar Refiner Claude Headless no ELCO-machina

## Contexto rapido

O pipeline STT do ELCO-machina foi finalizado: Whisper CLI (subprocess) para transcricao, Claude headless (sonnet, low effort) para refinamento. O refiner funciona via script `~/scripts/stt-refiner.sh` que chama `claude -p` com zero tools e system prompt de `~/prompts/stt-refiner-tech-docs.md`. Testado no notebook com resultado excelente: ratio 0.76, todas as correcoes de nomes aplicadas, zero alucinacao, 17-26s de latencia.

A proxima sessao precisa integrar isso no app (sidecar Python + frontend React/Tauri). Sao mudancas em multiplas camadas -- considerar fortemente agent team com worktrees para paralelizar sidecar, frontend e prompts.

## Arquivos principais

- `~/scripts/stt-refiner.sh` -- script refiner (aceita: input, prompt_file, model)
- `~/prompts/stt-refiner-tech-docs.md` -- system prompt do Tech Docs (validado)
- `~/notebooks/stt_testbench_cpu.ipynb` -- notebook de benchmark (celula refiner usa o script)
- `ELCO-machina/sidecar/` -- backend Python (hoje chama Ollama, precisa chamar script)
- `ELCO-machina/src/services/PromptStore.ts` -- 17 templates builtin, `buildSystemInstruction()` injeta placeholders
- `ELCO-machina/src/services/VoiceAIClient.ts` -- client que envia `system_instruction` ao sidecar
- `ELCO-machina/docs/contexto/23022026-stt-refiner-claude-headless.md` -- contexto detalhado

## Arquitetura alvo

```
Frontend (React/Tauri)
  |-- Dropdown: modelo (sonnet/haiku/opus)
  |-- Dropdown: output style (templates do PromptStore)
  |-- Slider: temperatura (futuro, baixa prioridade)
  |
  v
VoiceAIClient.ts
  |-- POST /transcribe { audio, model_stt, refiner_model, system_instruction }
  |
  v
Sidecar (Python/FastAPI)
  |-- Whisper CLI (subprocess) -> transcricao bruta
  |-- stt-refiner.sh (subprocess) -> texto refinado
  |     args: stdin=texto, prompt_file, model
  |
  v
Claude CLI headless
  |-- --system-prompt (do arquivo .md)
  |-- --model (sonnet/haiku/opus)
  |-- --effort low --tools "" --disable-slash-commands
```

## Proximos passos (por prioridade)

### 1. Integrar refiner no sidecar Python
**Onde:** `ELCO-machina/sidecar/` -- endpoint `/transcribe` ou `/refine`
**O que:** Substituir chamada Ollama por `subprocess.run([stt-refiner.sh, "-", prompt_path, model], input=texto)`. O script aceita 3 args: input (- para stdin), prompt_file, model.
**Por que:** Refiner atual (Ollama qwen2.5:3b) produz output inutilizavel.
**Verificar:** `echo "texto teste" | ~/scripts/stt-refiner.sh -` retorna texto limpo.

### 2. Frontend: adicionar dropdown de modelo refiner
**Onde:** `ELCO-machina/App.tsx` e componentes de settings
**O que:** Dropdown com opcoes: sonnet (default), haiku, opus. Valor enviado ao sidecar como parametro.
**Por que:** Usuario precisa controlar custo vs qualidade do refinamento.
**Verificar:** Dropdown renderiza e valor chega ao VoiceAIClient.

### 3. Adaptar PromptStore para Claude headless
**Onde:** `ELCO-machina/src/services/PromptStore.ts`
**O que:** Os templates hoje usam placeholders `{CONTEXT_MEMORY}`, `{OUTPUT_LANGUAGE}` etc. Para o Claude headless, os prompts vao como arquivos .md puros (sem placeholders). Opcoes: (A) manter prompts no PromptStore e substituir placeholders antes de enviar, (B) mover prompts para arquivos .md e o sidecar le direto. Decisao da sessao anterior: notebook dita configs, app adapta.
**Por que:** `buildSystemInstruction()` injeta contexto e filename -- avaliar se isso faz sentido com Claude headless.
**Verificar:** Output do refiner segue o formato esperado por cada template.

### 4. Reescrever system prompts dos output styles
**Onde:** `~/prompts/` -- um arquivo .md por style
**O que:** Criar prompts otimizados para os 13 templates (exceto Ana Suy/Poetic/Whisper Only). Tech Docs ja esta feito e validado -- usar como referencia.
**Por que:** Prompts atuais do PromptStore foram escritos para LLMs genericos; Claude headless com `--effort low` precisa de instrucoes diretas.
**Verificar:** Testar cada prompt com `~/scripts/stt-refiner.sh /tmp/refiner_input.txt ~/prompts/<style>.md`

### 5. Mover scripts e prompts para o repo
**Onde:** Decidir: `ELCO-machina/scripts/` e `ELCO-machina/prompts/` ou manter em ~/
**O que:** Mover ou fazer symlinks para versionamento.
**Por que:** Hoje estao avulsos em ~/ sem git.

## Consideracoes para agent team

Esta implementacao toca 3 camadas independentes que podem ser paralelizadas:

| Agente | Escopo | Worktree |
|--------|--------|----------|
| backend-developer | Sidecar: endpoint refiner, subprocess call | Sim |
| frontend-developer | React: dropdown modelo, integracao VoiceAIClient | Sim |
| ai-ml-engineer | System prompts: reescrever 13 templates, testar cada um | Nao (arquivos avulsos) |

Dependencia: sidecar precisa estar pronto antes do frontend poder testar end-to-end. Prompts sao independentes.

## Como verificar

```bash
# Script funciona
echo "Entao basicamente a gente tem um Redis na frente do banco ne" | ~/scripts/stt-refiner.sh -

# Prompt existe
cat ~/prompts/stt-refiner-tech-docs.md

# Sidecar roda
cd ~/ELCO-machina/sidecar && python -m uvicorn main:app --port 8100

# Notebook funciona (Jupyter deve estar rodando)
# Rodar celulas: setup -> STT -> refiner

# Ollama local (fallback)
curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; print([m['name'] for m in json.load(sys.stdin)['models']])"
```
