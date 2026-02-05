# Auto-Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Habilitar auto-update funcional no Pro ATT Machine, permitindo que o app detecte, baixe e instale novas versoes automaticamente via AppImage no Linux.

**Architecture:** O Tauri updater plugin (ja registrado no Rust e frontend) verifica um endpoint JSON self-hosted na VM via nginx, compara versoes, baixa o AppImage assinado e substitui o binario. A assinatura criptografica (minisign) garante integridade. Build, serve e update ficam todos na VM - zero dependencia externa.

**Tech Stack:** Tauri 2.9.5, tauri-plugin-updater 2.x, minisign (chave Ed25519), AppImage, nginx

**Decisao:** Self-hosted na VM (confirmado pelo usuario). HTTP via Tailscale (100.114.203.28) com `dangerousInsecureTransportProtocol`.

---

## Estado Atual (Diagnosticado)

| Componente | Status | Detalhe |
|------------|--------|---------|
| Plugin Rust | OK | `lib.rs:343` - ja registrado |
| Plugin Frontend | OK | `App.tsx:940-982` - check + download + relaunch |
| Package JS | OK | `@tauri-apps/plugin-updater` v2.9.0 instalado |
| Cargo dep | OK | `tauri-plugin-updater = "2"` |
| createUpdaterArtifacts | OK | `true` no `tauri.conf.json` |
| Endpoint | OK | GitHub Releases configurado |
| pubkey no conf | ERRADA | Key ID `C4B21D4C2A603134` - nao bate com chave disponivel |
| Chave privada | ERRADA | `~/.tauri/lex-vector.key` e de outro projeto (Key ID `8D0D6559531464EF`) |
| TAURI_SIGNING_PRIVATE_KEY | AUSENTE | Nao exportada |
| Bundle targets | INCOMPLETO | Apenas `["deb"]` - falta `"appimage"` |
| FUSE2 | OK | `fuse-libs-2.9.9` instalado na VM |
| appimagetool | AUSENTE | Tauri baixa automaticamente durante build |

**Problema critico:** A pubkey no `tauri.conf.json` nao corresponde a nenhuma chave privada disponivel. Precisa gerar par novo.

---

## Task 1: Gerar par de chaves de assinatura

**Files:**
- Modify: `src-tauri/tauri.conf.json` (campo `plugins.updater.pubkey`)
- Create: `~/.tauri/proatt.key` e `~/.tauri/proatt.key.pub`

**Step 1: Gerar o par de chaves**

```bash
cd /home/opc/ELCO-machina
bun run tauri signer generate -w ~/.tauri/proatt.key
```

Quando pedir password, pressionar Enter (sem senha, para simplificar automacao).

Esperado: Dois arquivos criados:
- `~/.tauri/proatt.key` (chave privada)
- `~/.tauri/proatt.key.pub` (chave publica, formato base64 com header minisign)

**Step 2: Ler a chave publica gerada**

```bash
cat ~/.tauri/proatt.key.pub
```

Esperado: String no formato `untrusted comment: ... \n RW...` (base64 encoded)

**Step 3: Atualizar pubkey no tauri.conf.json**

No campo `plugins.updater.pubkey`, substituir o valor atual pela saida do Step 2.

**Step 4: Verificar que a chave privada existe e e legivel**

```bash
head -1 ~/.tauri/proatt.key
```

Esperado: `untrusted comment: ...`

**Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "fix(updater): Regenera par de chaves de assinatura para auto-update"
```

---

## Task 2: Configurar AppImage como target de build

**Files:**
- Modify: `src-tauri/tauri.conf.json` (campo `bundle.targets`)

**Step 1: Adicionar "appimage" aos targets**

Em `tauri.conf.json`, alterar:
```json
"targets": ["deb"]
```
Para:
```json
"targets": ["deb", "appimage"]
```

**Step 2: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(updater): Adiciona AppImage aos targets de build"
```

Nota: Tasks 1 e 2 podem ser combinadas em um unico commit se executadas sequencialmente.

---

## Task 3: Build com assinatura e verificar artefatos

