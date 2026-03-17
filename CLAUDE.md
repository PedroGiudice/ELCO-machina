# ELCO-machina (Pro ATT Machine)

<!-- Ultima revisao: 2026-03-17 -->

App desktop/mobile (Tauri 2.0) para transcricao de audio com voice cloning e refinamento via LLM.

## Design Doc (fonte de verdade)

**`ARCHITECTURE.md`** -- stack, componentes, plugins, ciclo de vida. Ler PRIMEIRO antes de qualquer implementacao.

## Stack

- Tauri 2.9.5 + React 19 + TypeScript 5.8 + Vite 6 + Tailwind CSS 3
- Sidecar: FastAPI (Whisper medium) na VM, porta 8765
- Modal: Whisper large-v3-turbo (STT), XTTS v2 (TTS), Chatterbox (TTS)
- Gemini: refinamento de transcricoes
- Package manager: **BUN** (nunca npm)

## Scripts Modal

| Script | Tipo | GPU | App Name |
|--------|------|-----|----------|
| `scripts/modal_whisper_bench.py` | bench/deploy | T4 | whisper-bench |
| `scripts/modal_xtts_bench.py` | bench | L4 | xtts-bench |
| `scripts/modal_xtts_serve.py` | deploy + endpoint HTTP | L4 | xtts-serve |
| `scripts/modal_f5tts_bench.py` | bench | - | f5tts-bench |
| `modal_functions/tts_chatterbox.py` | deploy + GPU snapshot | T4 | elco-tts |

**NUNCA executar `modal run` ou `modal deploy` diretamente.** O usuario executa no terminal e comunica outputs.

### Deps criticas (NAO mexer)

- `coqui-tts==0.26.0` + `transformers>=4.43.0,<4.50.0` (XTTS v2)
- API low-level obrigatoria: `Xtts.init_from_config()`, nunca `TTS.api.TTS()` (pede licenca interativa)
- Download via `huggingface_hub.snapshot_download("coqui/XTTS-v2")`

### Params XTTS v2 validados

| Param | Default | Limite |
|-------|---------|--------|
| temperature | 0.75 | >0.8 gera gibberish |
| top_k | 20 | - |
| top_p | 0.75 | - |
| repetition_penalty | 2.0 | - |
| speed | 1.0 | - |

## Sidecar Voice AI

Roda **EXCLUSIVAMENTE** na VM (62GB RAM, 16 vCPUs). NUNCA empacotar no AppImage ou rodar no notebook do usuario.
Arquitetura: notebook envia audio via Tailscale -> VM processa -> devolve transcricao.

- Porta: 8765
- Routers: transcribe, synthesize, refine
- Servico: systemd na VM

## Build

```bash
bun install          # Deps
bun run dev          # Dev (porta 3000)
bun run build        # Build producao
bun run tauri dev    # Dev Tauri
NO_STRIP=1 bun run tauri build --bundles appimage  # Build (NO_STRIP obrigatorio)
bun run tauri android build --debug --target aarch64  # Android (--debug para assinatura)
```

`bun run tauri build` demora 1-2min. NUNCA declarar conclusao sem verificar output.

## Auto-Update

- Nginx porta 8090: `/var/www/updates/proatt/latest.json`
- SEMPRE bumpar versao ANTES do build
- Script: `scripts/publish-update.sh`

## Erros Aprendidos

| Data | Erro | Regra |
|------|------|-------|
| 2026-01-20 | `enableEdgeToEdge()` no Android | Remover do MainActivity.kt. CSS safe-area nao funciona no Android WebView |
| 2026-01-20 | API Tauri store mudou | Usar `load()` de `@tauri-apps/plugin-store`, nao `LazyStore` |
| 2026-02-04 | Build declarado sem verificar | LER output antes de declarar sucesso |
| 2026-02-05 | Sidecar tratado como local | RODA NA VM. NUNCA empacotar no AppImage |
| 2026-02-05 | Version bump esquecido | Verificar versao atual + ultima publicada ANTES de buildar |
| 2026-02-07 | linuxdeploy falha | `NO_STRIP=1` obrigatorio no Oracle Linux |
| 2026-03-04 | ref_audio vs gen_text mismatch | Texto de teste DEVE corresponder ao audio de referencia |

## Gestao de Issues e Roadmap (Linear)

Ver `~/.claude/rules/linear-workflow.md`. Workspace: `cmr-auto`, Team: `Cmr-auto`, Project: `ELCO-machina`.

## Referencia

- `ARCHITECTURE.md` -- design doc completo
- `docs/contexto/04032026-tts-xtts-v2-benchmark.md` -- sessao benchmark XTTS
- `docs/prompts/04032026-tts-integracao-app.md` -- spec integracao TTS no app
- `docs/XTTS-deps-image.md` -- pesquisa deps minimas
- `docs/xtts_v2_reference.md` -- referencia tecnica XTTS v2

## Infraestrutura e Ambiente

Ver `~/.claude/rules/vm-tailscale.md` para maquinas, IPs, Tailscale.
Ver `~/.claude/rules/infrastructure.md` para Bun vs Node e MCP servers.

**Resumo:** voce roda na VM Contabo (`vmi3095613`). Todos os servicos rodam aqui.

## Workflow de Desenvolvimento

- Commits atomicos com mensagens descritivas (ver `~/.claude/rules/git-workflow.md`)
- TDD quando possivel, verificar ANTES de declarar sucesso (ver `~/.claude/rules/testing.md`)
- Nao over-engineer, preferir editar existentes, deletar codigo morto
- WebSearch e WebFetch -- usar ANTES de estimar recursos ou sizing

## Cognitive Memory (cogmem)

Ver `~/.claude/CLAUDE.md` secao cogmem. Busca hibrida: dense + sparse + RRF.
