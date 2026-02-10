# Contexto: Varredura Diagnóstica Completa do Codebase

**Data:** 2026-02-08
**Sessão:** feature/issue-fixes-and-feedback
**Duração:** ~2h

---

## O que foi feito

### 1. Varredura completa do codebase (diagnóstico, sem correções)

Leitura sistemática de TODOS os arquivos fonte do projeto para levantar problemas. O objetivo era exclusivamente **identificar** -- zero correções aplicadas. Foram catalogados 30+ problemas em 9 categorias.

### 2. Correções de tese (feedback do usuário)

A análise inicial continha dois erros conceituais graves que o usuário corrigiu:

**Erro 1 -- Causa do app não abrir:**
- Minha tese: auth hardcoded (MCBS/PGR) bloqueava o app
- Realidade: O app **abre**, mas renderiza apenas fundo preto. É um problema de renderização frontend (provavelmente fonts HTTPS via CDN fontshare, ou erro JS no boot)

**Erro 2 -- Papel do Gemini:**
- Minha tese: Gemini era uma alternativa "cloud" para STT
- Realidade: Gemini é o **editor/refinador de texto** -- o diferencial do produto. Pipeline correto:
  ```
  Áudio -> Whisper STT (VM, modelo medium) -> texto bruto -> Gemini API (text-only refinement) -> output estilizado
  ```
  Os estilos de output (Elegant Prose, Prompt Claude, Ana Suy, etc.) são aplicados pelo Gemini sobre o texto bruto do Whisper. Sem Gemini, o app é "apenas um transcritor".

### 3. Modelo Whisper confirmado

- **Modelo:** `medium` (default em `sidecar/voice_ai/services/stt_service.py` linha 47)
- **Tipo:** faster-whisper (CTranslate2)
- **Runtime:** CPU com int8 (auto-detect)
- **Infraestrutura:** VM Oracle (46GB RAM, 12 cores), acessada via Tailscale
- **`initial_prompt`:** NÃO utilizado atualmente na chamada `transcribe()` (linhas 251-260). faster-whisper suporta esse parâmetro para glossário/hotwords

---

## Diagnóstico Completo (Dados Brutos)

### Críticos (C01-C04)

| ID | Problema | Arquivo | Linhas |
|----|----------|---------|--------|
| C01 | Auth hardcoded (MCBS/PGR + "Chicago00@") | App.tsx | 749-753 |
| C02 | ButtonProps não expõe onClick/className (28 erros TS) | Button.tsx | interface |
| C03 | StoreOptions incompatível (campo `defaults`) | PanelConfig.tsx | imports |
| C04 | CDN importmap (aistudiocdn.com) conflita com Vite | index.html | importmap |

### Arquiteturais (A01-A06)

| ID | Problema | Detalhes |
|----|----------|----------|
| A01 | App.tsx monolítico (~3574 linhas, ~60 useState) | Todo inline, hooks extraídos mas NÃO usados |
| A02 | useAudioProcessing.ts (617 linhas) -- dead code | Extraído, nunca importado por App.tsx |
| A03 | useAudioRecording.ts (436 linhas) -- dead code | Idem |
| A04 | useTTS.ts (331 linhas) -- dead code | Idem |
| A05 | safeFetch definido 3x (App.tsx, VoiceAIClient.ts, useTTS.ts) | Risco de recursão infinita com override de fetch global |
| A06 | Settings modal duplicado (~1000 linhas em App.tsx) | Duplica PanelConfig.tsx |

### Lógica (L01-L07)

| ID | Problema | Arquivo | Detalhes |
|----|----------|---------|----------|
| L01 | `sidecar_status()` sempre retorna `Ok(true)` | lib.rs:131 | Stub, nunca consulta sidecar real |
| L02 | Health check com timing race | App.tsx | setState síncrono + timeout |
| L03 | `addLog()` ordena incorretamente | App.tsx | Usa unshift mas ID não é único |
| L04 | Dead code paths para "Cloud STT" | App.tsx | Código morto, cloud STT não existe |
| L05 | Filename injection (dados do usuário no path) | useAudioProcessing.ts:379-386 | Sem sanitização |
| L06 | `process.env.NODE_ENV` em runtime Tauri | App.tsx | Undefined em Tauri |
| L07 | `canSpeak={true}` hardcoded | App.tsx:2514 | Ignora estado real do TTS |

### TTS (T01-T02)

