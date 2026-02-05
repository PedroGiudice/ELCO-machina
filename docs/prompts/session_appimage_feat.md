---
  Resumo da Sessão

  O que foi feito
  ┌─────────────────────────────────────────────────────────┬───────────────────────────────────┐
  │                          Item                           │              Status               │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ Chave de assinatura minisign (~/.tauri/proatt.key)      │ Gerada (Key ID A9E6503EFCF80DA0)  │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ tauri.conf.json configurado (pubkey, endpoint, targets) │ Commitado e mergeado              │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ nginx na porta 8090 com CORS e SELinux                  │ Operacional                       │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ Build AppImage com NO_STRIP + APPIMAGE_EXTRACT_AND_RUN  │ Funcional                         │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ Fix cross-distro: libgpg-error.so.0 no bundle           │ Automatizado no publish-update.sh │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ Migração Tailwind CDN para build local (PostCSS)        │ Commitado e mergeado              │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ Script scripts/publish-update.sh                        │ Commitado e mergeado              │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ Skill tauri-appimage-updater                            │ Criada em ~/.claude/skills/       │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ PR #4 mergeado na main                                  │ 29 commits, 54 arquivos           │
  ├─────────────────────────────────────────────────────────┼───────────────────────────────────┤
  │ Conexão MCP ao app no notebook via Tailscale            │ Testada e funcional               │
  └─────────────────────────────────────────────────────────┴───────────────────────────────────┘
  O que falta testar (próxima sessão)

  O screenshot via MCP confirmou que o app está rodando com estilos no notebook. A infraestrutura de auto-update está pronta mas
   não foi validada end-to-end.

  ---
  Guia de Testes para Próxima Sessão

  Teste 1: Validar UI e funcionalidades básicas (via MCP)

  O app está conectado via MCP (porta 9223, IP Tailscale 100.102.249.9). Testar:

  1.1 - Navegação entre painéis
  - Clicar em ATT, TTS, Config na barra inferior
  - Verificar que cada painel renderiza corretamente

  1.2 - Context Scope
  - Alternar entre Coding, General, Writing
  - Verificar seleção visual

  1.3 - Audio Input
  - Alternar Dictation / Interview
  - Verificar que o microfone padrão aparece ("Using: Default Mic")

  1.4 - Gravação de áudio
  - Clicar em Record, falar algo, clicar para parar
  - Verificar que waveform/indicador aparece

  1.5 - Transcrição
  - Após gravar, clicar Transcribe
  - Verificar que texto aparece no OUTPUT (requer sidecar rodando)

  1.6 - Import File
  - Clicar "Select MP3, WAV..."
  - Selecionar arquivo de áudio
  - Transcrever

  Teste 2: TTS (Text-to-Speech)

  2.1 - Navegar para painel TTS
  - Clicar no tab "TTS" na barra inferior

  2.2 - Digitar texto e sintetizar
  - Inserir texto no campo
  - Clicar para sintetizar (requer sidecar Piper rodando)

  Teste 3: Auto-Update end-to-end

  Este é o teste mais importante. Procedimento:

  3.1 - Preparar (na VM)
  # Bumpar versão
  cd /home/opc/ELCO-machina
  # Editar src-tauri/tauri.conf.json: "version": "0.3.0"
  # Editar package.json: "version": "0.3.0"

  3.2 - Rebuildar (na VM)
  source ~/.bashrc
  TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/proatt.key) \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="x" \
  NO_STRIP=true \
  APPIMAGE_EXTRACT_AND_RUN=1 \
  bun run tauri build

  3.3 - Publicar (na VM)
  ./scripts/publish-update.sh
  # Deve mostrar: [CONCLUIDO] Versao 0.3.0 publicada

  3.4 - Verificar servidor
  curl -s http://100.114.203.28:8090/latest.json | python3 -m json.tool
  # Deve mostrar version: "0.3.0"

  3.5 - Testar no notebook
  - Fechar o AppImage v0.2.0: pkill -f "Pro ATT Machine_0.2.0_amd64.AppImage"
  - Reabrir: ~/Downloads/"Pro ATT Machine_0.2.0_amd64.AppImage"
  - Aguardar 3 segundos
  - O app deve exibir prompt: "Nova versão 0.3.0 instalada! Reiniciar?"
  - Aceitar e verificar que o app reinicia com a nova versão

  3.6 - Cenários de falha possíveis
  - Se não detectar update: verificar se http://100.114.203.28:8090/latest.json responde do notebook (curl no notebook)
  - Se download falhar: verificar CORS no nginx e tamanho do AppImage
  - Se assinatura falhar: verificar que pubkey no tauri.conf.json bate com ~/.tauri/proatt.key.pub

  Teste 4: Verificar fontes (cosmético)

  As fontes Cabinet Grotesk e Sentient são carregadas via CDN fontshare.com (HTTPS). No AppImage, provavelmente usarão fallback
  do sistema por causa do GnuTLS. Verificar visualmente se o texto aparece com fonte sans-serif adequada.

  Pré-requisitos para próxima sessão

  1. App rodando no notebook via AppImage v0.2.0
  2. Sidecar voice-ai rodando (para testes de transcrição/TTS)
  3. Tailscale conectado entre VM e notebook
  4. nginx ativo na VM (sudo systemctl status nginx)