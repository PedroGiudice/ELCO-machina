# Design: Whisper Prompt Engineering

**Data:** 2026-02-23
**Objetivo:** Testar ate onde o `--prompt` do whisper.cpp melhora a qualidade do STT, potencialmente reduzindo o trabalho do refiner Ollama.

## Contexto

O pipeline atual: Whisper (STT) -> Ollama qwen2.5:3b (refiner). O refiner adiciona 22-44s de latencia e muda palavras indesejavelmente. O Whisper aceita `--prompt` que condiciona o decoder -- funciona como exemplo de estilo, nao como instrucao (nao e instruction-following).

Limites conhecidos:
- 224 tokens maximo (trunca silenciosamente)
- So afeta primeiros ~30s (sliding context nos segmentos seguintes)
- Pode amplificar alucinacao em silencios
- Tokenizacao whisper.cpp pode divergir do Whisper Python

## Design: 3 Niveis de Prompt

Cada nivel empilha sobre o anterior. Testar com small (q5_1) -- mais rapido, permite iteracao.

### Nivel 1 -- Gramatica + Vocabulario

Objetivo: transcricao fiel com pontuacao, capitalizacao e termos corretos.

```
Transcrição em português brasileiro com pontuação e capitalização corretas. Termos: Gemini AI Studio, Build Mode, ADK Agent, React, Claude Code, layout, paleta de cor, whisper.cpp, ELCO-machina.
```

Mecanismo: o decoder ve texto pontuado e tende a reproduzir o padrao. Termos especificos reduzem erros de spelling (pareto -> paleta).

### Nivel 2 -- Estruturado

Objetivo: paragrafos, titulos, organizacao. O mais delicado -- o Whisper nao foi treinado pra isso.

Formulacao como exemplo de estilo (nao instrucao):

```
Transcrição em português brasileiro com pontuação e capitalização corretas. Termos: Gemini AI Studio, Build Mode, ADK Agent, React, Claude Code, layout, paleta de cor, whisper.cpp, ELCO-machina.

## Contexto do Projeto
O projeto utiliza React com Build Mode do Gemini AI Studio.

## Requisitos Técnicos
A paleta de cor segue o padrão do Claude Code com fundo escuro.
```

Ao inves de instruir "separe em secoes", o prompt mostra como texto estruturado se parece. O decoder pode (ou nao) reproduzir headers markdown e separacao por topico.

Risco: alucinacao de headers/estrutura que nao existe no audio. Aceitar como experimento.

### Nivel 3 -- Interpretativo

Objetivo: transformar fala informal em documento tecnico. Vai alem de transcricao.

```
Transcrição em português brasileiro com pontuação e capitalização corretas. Termos: Gemini AI Studio, Build Mode, ADK Agent, React, Claude Code, layout, paleta de cor, whisper.cpp, ELCO-machina.

## Contexto do Projeto
O projeto utiliza React com Build Mode do Gemini AI Studio para gerar interfaces.

## Requisitos Técnicos
- Paleta de cor: padrão Claude Code, fundo escuro
- Framework: React (restrições do Build Mode aplicadas automaticamente)
- Estrutura de pastas: gerada pelo Build Mode, não customizável
```

Prompt mostra estilo de documento tecnico com bullet points, linguagem formal, e condensacao. Se o Whisper reproduzir esse estilo, o output sera "interpretado" em vez de transcrito literalmente.

Risco alto: o Whisper provavelmente ignora isso ou alucina. Mas queremos ver o limite.

## Benchmark

Uma celula no notebook `stt_testbench_cpu.ipynb`:
- Modelo: small (q5_1) -- RTF 0.44, o mais rapido
- Audio: mesmo audio-teste.wav (94s)
- 4 configs: sem prompt, nivel 1, nivel 2, nivel 3
- Output: textos lado a lado pra comparacao visual
- Sem metricas automaticas -- avaliacao humana

## Decisao Posterior

Baseado nos resultados:
- Se nivel 1 funciona: integrar `--prompt` no sidecar STT service
- Se nivel 2 funciona: pode substituir parte do refiner
- Se nivel 3 funciona: pode eliminar o refiner pra alguns templates
- Se nenhum funciona: manter pipeline atual, focar em melhorar o system prompt do refiner
