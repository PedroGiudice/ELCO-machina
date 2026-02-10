# Retomada: tauri-rust-dev -- Infra, Build Pipeline e Audio (CMR-8, CMR-9, CMR-10)

## Contexto rapido

O app ELCO-machina (Tauri desktop) acumulou tech debt critico em 3 camadas. Esta sessao trata da camada de infra/Rust. O AppImage e buildado no Oracle Linux 10 mas roda no Ubuntu 24.04 do usuario. Libs bundled (GnuTLS, p11-kit, libcrypto, libgcrypt) sao incompativeis com Ubuntu, causando: zero certificados TLS (HTTPS nao funciona), crash por libgcrypt. Alem disso, a gravacao de audio via CPAL (Rust) produz WAV com dados zerados -- microfone nao e capturado.

O contexto completo da sessao anterior esta em `docs/contexto/10022026-diagnostic-e-issues.md`. Os issues estao no Linear (CMR-8, CMR-9, CMR-10).

**REGRA:** nao pode haver downgrading visual nem funcional. Build e teste obrigatorios antes de declarar conclusao.

## Arquivos principais

- `scripts/publish-update.sh` -- script de publicacao do AppImage no update server
- `src-tauri/src/audio.rs` -- implementacao CPAL de gravacao de audio
- `src-tauri/src/lib.rs` -- registro de plugins e commands Tauri
- `src-tauri/tauri.conf.json` -- configuracao do app
- `docs/contexto/10022026-diagnostic-e-issues.md` -- contexto detalhado

## Proximos passos (por prioridade)

### 1. CMR-10: Automatizar remocao de libs cross-distro no build pipeline (BLOQUEADOR)

**Onde:** `scripts/publish-update.sh` linhas 58-69
**O que:** Apos extrair o AppImage para correcao cross-distro, TAMBEM remover as libs TLS incompativeis. Atualmente o script so copia `libgpg-error.so.0` do OL para dentro. Precisa REMOVER:

```bash
# Adicionar apos a extracao (linha 63):
rm -f squashfs-root/usr/lib/libgnutls.so.30
rm -f squashfs-root/usr/lib/libp11-kit.so.0
rm -f squashfs-root/usr/lib/libcrypto.so.3
rm -f squashfs-root/usr/lib/libgcrypt.so.20
rm -f squashfs-root/usr/lib64/gio/modules/libgiognutls.so
```

E REMOVER a copia de `libgpg-error.so.0` (linha 64) -- se `libgcrypt.so.20` e removida, a `libgpg-error` bundled nao e mais necessaria.

**Por que:** Cada instalacao/update requer remocao manual. Automatizar no pipeline garante que nenhuma lib incompativel vaze para o usuario.
**Verificar:**
```bash
# Apos modificar o script, buildar e publicar:
NO_STRIP=1 bun run tauri build --bundles appimage
./scripts/publish-update.sh
# Extrair o AppImage publicado e verificar que as libs nao existem:
cd /tmp && /var/www/updates/proatt/Pro\ ATT\ Machine_*_amd64.AppImage --appimage-extract
ls squashfs-root/usr/lib/libgnutls.so.30  # deve dar "No such file"
ls squashfs-root/usr/lib/libp11-kit.so.0  # deve dar "No such file"
```

### 2. CMR-8: Validar que TLS funciona apos fix do pipeline

**Onde:** PC do usuario (`cmr-auto@100.102.249.9`)
**O que:** Instalar o AppImage gerado pelo pipeline corrigido, sem nenhum fix manual. Conectar via MCP Tauri e verificar:

```javascript
// Via mcp__tauri__webview_execute_js:
await fetch('https://generativelanguage.googleapis.com').then(r => r.status)
// Esperado: 404 ou 200 (qualquer coisa exceto erro de rede)
```

**Por que:** Confirma que o fix do pipeline resolve TLS de forma permanente.
**Verificar:** MCP Tauri conecta, JS executa, fetch HTTPS retorna status HTTP valido.

### 3. CMR-9: Diagnosticar WAV silence (CPAL + PipeWire)

**Onde:** `src-tauri/src/audio.rs`
**O que:** Investigar por que CPAL gera samples zerados no Ubuntu 24.04 (PipeWire). Hipoteses:

1. CPAL seleciona dispositivo errado. Verificar: listar devices via `enumerate_audio_devices` no PC, comparar com `pactl list sources`.
2. PipeWire incompatibilidade. Ubuntu 24.04 usa PipeWire como default. CPAL suporta PipeWire via backend `pipewire` (feature flag no Cargo.toml). Verificar se a feature esta habilitada.
3. `.ok()` silenciando erros em `audio.rs:263` (write_sample). Substituir por logging do erro.
4. `unsafe impl Send/Sync` para SafeStream. Race condition possivel.

**Diagnostico requer acesso ao PC via MCP Tauri e SSH.**

**Por que:** Sem gravacao funcional, o app nao tem proposito. Pipeline: audio -> Whisper -> Gemini.
**Verificar:**
```bash
# No PC, apos fix, gravar 3 segundos e analisar:
# Via MCP Tauri: invocar start_audio_recording, aguardar, stop, analisar WAV
# Esperado: RMS > 0.001, Non-zero samples > 0
```

## Como verificar (geral)

```bash
# Build completo (obrigatorio antes de declarar conclusao)
NO_STRIP=1 bun run tauri build --bundles appimage

# Publicar
./scripts/publish-update.sh

# Instalar no PC e testar via MCP Tauri
scp /var/www/updates/proatt/Pro\ ATT\ Machine_*_amd64.AppImage cmr-auto@100.102.249.9:~/Downloads/
# Extrair, criar launcher, testar MCP
```
