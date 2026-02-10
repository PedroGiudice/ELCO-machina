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

### 2. Package Manager (BUN)

**SEMPRE usar BUN**, nunca npm.

```bash
bun install          # Instalar deps
bun run dev          # Dev server (porta 3000)
bun run build        # Build produção
bun run tauri dev    # Dev mode Tauri
bun run tauri build  # Build produção Tauri (~1-2 min)
```

**ATENÇÃO:** `bun run tauri build` demora 1-2 minutos. Se rodar em background, SEMPRE verificar o output file para confirmar que terminou antes de declarar conclusão.

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

## Gestao de Issues e Roadmap (Linear)

Issue tracking e roadmap via **Linear** (MCP: `mcp__linear__*`). Workspace: `cmr-auto`, Team: `Cmr-auto`, Project: `ELCO-machina`.

- **Registrar proativamente**: bugs identificados, ideias de features, decisoes tecnicas, divida tecnica
- **NAO registrar**: passos de execucao, tarefas mecanicas, coisas sendo feitas agora
- **Roadmap**: planos futuros viram **milestones** no project relevante; issues so quando for executar
- **Commits**: referenciar issue quando relevante: `fix(escopo): descricao (CMR-XX)`
- **PRs**: `Fixes CMR-XX` no body fecha issue automaticamente

Ver `~/.claude/rules/git-workflow.md` para detalhes completos.

---

## Erros Aprendidos

**INSTRUÇÃO PARA CLAUDE:** Adicione uma entrada aqui quando:
- O usuário corrigir um erro seu
- Você cometer erro grosseiro (syntax error, import errado)
- Um erro acontecer mais de uma vez

| Data | Erro | Regra |
|------|------|-------|
| 2026-01-20 | `enableEdgeToEdge()` no Android faz conteúdo ir atrás das barras do sistema | CSS `env(safe-area-inset-*)` não funciona no Android WebView. Remover `enableEdgeToEdge()` do MainActivity.kt |
| 2026-01-20 | API do Tauri plugin-store mudou de `LazyStore` para `load()` | Usar `import { load } from '@tauri-apps/plugin-store'` e `await load('file.json')` |
| 2026-02-04 | Declarar build concluído sem verificar se terminou | Builds Tauri demoram ~1-2 min. Se em background, LER o output file antes de declarar sucesso |
| 2026-02-04 | Build RPM desnecessário desperdiça ~5 min no bundling | Usuário roda Ubuntu. Só precisa do DEB. Não perder tempo esperando RPM. |
| 2026-02-04 | APK unsigned não instala no Android | Sempre buildar Android com `--debug` para assinatura automática: `bun run tauri android build --debug --target aarch64` |
| 2026-02-05 | `pkill -f "pro-att-machine"` não mata AppImage (nome errado) | AppImage roda com nome do arquivo: `pkill -f "Pro ATT Machine_0.2.0_amd64.AppImage"`. DEB instala como `pro-att-machine`. Sempre usar o nome correto do processo. |
| 2026-02-05 | Publicar update com mesma versão do app instalado (0.2.0 -> 0.2.0) | Auto-update só detecta versão SUPERIOR à instalada. Antes de build+publish, SEMPRE bumpar versão em `tauri.conf.json` e `package.json`. |
| 2026-02-05 | Tratar voice-ai-sidecar como componente local (empacotar no AppImage) | O sidecar RODA NA VM (46GB RAM, 12 cores), NUNCA no notebook do usuário. O objetivo da VM é justamente evitar dependência do hardware local. Whisper medium (1.5GB RAM, CPU intensivo) não deve rodar no notebook. A arquitetura é: app no notebook envia áudio via rede -> VM processa com Whisper -> devolve transcrição. NUNCA sugerir empacotar sidecar no AppImage ou rodar localmente. |
| 2026-02-05 | Declarar tarefa finalizada sem fazer build | NUNCA alegar conclusão sem rodar `bun run tauri build` e confirmar sucesso. Mesmo que a alteração pareça só backend/docs, o build valida tudo. Sem build = sem conclusão. |
| 2026-02-05 | Publicar build sem bumpar versão (0.2.6 repetida em vez de 0.2.7) | SEMPRE verificar a versão atual em `tauri.conf.json` e `package.json` E a última publicada em `latest.json` ANTES de buildar. Bumpar para a próxima sequencial. Manter histórico de versões na MEMORY.md. |
| 2026-02-07 | AppImage build falha com `failed to run linuxdeploy` | SEMPRE usar `NO_STRIP=1` antes de `bun run tauri build` no Oracle Linux. Sem isso, o `strip` do binário causa falha no linuxdeploy. Comando correto: `NO_STRIP=1 bun run tauri build --bundles appimage` |

