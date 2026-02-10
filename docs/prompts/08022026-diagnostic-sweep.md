# Retomada: Correções pós-diagnóstico do ELCO-machina

## Contexto rápido

Uma varredura diagnóstica completa do codebase foi feita em 08/02/2026. Nenhum código foi alterado -- apenas identificação de problemas. O relatório completo está em `docs/contexto/08022026-diagnostic-sweep.md`.

O app é um desktop Tauri 2.x (React 19 + Rust) que captura áudio, transcreve com Whisper (sidecar na VM), e refina o texto com a API Gemini. O pipeline correto é: **Áudio -> Whisper STT (VM) -> texto bruto -> Gemini API (refinamento text-only) -> output estilizado**. O Gemini NÃO faz STT -- ele é o editor/refinador de texto, e é o diferencial do produto.

O app está com três problemas críticos: (1) tela preta no desktop do usuário, (2) TTS não funcional, (3) instabilidade geral com ~30 problemas catalogados. Existe um plano de refatoração do App.tsx monolítico em `docs/plans/refactor-app-monolith.md` que ainda não foi executado.

## Arquivos principais

- `App.tsx` -- Componente monolítico (~3574 linhas, ~60 useState). Contém toda a lógica inline
- `src/components/panels/PanelATT.tsx` -- Painel áudio-para-texto
- `src/components/panels/PanelTTS.tsx` -- Painel texto-para-fala
- `src/components/panels/PanelConfig.tsx` -- Painel de configurações
- `src/services/VoiceAIClient.ts` -- Cliente Whisper (sem endpoint TTS)
- `src/hooks/useAudioProcessing.ts` -- Hook extraído mas NÃO usado (dead code)
- `src/hooks/useAudioRecording.ts` -- Idem
- `src/hooks/useTTS.ts` -- Idem
- `src-tauri/src/lib.rs` -- Backend Rust (sidecar_status stub)
- `src-tauri/src/audio.rs` -- Gravação CPAL
- `sidecar/voice_ai/services/stt_service.py` -- Serviço Whisper (modelo medium)
- `sidecar/voice_ai/main.py` -- FastAPI do sidecar
- `index.html` -- CDN importmap + fonts HTTPS
- `docs/contexto/08022026-diagnostic-sweep.md` -- Diagnóstico completo desta sessão
- `docs/plans/refactor-app-monolith.md` -- Plano de refatoração (não executado)
- `ISSUES.md` -- Tracker com 21 issues

## Próximos passos (por prioridade)

### 1. Diagnosticar e corrigir tela preta no desktop
**Onde:** `index.html` (fonts/importmap), `App.tsx` (bootstrap), config Tauri
**O que:** O app abre mas renderiza apenas fundo preto no PC do usuário (Dell Vostro, Ubuntu). Hipóteses: (a) fonts HTTPS do CDN fontshare não carregam no AppImage -- certificados SSL, (b) importmap CDN (aistudiocdn.com) conflita com bundling Vite, (c) safeFetch override global quebra antes do React montar, (d) versão WebKitGTK incompatível
**Por que:** App completamente inutilizável
**Verificar:** `bun run tauri dev` no PC do usuário (SSH: `ssh cmr-auto@100.102.249.9`) ou usar MCP-tauri para capturar console logs da webview

### 2. Implementar Whisper initial_prompt (glossário/hotwords)
**Onde:** `sidecar/voice_ai/services/stt_service.py`, método `transcribe()` (linhas 251-260)
**O que:** Adicionar parâmetro `initial_prompt` na chamada `self._model.transcribe()`. Exemplo: `initial_prompt="Claude Code, Tauri, WebKitGTK, TypeScript"`. Expor via endpoint FastAPI para que o frontend possa enviar termos
**Por que:** Whisper transcreve "Claude" como "Cloud" consistentemente. faster-whisper suporta `initial_prompt` nativamente
**Verificar:** Enviar áudio dizendo "Claude Code" e verificar se a transcrição sai correta. `curl -X POST http://100.114.203.28:8765/transcribe ...`

### 3. Corrigir ButtonProps (28 erros TypeScript)
**Onde:** `src/components/ui/Button.tsx`, interface ButtonProps
**O que:** A interface estende HTMLButtonElement mas não expõe onClick, className, disabled corretamente. Trocar para `React.ButtonHTMLAttributes<HTMLButtonElement>` ou ajustar os tipos
**Por que:** 28 erros de tipo cascateiam por todo o codebase
**Verificar:** `bunx tsc --noEmit` -- deve dar 0 erros (ou próximo disso)

### 4. Tornar TTS funcional
**Onde:** `src/services/VoiceAIClient.ts` (adicionar método synthesize), `App.tsx` linhas 2201-2291 (inline TTS), `sidecar/voice_ai/main.py` (verificar endpoint /synthesize)
**O que:** VoiceAIClient só tem `/health` e `/transcribe`. Precisa expor `/synthesize`. O código TTS inline em App.tsx precisa ser conectado ao endpoint real. `canSpeak={true}` está hardcoded na linha 2514
**Por que:** TTS não funciona -- é feature declarada mas não conectada
**Verificar:** Clicar no botão TTS no PanelTTS e verificar se áudio é reproduzido

### 5. Executar plano de refatoração do App.tsx
**Onde:** `docs/plans/refactor-app-monolith.md` (plano), `App.tsx` (alvo)
**O que:** Decompor App.tsx de 3574 linhas em hooks e componentes menores. Os hooks já foram extraídos (`useAudioProcessing.ts`, `useAudioRecording.ts`, `useTTS.ts`) mas nunca plugados. Substituir código inline pelas versões extraídas
**Por que:** Manutenibilidade zero com 3574 linhas e ~60 useState num único componente
**Verificar:** `bunx tsc --noEmit && bun run build` -- build deve passar. Testar funcionalidades: gravar, transcrever, refinar com Gemini

## Como verificar

```bash
# Type check
cd /home/opc/ELCO-machina && bunx tsc --noEmit

# Build
NO_STRIP=1 bun run tauri build --bundles appimage

# Sidecar health
curl -s http://100.114.203.28:8765/health | python3 -m json.tool

# Testar no desktop remoto
ssh cmr-auto@100.102.249.9

# Dev mode (na VM)
bun run tauri dev
```
