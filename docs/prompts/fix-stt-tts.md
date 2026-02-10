# Prompt: Fix STT/TTS Status

Copiar e colar no inicio de uma nova sessao Claude Code.

---

Leia o documento de contexto em `docs/session-context/fix-stt-tts-status.xml` e a screenshot em `docs/screenshots-07022026/sistema_app_07022026.png`.

O painel Sistema (Stats) mostra STT e TTS com status vermelho (erro), mas o sidecar esta saudavel e acessivel do notebook via curl. O problema esta no health check do app (tauriFetch falha silenciosamente no AppImage).

Prioridade de correcao:

1. **B1 (alta):** Diagnosticar por que tauriFetch falha no health check dentro do AppImage. Adicionar logging detalhado, testar em dev mode vs AppImage, e corrigir. Se tauriFetch nao funcionar para HTTP no AppImage, implementar fallback.

2. **B3 (media):** Desacoplar canRead/canSpeak de sidecarAvailable. Permitir tentativa de TTS mesmo quando health check falhou -- tentar e mostrar erro e melhor que bloquear silenciosamente.

3. **B2 (media):** Revisar logica de status dos dots no PanelStats para que TTS nao fique vermelho por causa de falha no health check do STT.

4. **B4 (baixa):** Quando modo e "local" mas sidecar esta offline, mostrar warning explicito ou auto-ajustar para cloud.

Apos corrigir, buildar (`bun run tauri build` com `NO_STRIP=1 APPIMAGE_EXTRACT_AND_RUN=1`), publicar no update server, e fazer deploy no notebook via SSH (skill tauri-desktop-deploy). Atualizar ISSUES.md com os bugs resolvidos.
