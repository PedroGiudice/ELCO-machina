# Retomada: Validar fix do front-end e publicar v0.2.17

## Contexto rapido

O front-end do Pro ATT Machine quebrou apos a refatoracao que extraiu o App.tsx monolitico em hooks/context/componentes (PR #7, ja mergeado na main). A causa raiz foi identificada: 3 modulos importavam `@tauri-apps/plugin-http` independentemente, criando dupla chamada IPC que podia travar o webview. O fix foi aplicado (centralizar plugin-http em um unico arquivo), o AppImage foi rebuildado e transferido para o PC do usuario, mas ainda NAO foi testado.

Alem disso, `motion/react` foi removido de AppLayout.tsx e BottomNav.tsx como precaucao contra incompatibilidade WebKitGTK. Ha 4 arquivos modificados nao commitados.

## Arquivos principais

- `src/services/safeFetch.ts` -- UNICO ponto de import de @tauri-apps/plugin-http
- `src/services/VoiceAIClient.ts` -- corrigido: safeFetch agora delega para window.fetch
- `src/hooks/useTTS.ts` -- corrigido: mesmo fix
- `src/components/layout/AppLayout.tsx` -- removido motion/react
- `src/components/layout/BottomNav.tsx` -- removido motion/react
- `docs/contexto/10022026-fix-safefetch-motion.md` -- contexto detalhado

## Proximos passos (por prioridade)

### 1. Testar o AppImage no PC do usuario
**Onde:** PC Linux (cmr-auto@100.102.249.9)
**O que:** Executar `~/.local/lib/pro-att-machine/squashfs-root/AppRun`, conectar via MCP Tauri (porta 9223, host 100.102.249.9), verificar console JS e tomar screenshot
**Por que:** Validar que o fix resolve o freeze do webview
**Verificar:**
```bash
# No PC do usuario, executar:
~/.local/lib/pro-att-machine/squashfs-root/AppRun

# Via MCP Tauri:
mcp__tauri__driver_session(action="start", host="100.102.249.9", port=9223)
mcp__tauri__webview_execute_js(script="document.title")  # deve retornar, nao timeout
mcp__tauri__webview_screenshot(format="png", filePath="/tmp/proatt-test.png")
```

### 2. Se freeze persistir: remover motion/react dos componentes restantes
**Onde:** `src/components/ui/Button.tsx`, `src/components/ui/Spinner.tsx`, `src/components/editor/Editor.tsx`, `src/components/panels/PanelConfig.tsx`, `src/components/panels/PanelATT.tsx`, `src/components/panels/PanelTTS.tsx`
**O que:** Substituir `motion.*` e `AnimatePresence` por elementos HTML padrao com CSS transitions
**Por que:** WebKitGTK do AppImage pode nao suportar Web Animations API do motion v12
**Verificar:** Rebuild + teste MCP

### 3. Commitar os fixes e publicar no update server
**Onde:** VM Oracle (maquina atual)
**O que:**
```bash
git add src/services/VoiceAIClient.ts src/hooks/useTTS.ts src/components/layout/AppLayout.tsx src/components/layout/BottomNav.tsx
git commit -m "fix(fetch): centralizar plugin-http e remover motion do layout"
# Publicar:
cp "src-tauri/target/release/bundle/appimage/Pro ATT Machine_0.2.17_amd64.AppImage" /var/www/updates/proatt/
cp "src-tauri/target/release/bundle/appimage/Pro ATT Machine_0.2.17_amd64.AppImage.sig" /var/www/updates/proatt/
# Atualizar latest.json
```
**Por que:** Disponibilizar via auto-update para todos os clientes
**Verificar:** `curl -s http://100.114.203.28:8090/proatt/latest.json | python3 -m json.tool`

## Como verificar

```bash
# 1. Confirmar AppImage existe no PC
ssh cmr-auto@100.102.249.9 "ls -lh ~/.local/lib/pro-att-machine/squashfs-root/AppRun"

# 2. Verificar que nao ha processos antigos
ssh cmr-auto@100.102.249.9 "pgrep -la pro-att-machine || echo 'nenhum processo'"

# 3. Build status
ls -lh src-tauri/target/release/bundle/appimage/*.AppImage

# 4. Arquivos nao commitados
git status --short
# Esperado: 4 arquivos M (VoiceAIClient, useTTS, AppLayout, BottomNav)
```