| ID | Problema | Detalhes |
|----|----------|---------|
| T01 | Endpoint `/synthesize` não verificado no VoiceAIClient | Só tem `/health` e `/transcribe` |
| T02 | useTTS.ts é dead code | Nunca importado |

### Gravação (R01-R03)

| ID | Problema | Arquivo | Detalhes |
|----|----------|---------|----------|
| R01 | Dois sistemas de gravação coexistem | App.tsx + audio.rs | CPAL Rust + Web API, sem coerência |
| R02 | `unsafe impl Send/Sync` para SafeStream | audio.rs | Necessário mas arriscado |
| R03 | `.ok()` silenciando erros de write_sample | audio.rs:263 | Perde erros de áudio |

### Segurança (SEC01-SEC03)

| ID | Problema | Detalhes |
|----|----------|---------|
| SEC01 | Credenciais hardcoded (MCBS/PGR) | App.tsx:749-753 |
| SEC02 | API key Gemini em localStorage | Visível em devtools |
| SEC03 | CSP null em tauri.conf.json | Sem proteção contra XSS |

### Tela Preta (Hipóteses -- NÃO confirmadas)

O app abre mas mostra apenas fundo preto no desktop Linux do usuário. Hipóteses:

1. **Fonts HTTPS via CDN fontshare** -- AppImage pode não ter certificados SSL adequados, fonts não carregam, layout quebra
2. **Importmap CDN conflita com Vite** -- `aistudiocdn.com` importmap no index.html pode causar erro antes do React montar
3. **Erro JS silencioso no boot** -- `safeFetch` override pode quebrar antes do React render
4. **WebKitGTK versão incompatível** -- Dell Vostro com Ubuntu pode ter versão diferente da VM Oracle Linux

Diagnóstico requer: dev mode (`bun run tauri dev`) no PC do usuário ou acesso aos logs da webview.

---

## Estado dos arquivos (mudanças na sessão)

Nenhum arquivo foi modificado nesta sessão. Todo o trabalho foi de **análise**.

Mudanças pendentes no working tree (de sessões anteriores):

| Arquivo | Status |
|---------|--------|
| `CLAUDE.md` | Modificado - erros aprendidos adicionais |
| `bun.lock` | Modificado - deps atualizadas |
| `src-tauri/Cargo.lock` | Modificado - deps Rust |
| `src-tauri/Cargo.toml` | Modificado - nova dep |
| `src-tauri/src/lib.rs` | Modificado - ajuste plugins |
| `src/components/panels/PanelConfig.tsx` | Modificado - refatoração parcial |
| `src/hooks/useAudioProcessing.ts` | Modificado - refatoração parcial |
| `docs/plans/refactor-app-monolith.md` | Não rastreado - plano de refatoração |
| `docs/prompts/fix-stt-tts.md` | Não rastreado - prompt sessão anterior |

## Commits desta sessão

Nenhum commit foi feito. Sessão exclusivamente diagnóstica.

## Pendências identificadas

1. **Tela preta no desktop** -- Prioridade MÁXIMA. App não renderiza no PC do usuário. Precisa de diagnóstico com dev mode ou MCP-tauri
2. **Whisper initial_prompt/hotwords** -- Prioridade ALTA. Usuário quer glossário para correções ("Cloud" -> "Claude Code"). faster-whisper suporta, mas não está implementado
3. **App.tsx monolítico** -- Prioridade ALTA. Plano de refatoração existe em `docs/plans/refactor-app-monolith.md` mas não foi executado
4. **TTS não funcional** -- Prioridade ALTA. Endpoint `/synthesize` existe no sidecar mas VoiceAIClient não o expõe
5. **28 erros TypeScript** -- Prioridade MÉDIA. Maioria causada por ButtonProps
6. **Dead code (hooks extraídos)** -- Prioridade MÉDIA. 1384 linhas de código morto nos hooks + duplicação inline
7. **safeFetch x3** -- Prioridade MÉDIA. Risco de recursão infinita
8. **Auth hardcoded** -- Prioridade BAIXA (funcional, mas inseguro)

## Decisões tomadas

- **Não corrigir nada** -- sessão de diagnóstico puro, conforme instrução do usuário
- **Corrigir entendimento da arquitetura** -- Gemini é editor de texto, não STT cloud
- **Confirmar modelo Whisper** -- medium, com suporte a initial_prompt não implementado