**Step 1: Exportar chave privada como variavel de ambiente**

```bash
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/proatt.key)
```

Se a chave tiver senha (nao deveria):
```bash
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
```

**Step 2: Executar o build**

```bash
cd /home/opc/ELCO-machina
bun run tauri build
```

ATENCAO: Build demora ~1-2 minutos. Se em background, verificar output antes de declarar sucesso.

**Step 3: Verificar artefatos gerados**

```bash
ls -la src-tauri/target/release/bundle/appimage/
ls -la src-tauri/target/release/bundle/deb/
```

Esperado (AppImage):
- `pro-att-machine_0.2.0_amd64.AppImage` (binario executavel)
- `pro-att-machine_0.2.0_amd64.AppImage.sig` (assinatura)

Esperado (DEB):
- `Pro ATT Machine_0.2.0_amd64.deb`
- `Pro ATT Machine_0.2.0_amd64.deb.sig` (se createUpdaterArtifacts funciona para DEB)

**Step 4: Verificar que o AppImage e executavel**

```bash
chmod +x src-tauri/target/release/bundle/appimage/*.AppImage
# Nao executar na VM sem display - apenas verificar que o arquivo existe e tem tamanho razoavel
ls -lh src-tauri/target/release/bundle/appimage/*.AppImage
```

Esperado: Arquivo de ~170MB+

**Se o build falhar com erro de AppImage:**
- Verificar se linuxdeploy foi baixado: `ls ~/.cache/tauri/` ou similar
- Se erro de FUSE: verificar `ldconfig -p | grep fuse`
- Se erro de linuxdeploy em Oracle Linux: pode precisar baixar manualmente

---

## Task 4: Configurar servidor de updates (self-hosted na VM)

**Files:**
- Modify: `src-tauri/tauri.conf.json` (endpoints + dangerousInsecureTransportProtocol)
- Create: `/etc/nginx/conf.d/updates.conf`
- Create: `/var/www/updates/` (diretorio de artefatos)

**Step 1: Instalar nginx**

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
```

**Step 2: Configurar diretorio de updates**

```bash
sudo mkdir -p /var/www/updates
sudo chown opc:opc /var/www/updates
```

**Step 3: Configurar nginx para servir updates**

```bash
sudo tee /etc/nginx/conf.d/updates.conf << 'EOF'
server {
    listen 8090;
    server_name _;
    root /var/www/updates;
    autoindex on;

    location / {
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, OPTIONS';
    }
}
EOF
sudo nginx -t && sudo systemctl reload nginx
```

**Step 4: Atualizar endpoint no tauri.conf.json**

Alterar o endpoint para apontar para a VM via Tailscale.
ATENCAO: Como e HTTP (nao HTTPS), precisa habilitar `dangerousInsecureTransportProtocol`.

O campo `plugins.updater` deve ficar:

```json
"updater": {
  "pubkey": "[chave publica da Task 1]",
  "dangerousInsecureTransportProtocol": true,
  "endpoints": [
    "http://100.114.203.28:8090/latest.json"
  ],
  "windows": {
    "installMode": "passive"
  }
}
```

**Step 5: Copiar artefatos do build (Task 3) para o diretorio de updates**

```bash
APPIMAGE=$(ls /home/opc/ELCO-machina/src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null | head -1)
SIGNATURE=$(cat "${APPIMAGE}.sig")
VERSION=$(grep '"version"' /home/opc/ELCO-machina/src-tauri/tauri.conf.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
APPIMAGE_NAME=$(basename "$APPIMAGE")

cp "$APPIMAGE" /var/www/updates/
cp "${APPIMAGE}.sig" /var/www/updates/

cat > /var/www/updates/latest.json << EOF
{
  "version": "${VERSION}",
  "notes": "Atualizacao automatica",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "linux-x86_64": {
      "signature": "${SIGNATURE}",
      "url": "http://100.114.203.28:8090/${APPIMAGE_NAME}"
    }
  }
}
EOF
```

**Step 6: Verificar que o endpoint funciona**

```bash
curl -s http://100.114.203.28:8090/latest.json | python3 -m json.tool
curl -I http://100.114.203.28:8090/$(ls /var/www/updates/*.AppImage | head -1 | xargs basename)
```

Esperado: JSON valido com version, signature e url acessivel.

**Step 7: Commit mudancas no endpoint**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(updater): Configura endpoint self-hosted para auto-update"
```

