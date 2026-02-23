# Contexto: STT Benchmark Final + Refiner Prompt

**Data:** 2026-02-23
**Sessao:** main (ELCO-machina) + notebooks/
**Duracao:** ~3h (2 sessoes, segunda com compactacao)

---

## O que foi feito

### 1. Benchmark STT completo (whisper.cpp CPU)

Testados 4 modelos, 3 configs de prompt, 3 configs de VAD, CLI vs Server.
Resultados consolidados em `~/.claude/docs/comparativ-STT-whisper`.

Decisao final:
- **Engine:** whisper.cpp CLI (subprocess) -- server 2x mais lento (RTF 0.716 vs 0.346)
- **Modelo rapido:** small (q5_1) -- 190 MB, RTF ~0.44
- **Modelo preciso:** large-v3-turbo (q5_0) -- 574 MB, RTF ~1.30
- **Prompt:** nenhum (--prompt nao compensa: +37% latencia no nivel 1, perda de conteudo nos niveis 2-3)
- **VAD:** desabilitado (so ajuda agressivo, mas introduz erros)
- **Selecao:** usuario escolhe modelo no app

### 2. Notebook reescrito limpo

`~/notebooks/stt_testbench_cpu.ipynb` -- 4 celulas:
- setup (imports, helpers, paths, audio conversion)
- stt (transcricao CLI com tabela + grafico + cache JSON em `/tmp/stt_results.json`)
- refiner (Ollama qwen2.5:3b com prompt externo + fallback para cache)
- summary (tabela HTML com config final)

Celulas sao self-contained (imports proprios) e persistem resultados em disco.

### 3. Prompt do refiner externalizado e melhorado

Criado `~/prompts/stt-refiner-tech-docs.md` -- prompt externo carregado pelo notebook e futuro app.

Melhorias vs prompt anterior:
- Regras explicitas em pt-BR (7 regras concretas)
- Few-shot com exemplo real de entrada/saida
- Correcao de nomes tecnicos (cloud->Claude, pareto->paleta)
- Instrucoes para remover hesitacoes e marcadores orais

Temperatura subida de 0.3 para 0.4 (mais criatividade na reestruturacao).

### 4. Resultado do refiner (qwen2.5:3b com prompt antigo)

Ultimo run com prompt antigo: 58.7s, 155->162 palavras. Basicamente copiou o texto com mudancas cosmeticas. Prompt novo ainda nao foi testado (kernel reiniciou antes do teste).

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `~/notebooks/stt_testbench_cpu.ipynb` | Modificado -- reescrito com 4 celulas limpas + persistencia |
| `~/prompts/stt-refiner-tech-docs.md` | Criado -- prompt externo do refiner |
| `~/.claude/docs/comparativ-STT-whisper` | Modificado -- resultados de prompt eng, VAD, CLI vs server |
| `ELCO-machina/docs/plans/2026-02-23-whisper-prompt-engineering.md` | Criado (nao commitado) -- design do teste de prompt engineering |
| `ELCO-machina/docs/contexto/22022026-ollama-refiner-whisper-benchmark.md` | Modificado (nao commitado) |

## Pendencias identificadas

1. **Testar prompt novo do refiner** -- rodar celula refiner com o prompt de `~/prompts/stt-refiner-tech-docs.md`. O cache STT nao existe ainda em `/tmp/stt_results.json` (precisa rodar STT primeiro ou o cache sera criado)
2. **Commit dos arquivos** -- notebook, prompt, docs do ELCO-machina estao todos uncommitted
3. **Desabilitar whisper-server systemd** -- oferecido mas nao confirmado pelo usuario. CLI e a decisao final, servers nao sao necessarios
4. **Integrar config no app** -- o app deve oferecer: escolha de modelo (small/large), template de refiner (dropdown de arquivos .md), slider de temperatura
5. **Avaliar se qwen2.5:3b e suficiente** -- o prompt novo pode resolver, mas se continuar copiando texto, considerar modelo maior (7B) ou pipeline diferente

## Decisoes tomadas

- **CLI > Server:** server adiciona overhead HTTP + load permanente, CLI cold start e mais rapido mesmo com load de modelo
- **Sem prompt Whisper:** nivel 1 corrige termos mas custa +37%, niveis 2-3 perdem conteudo. Correcao fica com o refiner
- **Sem VAD:** so o agressivo ajuda, mas quebra termos. Audio continuo nao precisa de VAD
- **Prompt externo em arquivo:** permite iterar sem tocar codigo, app carrega do filesystem
- **Persistencia em JSON:** resultados STT salvos em `/tmp/stt_results.json` para sobreviver a reinicio de kernel
