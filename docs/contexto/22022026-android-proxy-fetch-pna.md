# Contexto: Fix Android Private Network Access + Proxy HTTP via Rust IPC

**Data:** 2026-02-22
**Sessao:** work/session-20260222-101538
**Branch:** main (commit direto)

---

## O que foi feito

### 1. Diagnostico do sidecar "offline" no Android

O app Tauri Android (Galaxy S24, Chrome 144) mostrava "Sidecar offline" apesar de:
- Rede Tailscale funcionar (ping OK, porta 8765 aberta, HTTP respondendo do shell)
- CSP null, cleartext habilitado, scopes HTTP abertos no plugin-http
- tauriFetch e fetch nativo ambos disponíveis

**Root cause encontrado via Chrome DevTools Protocol (CDP):**
- `fetch()` nativo retorna `TypeError: Failed to fetch`
- `XMLHttpRequest` retorna status 0 (bloqueado)
- Motivo: **Private Network Access** (Chrome 144) bloqueia requests do WebView
  para IPs no range `100.x.x.x` (CGNAT/Tailscale)
- A origin do app e `http://tauri.localhost/` (nao HTTPS, mixed content descartado)

### 2. Solucao: `proxy_fetch` Tauri command via Rust

Novo command Rust que usa `reqwest` para fazer HTTP do lado nativo, contornando
completamente as restricoes do WebView. O JS no Android chama via `invoke()`.

**Arquitetura:**
```
[JS/WebView] --invoke()--> [Rust proxy_fetch] --reqwest--> [Sidecar HTTP]
```

No desktop, `safeFetch` continua usando tauriFetch com fallback para fetch nativo.

### 3. Logging melhorado no health check

`useSidecar.ts` catch vazio substituido por logging do erro real na UI e console.

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `src-tauri/Cargo.toml` | Modificado - adicionado `reqwest` com rustls-tls |
| `src-tauri/Cargo.lock` | Modificado - lockfile atualizado |
| `src-tauri/src/lib.rs` | Modificado - novo command `proxy_fetch`, registrado em desktop e mobile |
| `src/services/VoiceAIClient.ts` | Modificado - `proxyFetch` via invoke, deteccao Android, `safeFetch` branching |
| `src/hooks/useSidecar.ts` | Modificado - catch loga erro real |

## Commits desta sessao

```
41dde3c7 fix(android): proxy HTTP via Rust IPC para contornar Private Network Access
```

## Decisoes tomadas

- **reqwest com rustls-tls:** escolhido para evitar dependencia de OpenSSL nativo no Android. `default-features = false` para nao puxar tokio-native-tls.
- **Deteccao Android via userAgent:** `isAndroid = /android/i.test(navigator.userAgent)` -- simples e confiavel no WebView.
- **proxy_fetch generico (GET/POST):** nao so health check, mas tambem transcribe. Timeout 120s para suportar audios longos.
- **danger_accept_invalid_certs:** habilitado no reqwest porque o sidecar e HTTP puro em rede privada Tailscale.
- **Keystore debug:** APK assinado com `~/.android/debug.keystore` para compatibilidade com versao ja instalada.

## Tecnicas de debug usadas

- **Chrome DevTools Protocol via ADB forward:** `adb forward tcp:9222 localabstract:webview_devtools_remote_<PID>` + CDP WebSocket via Bun
- **Teste isolado fetch vs XHR:** ambos falharam, confirmando bloqueio no nivel do WebView (nao CORS)
- **Teste de rede do shell Android:** `ping` e `nc` funcionaram, isolando o problema ao WebView

## Pendencias identificadas

1. **Modelo Whisper:** sidecar roda `medium`, usuario quer `large-v3-turbo` (faster-whisper). Requer mudanca no sidecar Python.
2. **Transcricao nao aparece no Editor:** usuario reportou que o botao funciona mas o texto nao aparece na aba Editor. Pode ser problema no fluxo de dados entre tabs.
3. **ADB wireless instavel:** desconecta frequentemente, pairing expira. Nao ha opcao de desativar timeout no Android 16 do S24.