---

## Task 5: Teste end-to-end do auto-update

**Pre-requisito:** Tasks 1-4 concluidas. AppImage gerado e servido.

**Step 1: Instalar versao "velha" no notebook**

No notebook (100.102.249.9), instalar o AppImage atual:

```bash
# Copiar da VM
scp opc@100.114.203.28:"/home/opc/ELCO-machina/src-tauri/target/release/bundle/appimage/*.AppImage" ~/Desktop/
chmod +x ~/Desktop/*.AppImage
```

**Step 2: Bumpar versao no projeto**

Na VM, incrementar a versao para simular update:

```bash
# Em tauri.conf.json e package.json, mudar version de "0.2.0" para "0.2.1"
```

**Step 3: Rebuildar com nova versao**

```bash
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/proatt.key)
bun run tauri build
```

**Step 4: Publicar nova versao no servidor de updates**

(Seguir Steps da Opcao A ou B da Task 4, conforme escolhido)

**Step 5: Executar AppImage "velho" no notebook e observar**

1. Executar o AppImage v0.2.0
2. Aguardar 3 segundos (timer do checkForUpdates em App.tsx:980)
3. Esperado: Dialog com "Nova versao 0.2.1 instalada! Reiniciar agora?"
4. Confirmar -> App reinicia com v0.2.1

**Se nao funcionar:**
- Abrir DevTools (F12) e verificar console para erros de network/updater
- Verificar se o endpoint retorna JSON valido (curl do notebook)
- Verificar se a assinatura bate com a pubkey no app

---

## Task 6: Automatizar deploy de updates (script)

**Files:**
- Create: `scripts/publish-update.sh`

**Step 1: Criar script de publicacao**

Script que automatiza: build -> gerar latest.json -> publicar (GitHub ou copia local)

```bash
#!/bin/bash
set -euo pipefail

# Configuracao
PROJECT_DIR="/home/opc/ELCO-machina"
KEY_FILE="$HOME/.tauri/proatt.key"

# Exportar chave
export TAURI_SIGNING_PRIVATE_KEY=$(cat "$KEY_FILE")

# Build
cd "$PROJECT_DIR"
bun run tauri build

# Extrair versao e assinatura
VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
APPIMAGE=$(ls src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null | head -1)
SIGNATURE=$(cat "${APPIMAGE}.sig")

if [ -z "$APPIMAGE" ]; then
    echo "ERRO: AppImage nao encontrado"
    exit 1
fi

echo "Versao: $VERSION"
echo "AppImage: $APPIMAGE"
echo "Publicacao concluida."
```

**Step 2: Tornar executavel**

```bash
chmod +x scripts/publish-update.sh
```

**Step 3: Commit**

```bash
git add scripts/publish-update.sh
git commit -m "feat(updater): Script de publicacao de updates"
```

---

## Persistencia da chave (importante)

A variavel `TAURI_SIGNING_PRIVATE_KEY` precisa estar disponivel em toda sessao de build.

Adicionar ao `~/.bashrc`:

```bash
echo 'export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/proatt.key 2>/dev/null)' >> ~/.bashrc
```

NAO commitar a chave privada no repositorio. Apenas a pubkey (que ja esta no tauri.conf.json).

---

## Ordem de execucao

```
Task 1 (chaves) -> Task 2 (targets) -> Task 3 (build) -> Task 4 (servidor) -> Task 5 (teste e2e) -> Task 6 (automacao)
```

Tasks 1 e 2 sao rapidas (~5 min cada).
Task 3 depende de 1+2 e leva ~2 min (build).
Task 4 requer decisao do usuario.
Task 5 requer notebook do usuario.
Task 6 e opcional mas recomendada.
