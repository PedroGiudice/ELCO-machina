# Contexto: Diagnostico completo e catalogacao de issues no Linear

**Data:** 2026-02-10
**Sessao:** fix/safefetch-motion
**Duracao:** ~2h

---

## O que foi feito

### 1. Investigacao da causa raiz do freeze/OOM no PC do usuario

App v0.2.17 (pos-PR #7) causava OOM kill no PC (7.6GB RAM, Ubuntu 24.04). Investigacao via journalctl, MCP Tauri e memoria de sessoes revelou:

- **TLS chain quebrada** desde v0.2.0: libs bundled do Oracle Linux (`libgnutls.so.30`, `libp11-kit.so.0`) incompativeis com Ubuntu. Zero certificados TLS. HTTPS inoperante.
- **OOM kill** causado por motion/react + GlobalAppContext monolitico + hooks agressivos (PR #7). WebKitWebProcess: 87% CPU, 5.4GB RAM.
- **WAV recording silence**: CPAL captura zero samples no Ubuntu/PipeWire.

### 2. Fix manual de TLS no PC do usuario

Removidas libs incompativeis da extracao do AppImage:

```bash
rm squashfs-root/usr/lib/{libgnutls.so.30,libp11-kit.so.0,libcrypto.so.3}
rm squashfs-root/usr/lib64/gio/modules/libgiognutls.so
```

Resultado: app carregou (TLS resolvido), mas JS thread bloqueado por consumo excessivo de recursos.

### 3. Reconstrucao da timeline completa de versoes

| Versao | Data | Estado no PC | Notas |
|--------|------|-------------|-------|
| v0.2.0-v0.2.9 | 5 fev | Crashes (libgcrypt) | Infra basica quebrando |
| v0.2.12 | 7 fev 09:15 | UI renderizava | GnuTLS warning ignorado, Pipeline Whisper->Gemini |
| v0.2.13 | 7 fev 19:05 | Nao testada | feat(stats) - 5276 linhas mudaram no App.tsx. SEM bump commit |
| v0.2.14 | 7 fev 21:03 | Nao testada | fix(sidecar) health check |
| v0.2.15 | 7 fev 22:13 | MCP confirmou UI | WAV silence, `Analysis failed {}`, HTTPS quebrado |
| v0.2.16 | 7 fev 23:19 | Nunca testada no PC | safeFetch override adicionado |
| v0.2.17 | 10 fev | OOM kill | PR #7 (refactor monolito) |

### 4. Catalogacao de 11 issues no Linear (CMR-6 a CMR-16)

| Issue | Titulo | Prioridade | Tipo | Agente |
|-------|--------|-----------|------|--------|
| CMR-6 | Import triplo plugin-http | Urgent | Bug | frontend-dev |
| CMR-7 | OOM: motion/react + GlobalAppContext | High | Bug | frontend-dev |
| CMR-8 | TLS chain Oracle Linux vs Ubuntu | Urgent | Bug | tauri-rust-dev |
| CMR-9 | WAV silence CPAL/PipeWire | Urgent | Bug | tauri-rust-dev |
| CMR-10 | Build pipeline cross-distro | High | tech-debt | tauri-rust-dev |
| CMR-11 | Analysis failed {} no boot | Medium | Bug | qualquer |
| CMR-12 | Reverter PR #7 e replanejar | Urgent | tech-debt | frontend-dev |
| CMR-13 | GlobalAppContext monolitico | High | tech-debt | frontend-dev |
| CMR-14 | 28 erros TS ButtonProps | Medium | Bug | frontend-dev |
| CMR-15 | Dead code (Cloud STT, etc) | Low | tech-debt | frontend-dev |
| CMR-16 | CSP null | Low | tech-debt | qualquer |

## Estado dos arquivos

Branch `fix/safefetch-motion`, 4 arquivos modificados (nao commitados):

| Arquivo | Status |
|---------|--------|
| `src/components/layout/AppLayout.tsx` | Modificado - removido motion/react parcialmente |
| `src/components/layout/BottomNav.tsx` | Modificado - removido motion/react parcialmente |
| `src/hooks/useTTS.ts` | Modificado - removido import de plugin-http |
| `src/services/VoiceAIClient.ts` | Modificado - removido import de plugin-http |

**ATENCAO:** Estes 4 arquivos tem mudancas parciais que tentavam resolver o problema pontualmente. Com a decisao de reverter o PR #7 inteiro (CMR-12), estas mudancas devem ser DESCARTADAS. O revert do PR #7 via `git revert` vai desfazer tudo de uma vez.

## Commits desta sessao

Nenhum. Todas as mudancas estao unstaged.

## Decisoes tomadas

- **Reverter PR #7** em vez de tentar corrigir incrementalmente. O refactor foi mergeado sem build/teste e introduziu problemas demais.
- **Dois agentes separados** para a correcao: tauri-rust-dev (infra/Rust) e frontend-developer (React/TS)
- **motion/react sera substituido por CSS transitions** -- WebKitGTK com 7.6GB nao aguenta o overhead
- **GlobalAppContext sera substituido por contextos granulares** com useMemo
- **Build pipeline deve automatizar remocao de libs** incompativeis no AppImage
- **Nao pode haver downgrading visual nem funcional** -- refatorar sim, degradar nao

## Infraestrutura relevante

- **VM build:** Oracle Linux 10, `opc@100.114.203.28`, `/home/opc/ELCO-machina`
- **PC usuario:** Ubuntu 24.04, `cmr-auto@100.102.249.9`, 7.6GB RAM, i5-12400
- **AppImage v0.2.16** (ultimo funcional) disponivel em `/var/www/updates/proatt/`
- **MCP Tauri:** porta 9223, funciona via Tailscale
- **Linear:** workspace `cmr-auto`, project `ELCO-machina`, issues CMR-6 a CMR-16
