# Contexto: Android ADB Testing + Mobile Layout Fixes

**Data:** 2026-02-22
**Sessao:** work/session-20260222 (continuacao da sessao de voice-ai-contabo)
**Duracao:** ~1h30

---

## O que foi feito

### 1. Conexao ADB via Tailscale ao Galaxy S24

Descobrimos que e possivel conectar ADB wireless debugging ao celular via Tailscale, desde que:

1. **Depuracao sem fio** esteja ativa no celular (Opcoes de desenvolvedor)
2. O celular mostre o **IP Tailscale** (nao o IP local Wi-Fi) na tela de pareamento
3. Pareamento: `adb pair <tailscale-ip>:<pairing-port> <6-digit-code>`
4. Conexao: `adb connect <tailscale-ip>:<connection-port>`

**Detalhe critico:** a porta de pareamento e a porta de conexao sao DIFERENTES. O celular mostra ambas em locais distintos da tela de "Depuracao sem fio".

**Problemas encontrados:**
- A sessao ADB expira frequentemente (a cada ~5-10min de inatividade)
- Cada reconexao requer novo pareamento (novo codigo de 6 digitos)
- O celular as vezes mostra IP local (192.168.x.x) ao inves do Tailscale (100.x.x.x) na tela de pareamento -- quando mostra local, nao funciona da VM GCP

**Capacidades confirmadas via ADB:**
- `adb install` -- instalar APK remoto
- `adb exec-out screencap -p` -- screenshot remoto
- `adb shell am start` -- abrir app remoto
- `adb shell am force-stop` -- fechar app remoto
- `adb shell ping` -- testar conectividade do celular
- `adb shell nc` -- testar portas TCP do celular
- `adb logcat` -- logs em tempo real

**AVISO:** `adb shell input tap` causa travamento de touch no app. Nao enviar input events remotamente.

### 2. MCP Bridge NAO suporta Android

Tentativa de habilitar o plugin `tauri-plugin-mcp-bridge` no Android:
- `#[cfg(desktop)]` no lib.rs limitava ao desktop
- Mudamos para `#[cfg(any(desktop, target_os = "android"))]`
- **Resultado:** o crate `tauri-plugin-mcp-bridge` nao compila para `aarch64-linux-android`
- O plugin simplesmente nao tem suporte mobile
- **Revertido** para `#[cfg(desktop)]`

### 3. Fix: Scroll quebrado em todo o app Android

**Causa raiz:** `AppLayout.tsx` linha 55 tinha `overflow-hidden` no container principal de conteudo. Isso impedia scroll em todas as telas exceto containers internos com `overflow-y-auto` proprio (como a caixa de Servicos).

**Fix:** `overflow-hidden` -> `overflow-y-auto`

### 4. Fix: Botao de acao coberto pela BottomNav

**Causa raiz:** A `motion.div` tinha `h-full pb-20` -- o `h-full` fixava a altura e o padding nao criava espaco alem do container. O botao "Refine Text" no final do PanelATT ficava atras da BottomNav fixa.

**Fix:** `h-full pb-20` -> `min-h-full pb-32` (min-h permite expansao, pb-32 = 128px compensa a nav de 64px + safe area).

Spacer inferior mudado de `h-16 md:h-0` para `h-[var(--sab)]` (safe area bottom dinamica).

### 5. Fix: cleartext HTTP bloqueado no Android release

**Causa raiz:** `build.gradle.kts` tinha `usesCleartextTraffic = "false"` no defaultConfig (release). O sidecar usa `http://` (sem TLS). Android 14+ bloqueia cleartext por default.

**Fix:** Mudado para `usesCleartextTraffic = "true"` no defaultConfig.

### 6. Fix: safeFetch fallback restritivo demais

**Causa raiz:** `VoiceAIClient.ts` `safeFetch()` so fazia fallback para fetch nativo quando o erro do tauriFetch continha "url not allowed" ou "scope". No Android, o tauriFetch pode falhar com erros diferentes.

**Fix:** Fallback incondicional -- qualquer falha do tauriFetch agora faz fallback para fetch nativo.

### 7. Gravacao nativa falhou no Android

Nos logs: `Erro ao iniciar gravacao nativa: Command start_audio_recording not found`. O app fez fallback para Web API com sucesso (`Recording captured`). O command `start_audio_recording` do plugin `mic-recorder` pode nao estar registrado no Android ou ter nome diferente. **Nao corrigido nesta sessao.**

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `src/components/layout/AppLayout.tsx` | Modificado - fix scroll + padding BottomNav |
| `src/services/VoiceAIClient.ts` | Modificado - safeFetch fallback universal |
| `src-tauri/gen/android/app/build.gradle.kts` | Modificado - cleartext=true no release |
| `src-tauri/src/lib.rs` | Nao modificado (revertido) - MCP Bridge permanece desktop-only |

## Commits desta sessao

Nenhum commit feito. Todas as mudancas estao unstaged.

## Pendencias identificadas

1. **STT ainda offline no celular** -- mesmo com cleartext habilitado e safeFetch universal, o sidecar aparece como offline. O APK com o ultimo fix (safeFetch) foi buildado mas nao instalado (ADB desconectou). **Prioridade: alta.**
2. **TTS tambem offline** -- mesmo mecanismo de conexao do STT, mesma causa raiz.
3. **Gravacao nativa (mic-recorder)** -- command `start_audio_recording` not found no Android. Fallback para Web API funciona, mas qualidade pode ser inferior. **Prioridade: media.**
4. **ADB session instavel** -- desconecta frequentemente. Considerar manter `adb` em modo `keep-alive` ou usar `adb tcpip` com porta fixa.
5. **Assinatura do APK** -- usando debug keystore. Versoes futuras com keystore diferente exigem desinstalar e reinstalar (perde dados).

## Decisoes tomadas

- **Cleartext habilitado no release:** aceito para rede Tailscale privada. Risco minimo.
- **safeFetch fallback universal:** melhor resiliencia, sem downside significativo. Se tauriFetch funcionar, e usado; senao, fetch nativo.
- **Nao usar MCP Bridge no Android:** impossivel tecnicamente, plugin nao compila para ARM.
- **ADB via Tailscale como workflow de teste:** funciona, mas instavel. Alternativa viavel a dev server.