<!--
Formato para adicionar:
| YYYY-MM-DD | Descrição breve do erro | O que evitar/fazer diferente |
-->

---

## Context Offloading (Gemini Bridge Plugin)

Plugin `gemini-bridge@opc-plugins` invoca Gemini CLI via MCP server para exploracao
e analise pesada de codigo. Preserva a janela de contexto do Claude.

- **Plugin:** `gemini-bridge@opc-plugins` (MCP server Python, zero deps)
- **Tool:** `mcp__gemini_bridge__explore` (modes: onboarding, targeted, verify, research)
- **Subagente:** `gemini-bridge-explorer` (restrito a apenas a tool acima)
- **Skill:** `gemini-bridge:delegation` (protocolo de delegacao)
- **Hook:** PreToolUse bloqueia Task(Explore) e redireciona para o plugin
- **Regras detalhadas:** `~/.claude/rules/gemini-offloading.md`

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

---

## Infraestrutura

### VM de Build (Oracle Cloud)

- **IP Público:** `137.131.201.119`
- **IP Tailscale:** `100.114.203.28`
- **Usuário:** `opc`
- **Diretório:** `/home/opc/ELCO-machina`

### Comandos para baixar builds

```bash
# Linux DEB
scp opc@137.131.201.119:"/home/opc/ELCO-machina/src-tauri/target/release/bundle/deb/Pro ATT Machine_0.1.0_amd64.deb" .

# Linux RPM
scp opc@137.131.201.119:"/home/opc/ELCO-machina/src-tauri/target/release/bundle/rpm/Pro ATT Machine-0.1.0-1.x86_64.rpm" .

# Android APK (unsigned)
scp opc@137.131.201.119:"/home/opc/ELCO-machina/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk" .
```

### Update Server (Auto-Update Desktop)

- **Nginx:** porta `8090`, config em `/etc/nginx/conf.d/updates.conf`
- **Root:** `/var/www/updates/`
- **URL base:** `http://100.114.203.28:8090/proatt/`
- **Manifesto:** `/var/www/updates/proatt/latest.json`

**Workflow de publicação (build + publish):**

```bash
# 1. Bumpar versão em tauri.conf.json e package.json
# 2. Build (NO_STRIP necessário no Oracle Linux)
NO_STRIP=1 bun run tauri build --bundles appimage

# 3. Copiar AppImage + assinatura para o update server
cp "src-tauri/target/release/bundle/appimage/Pro ATT Machine_X.Y.Z_amd64.AppImage" /var/www/updates/proatt/
cp "src-tauri/target/release/bundle/appimage/Pro ATT Machine_X.Y.Z_amd64.AppImage.sig" /var/www/updates/proatt/

# 4. Atualizar latest.json com versão, assinatura e URL
# (ver formato em /var/www/updates/proatt/latest.json)

# 5. Verificar publicação
curl -s http://100.114.203.28:8090/proatt/latest.json | python3 -m json.tool
```

**IMPORTANTE:**
- `NO_STRIP=1` é obrigatório -- sem isso, `linuxdeploy` falha no Oracle Linux
- Sempre bumpar versão ANTES do build (auto-update só detecta versão superior)
- O DEB é gerado automaticamente junto, mas não é publicado no update server

### Servidor HTTP temporário (alternativa)

Na VM:
```bash
cd /home/opc/ELCO-machina && python3 -m http.server 8080
```

No navegador: `http://137.131.201.119:8080`

**Nota:** O APK é unsigned. Para instalar no Android, habilite "Fontes desconhecidas" nas configurações.
