# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**PORTUGUÊS BRASILEIRO COM ACENTUAÇÃO CORRETA.** Usar "eh" em vez de "é" é inaceitável. Acentos são obrigatórios: é, á, ã, ç, etc.

**Arquitetura:** `ARCHITECTURE.md` (North Star)

---

## Regras Críticas

### 1. Git Workflow

```bash
# Início de sessão: SEMPRE criar branch nova
git checkout -b feature/nome-descritivo

# Durante trabalho: commits frequentes
git add . && git commit -m "descrição"

# Fim: PR para main quando código estiver pronto
# Nunca commitar direto na main
```

### 2. Package Manager

```bash
npm install          # Instalar deps
npm run dev          # Dev server (porta 3000)
npm run build        # Build produção
```

### 3. Ambiente

Criar `.env.local` na raiz:
```
GEMINI_API_KEY=sua_api_key
```

### 4. ZERO Emojis

**PROIBIDO** usar emojis em qualquer output: respostas, código, commits, comentários.

### 5. Commits Frequentes

Commitar após cada mudança lógica completa. Protege contra perda de trabalho.

---

## Erros Aprendidos

**INSTRUÇÃO PARA CLAUDE:** Adicione uma entrada aqui quando:
- O usuário corrigir um erro seu
- Você cometer erro grosseiro (syntax error, import errado)
- Um erro acontecer mais de uma vez

| Data | Erro | Regra |
|------|------|-------|
| | | |

<!--
Formato para adicionar:
| YYYY-MM-DD | Descrição breve do erro | O que evitar/fazer diferente |
-->

---

## Estrutura

```
/
├── App.tsx              # Componente principal (monolítico)
├── index.tsx            # Entry point
├── index.html           # Template + CDN
├── vite.config.ts       # Config build
├── package.json         # Deps
├── .env.local           # API key (não commitado)
├── ARCHITECTURE.md      # Arquitetura técnica
└── .claude/
    └── settings.local.json
```

---

## Debugging

Técnica dos 5 Porquês para bugs não-triviais:

1. **Sintoma** → O que está acontecendo?
2. **Por quê?** → Causa imediata
3. **Por quê?** → Causa anterior
4. **Por quê?** → Causa mais profunda
5. **CAUSA RAIZ** → Problema real a resolver

---

## Hooks

Atualmente não há hooks configurados. Para adicionar:

```
.claude/
├── hooks/
│   ├── pre-commit.sh
│   └── post-edit.sh
└── settings.local.json
```

Validar após mudanças:
```bash
tail -50 ~/.vibe-log/hooks.log
```

---

## Subagentes

Atualmente não há subagentes configurados. Para adicionar:

```
.claude/
├── agents/
│   └── nome-agente.md
└── settings.local.json
```

Subagentes são descobertos no início da sessão. Novo subagente? Reinicie a sessão.

---

## Arquitetura Resumida

| Módulo | Responsabilidade |
|--------|------------------|
| Audio Engine | Captura, análise (RMS/pitch/SNR), export WAV/WebM |
| Gemini Client | Transcrição com múltiplos estilos de output |
| Persistence | IndexedDB (audio), localStorage (config) |

Ver `ARCHITECTURE.md` para detalhes completos.
