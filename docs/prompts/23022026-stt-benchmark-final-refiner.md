# Retomada: STT Benchmark Final + Refiner Prompt

## Contexto rapido

O pipeline STT do ELCO-machina foi benchmarkado exaustivamente em CPU (Contabo, 8 vCPUs, 23GB RAM). Decisao final: whisper.cpp CLI com small (q5_1) para velocidade e large-v3-turbo (q5_0) para precisao, sem prompt e sem VAD. O refiner Ollama (qwen2.5:3b) recebeu um prompt novo externalizado em arquivo (`~/prompts/stt-refiner-tech-docs.md`), mas ainda nao foi testado com o prompt novo -- o kernel reiniciou antes do teste.

O notebook (`~/notebooks/stt_testbench_cpu.ipynb`) esta limpo com 4 celulas self-contained e persistencia de resultados em JSON. O prompt do refiner agora e carregado de arquivo externo, preparado para ser configuravel no app.

## Arquivos principais

- `~/notebooks/stt_testbench_cpu.ipynb` -- notebook de benchmark, 4 celulas (setup, stt, refiner, summary)
- `~/prompts/stt-refiner-tech-docs.md` -- system prompt do refiner (carregado em runtime)
- `~/.claude/docs/comparativ-STT-whisper` -- dados brutos de todos os benchmarks
- `ELCO-machina/docs/plans/2026-02-23-whisper-prompt-engineering.md` -- design do teste de prompt
- `ELCO-machina/docs/contexto/23022026-stt-benchmark-final-refiner.md` -- contexto detalhado

## Proximos passos (por prioridade)

### 1. Testar prompt novo do refiner
**Onde:** `~/notebooks/stt_testbench_cpu.ipynb`, celula "refiner"
**O que:** Rodar Setup -> STT -> Refiner em sequencia. A celula STT agora salva cache em `/tmp/stt_results.json`. A celula refiner carrega `~/prompts/stt-refiner-tech-docs.md` como system prompt.
**Por que:** O prompt antigo basicamente copiava o texto. O novo tem regras explicitas + few-shot.
**Verificar:** Output do refiner deve ter headers markdown, remocao de hesitacoes, e correcao de termos (pareto->paleta, cloud->Claude).

### 2. Iterar no prompt se necessario
**Onde:** `~/prompts/stt-refiner-tech-docs.md`
**O que:** Se o output ainda nao for bom, ajustar regras e exemplos. Considerar: mais few-shot, temperatura 0.5, ou testar com modelo 7B.
**Por que:** qwen2.5:3b e pequeno e pode nao seguir instrucoes complexas de reestruturacao.
**Verificar:** Comparar input vs output: deve ter headers, paragrafos logicos, sem hesitacoes, todo conteudo preservado.

### 3. Commit dos arquivos pendentes
**Onde:** `~/notebooks/`, `~/prompts/`, `ELCO-machina/docs/`
**O que:** Commitar notebook reescrito, prompt externo, docs de contexto e planos.
**Por que:** Nada desta sessao foi commitado.

### 4. Integrar config no app (futuro)
**Onde:** Frontend ELCO-machina (React/Tauri)
**O que:** Adicionar controles: dropdown de modelo STT (small/large-v3-turbo), dropdown de template refiner (arquivos .md em `/prompts/`), slider de temperatura (0.0-1.0).
**Por que:** Usuario quer controle fino do pipeline STT no app.

## Como verificar

```bash
# Notebook funciona
jupyter nbconvert --execute ~/notebooks/stt_testbench_cpu.ipynb --to html --stdout > /dev/null

# Prompt existe e nao esta vazio
wc -c ~/prompts/stt-refiner-tech-docs.md

# Ollama responde
curl -s http://127.0.0.1:11434/api/tags | jq '.models[].name'

# Cache STT (apos rodar notebook)
cat /tmp/stt_results.json | jq '.[].label'
```
