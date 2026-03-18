# Contexto: Conversao Laravel + Modal Whisper vLLM

**Data:** 2026-03-18
**Sessao:** main (merge de feature/laravel-scaffold)
**Duracao:** ~6h (duas sessoes)

---

## O que foi feito

### 1. Conversao completa Tauri React -> Laravel Livewire
Scaffold Laravel 12 + Livewire 4 coexistindo com o app Tauri no mesmo repo.
Vite configs separados (`vite.config.laravel.ts`). Todos os paineis React
convertidos para Livewire components com Blade templates. Sistema completo
de Prompt Templates (CRUD, 18 builtins seedados, import/export JSON).

### 2. Modal Whisper via vLLM com GPU Snapshot
Dois scripts criados (sem tocar no `modal_whisper_vllm.py` existente):
- `modal_whisper_http.py`: vLLM serve + sleep/wake + GPU snapshot (L4).
  Deployed e testado. Cold start ~10s (vs ~2min sem snapshot).
  Web endpoints FastAPI: `POST /web_transcribe`, `GET /web_health`.
- `modal_whisper_offline.py`: vLLM offline batch (`modal run`). Para benchmark.

Versoes pinadas: `vllm==0.8.5.post1`, `transformers==4.52.4` (pre-bug tokenizer).

### 3. Pipeline completo STT + Refiner
- `ModalService::transcribe()`: HTTP POST direto ao endpoint Modal (sem subprocess)
- `RefinerService::refine()`: Claude CLI headless (`env -u CLAUDECODE claude -p ...`)
- `PanelAtt::process()`: pipeline [1/2] Whisper GPU -> [2/2] Claude refine

### 4. Infraestrutura Laravel
- Redis (predis) para session/cache/queue
- systemd services: `elco-machina.service` (port 8001), `elco-machina-queue.service`
- Tailscale Serve HTTPS na porta 8444
- Trust proxies + secure cookies para Livewire file uploads via HTTPS

## Estado dos arquivos

| Arquivo | Status | Detalhe |
|---------|--------|---------|
| `scripts/modal_whisper_http.py` | Criado | vLLM serve + GPU snapshot + web endpoints |
| `scripts/modal_whisper_offline.py` | Criado | vLLM offline batch (benchmark) |
| `scripts/modal_whisper_vllm.py` | Intocado | Script antigo, deployed separadamente |
| `app/Services/ModalService.php` | Criado | HTTP direto ao Modal (sem subprocess) |
| `app/Services/RefinerService.php` | Criado | Claude CLI headless para refinamento |
| `app/Livewire/PanelAtt.php` | Criado | Pipeline completo STT+refine |
| `app/Livewire/PromptEditor.php` | Criado | CRUD de prompt templates |
| `app/Livewire/PromptManager.php` | Criado | Listagem + import/export JSON |
| `config/voice.php` | Criado | Config de models, endpoints, refiner |
| `docs/datadog-modal-dashboard.json` | Criado | Dashboard Datadog para Modal GPU |
| `.env` | Modificado | +WHISPER_HTTP_ENDPOINT, +WHISPER_HTTP_HEALTH |

## Commits desta sessao

```
6d17e926 fix: update whisper-vllm references to whisper-http, remove temperature param
fac5ab93 feat(voice): refiner via Claude CLI -- complete STT+refine pipeline
78bf9086 feat(ui): implement transcription flow with visual feedback
5828c16f feat(monitoring): Datadog dashboard for Modal GPU pipeline
756ca7cc refactor(voice): ModalService uses HTTP endpoints instead of subprocess
044f00c6 feat(voice): add web endpoints to Whisper HTTP service
abc4158b feat(voice): Whisper vLLM via Modal HTTP deployed + GPU snapshot
a6397be2 fix(auth): trust proxies + secure cookies para Tailscale HTTPS
262a31bf fix(infra): predis + remover Alpine duplicado do bundle
495e98da feat(laravel): sistema completo de Prompt Templates com Livewire
164daae9 fix(ui): adaptar layout mobile-first para desktop responsivo
b91c0e7c feat(laravel): UI completa + models + job de transcricao
0a07e698 feat(laravel): rota principal + view app.blade.php
e2cd79da feat(laravel): ModalService + config voice.php
259e2b90 feat(modal): adicionar volume de audio ao whisper vLLM
814b360d feat(laravel): scaffold Laravel 12 + Livewire 4 + Boost no repo Tauri
```

## Decisoes tomadas

- **vLLM 0.8.5.post1 + transformers 4.52.4**: versao pre-bug `WhisperTokenizer.all_special_tokens_extended`. Bug entrou em transformers 4.53.0 (Jun 2025), fix no vLLM via PR #20244 (Jul 2025). Pinamos pre-bug por estabilidade.
- **GPU Snapshot funciona com Whisper**: confirmado experimentalmente. vLLM serve + `--enable-sleep-mode` + encoder-decoder Whisper = OK. Restore via `wake_up()` simples (sem `_wait_ready`).
- **HTTP endpoint em vez de subprocess**: Laravel chama `Http::post()` direto ao Modal web endpoint. Elimina overhead de spawnar `python3` e parsear stdout.
- **Claude CLI para refiner (sem API key)**: mesmo padrao do sidecar Python. `env -u CLAUDECODE claude -p` via `Symfony\Component\Process`.
- **Whisper Only pula refinamento**: se template selecionado for "Whisper Only", retorna texto cru direto.
- **Porta 8444**: HTTPS via Tailscale Serve. Porta 8443 ocupada, 8000 reservada (extractor-lab).

## Metricas

| Metrica | Valor |
|---------|-------|
| Whisper inference (9.9s audio) | 1.6s |
| RTF | 0.86 |
| GPU | L4 (24GB) |
| Whisper model VRAM | ~3GB |
| Cold start (GPU snapshot) | ~10-15s |
| Cold start (sem snapshot) | ~2-3min |
| Audio endpoint URL | `https://pedrogiudice--whisper-http-whisperhttp-web-transcribe.modal.run` |
| Health endpoint URL | `https://pedrogiudice--whisper-http-whisperhttp-web-health.modal.run` |

## Pendencias identificadas

1. **Testar pipeline completo no browser** (alta) -- upload + Whisper + Claude refine end-to-end. O PanelAtt::process() foi commitado mas nao testado no browser com o refiner.
2. **Gravacao de audio via MediaRecorder** (alta) -- audio gravado no browser (WebM) precisa ser testado com o endpoint Whisper (que espera WAV). Pode precisar de conversao.
3. **ProcessTranscription job nao usa refiner** (media) -- o Job async (Redis queue) ainda chama so `transcribe()`, sem refine. O pipeline com refine so funciona via PanelAtt sincrono.
4. **XTTS endpoints nao configurados** (baixa) -- `XTTS_SERVE_ENDPOINT` e `XTTS_SERVE_HEALTH` nao setados no .env. TTS nao funciona ainda.
5. **Testes desatualizados** (baixa) -- `ProcessTranscriptionTest` mocka o padrao antigo (`run()` com subprocess). Precisa atualizar para `transcribe()` HTTP.
