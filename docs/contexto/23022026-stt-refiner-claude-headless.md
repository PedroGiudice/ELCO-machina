# Contexto: STT Pipeline Final + Refiner Claude Headless

**Data:** 2026-02-23
**Sessao:** main (ELCO-machina)
**Duracao:** ~2h

---

## O que foi feito

### 1. Decisao final do pipeline STT

Benchmark exaustivo whisper.cpp CPU (Contabo 8 vCPUs, 23GB RAM). Resultados:

| Aspecto | Decisao | Motivo |
|---------|---------|--------|
| Engine | whisper.cpp CLI (subprocess) | Server 2x mais lento (RTF 0.716 vs 0.346) |
| Modelo rapido | small (q5_1), 190 MB | RTF ~0.44, bom custo-beneficio |
| Modelo preciso | large-v3-turbo (q5_0), 574 MB | RTF ~1.30, maior qualidade |
| Prompt Whisper | Nenhum (sem --prompt) | +37% latencia, perda de conteudo em niveis 2-3 |
| VAD | Desabilitado | So agressivo ajuda, mas quebra termos |
| Selecao | Usuario escolhe modelo no app | Dropdown no frontend |

### 2. Refiner migrado de Ollama para Claude headless

**Problema:** qwen2.5:3b (Ollama local) produzia output ruim -- ratio 0.31 (perdia 69% do conteudo), nao corrigia nomes ("Cloud" em vez de "Claude"), nao removia todos os marcadores orais.

**Solucao:** Script `~/scripts/stt-refiner.sh` que chama `claude -p` em modo headless:

```bash
env -u CLAUDECODE claude -p "$INPUT" \
  --system-prompt "$SYSTEM" \
  --model "$MODEL" \
  --effort low \
  --output-format text \
  --no-session-persistence \
  --tools "" \
  --disable-slash-commands
```

Flags criticas:
- `--tools ""` -- zero tools, impede o modelo de "agir" sobre o conteudo
- `--disable-slash-commands` -- sem skills/commands
- `env -u CLAUDECODE` -- necessario quando chamado de dentro de outra sessao Claude (Jupyter kernel herda a variavel)
- `--effort low` -- sem thinking, rapido e barato

**Resultado com sonnet low-effort:**

| Metrica | qwen2.5:3b | Sonnet low |
|---------|------------|------------|
| Latencia | 48s | 17-26s |
| Ratio | 0.31 | 0.76-0.79 |
| Correcoes | falhou | 100% |
| Conteudo | perdeu 69% | preservado |

### 3. System prompt do refiner

Arquivo: `~/prompts/stt-refiner-tech-docs.md`

Prompt final (apos ~6 iteracoes):
- Instrucao direta sem few-shot (sonnet nao precisa)
- Enfase em NAO responder/interpretar o conteudo
- Formato: paragrafo introdutorio + bullet points
- Correcoes de nomes hardcoded (cloud->Claude, pareto->paleta, depredito->tema escuro)

### 4. Notebook de benchmark atualizado

`~/notebooks/stt_testbench_cpu.ipynb` -- celula refiner agora chama o script via subprocess em vez de Ollama.

### 5. Ollama roda na Contabo (nao mais na OCI)

VM OCI esta offline ha 8h+. Ollama foi migrado para a Contabo em sessao anterior. Modelos disponiveis: qwen2.5:3b, bge-m3.

## Estado dos arquivos

| Arquivo | Repo | Status |
|---------|------|--------|
| `~/scripts/stt-refiner.sh` | Avulso | Criado -- script refiner Claude headless |
| `~/prompts/stt-refiner-tech-docs.md` | Avulso | Criado -- system prompt do refiner Tech Docs |
| `~/notebooks/stt_testbench_cpu.ipynb` | Avulso | Modificado -- celula refiner usa script |
| `ELCO-machina/docs/contexto/23022026-*` | ELCO-machina | Commitado |
| `ELCO-machina/docs/plans/2026-02-23-*` | ELCO-machina | Commitado |
| `ELCO-machina/docs/prompts/23022026-*` | ELCO-machina | Commitado |

**Nota:** script, prompt e notebook estao fora do repo ELCO-machina (em ~/). Decisao pendente sobre onde viver.

## Commits desta sessao

```
3b0cf811 docs(stt): decisao final STT pipeline + refiner Claude headless
```

## Decisoes tomadas

- **CLI > Server Whisper:** server adiciona overhead HTTP + load permanente
- **Claude headless > Ollama 3B:** qualidade incomparavel, latencia menor
- **Sonnet low-effort:** melhor custo-beneficio; haiku interpretava texto como pedido (antes do prompt final)
- **Zero tools no refiner:** `--tools ""` impede o modelo de fazer loucuras
- **Script por template:** cada output style do PromptStore vira um script/prompt separado
- **Modelo configuravel no app:** sidecar recebe modelo como parametro do frontend

## Pendencias

1. **Integrar refiner Claude no sidecar** (alta) -- sidecar hoje chama Ollama via HTTP; precisa chamar `stt-refiner.sh` via subprocess
2. **Frontend: dropdown de modelo** (alta) -- usuario escolhe entre sonnet/haiku/opus no app
3. **Reescrever todos os output styles** (media) -- 13 templates do PromptStore precisam de system prompts otimizados; exceto Ana Suy/Poetic
4. **Decidir onde moram scripts/prompts** (media) -- ~/scripts e ~/prompts ou dentro do ELCO-machina
5. **Considerar agent team** (media) -- implementacao no app e pauleira (sidecar + frontend + prompt store), parallelizar com worktrees
6. **Push do commit** (baixa) -- 1 commit ahead de origin/main
