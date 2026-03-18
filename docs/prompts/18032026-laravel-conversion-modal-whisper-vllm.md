# Retomada: ELCO-machina Laravel + Modal Whisper

## Contexto rapido

ELCO-machina foi convertido de Tauri/React para Laravel 12 + Livewire 4. O app Tauri
continua no repo (em hiatus), o Laravel coexiste. Pipeline de voz completo implementado:
audio upload -> Whisper STT (Modal L4, GPU snapshot, vLLM) -> Claude CLI refiner ->
texto refinado. O Modal Whisper HTTP esta deployado e testado (1.6s inference para 9.9s
de audio, RTF 0.86). O refiner usa Claude CLI headless (sem API key).

App acessivel em `https://extractlab.cormorant-alpha.ts.net:8444`.
Services systemd: `elco-machina.service` (port 8001), `elco-machina-queue.service`.

## Arquivos principais

- `app/Services/ModalService.php` -- HTTP POST ao endpoint Modal (transcribe)
- `app/Services/RefinerService.php` -- Claude CLI headless (refine)
- `app/Livewire/PanelAtt.php` -- pipeline [1/2] Whisper + [2/2] Claude
- `config/voice.php` -- config de models, endpoints, refiner timeout
- `scripts/modal_whisper_http.py` -- vLLM serve + GPU snapshot (DEPLOYED)
- `scripts/modal_whisper_offline.py` -- vLLM offline batch (benchmark)
- `sidecar/voice_ai/services/refiner.py` -- refiner original Python (referencia)
- `src/hooks/useAudioProcessing.ts` -- pipeline original React (referencia)
- `docs/contexto/18032026-laravel-conversion-modal-whisper-vllm.md` -- contexto desta sessao

## Proximos passos (por prioridade)

### 1. Testar pipeline completo no browser
**Onde:** `https://extractlab.cormorant-alpha.ts.net:8444`
**O que:** Upload de arquivo WAV, selecionar prompt (nao Whisper Only), clicar Transcrever. Verificar que step 1 (Whisper) e step 2 (Claude refine) executam e resultado aparece.
**Por que:** Pipeline foi commitado mas nao validado end-to-end no browser.
**Verificar:** Status bar mostra "[1/2] Transcrevendo..." depois "[2/2] Refinando..." depois "Concluido". Texto refinado aparece na area de resultado.

### 2. Testar gravacao MediaRecorder -> Whisper
**Onde:** `app/Livewire/PanelAtt.php`, botao "Gravar"
**O que:** Gravar audio no browser (WebM), verificar se o upload funciona e se Whisper aceita o formato. Se nao aceitar, adicionar conversao WebM->WAV via ffmpeg no server.
**Por que:** O endpoint Whisper recebe o arquivo como multipart -- librosa no Modal deveria aceitar WebM, mas nao foi testado.
**Verificar:** Gravar 5s, clicar Transcrever, verificar transcricao.

### 3. Integrar refiner no ProcessTranscription job
**Onde:** `app/Jobs/ProcessTranscription.php`
**O que:** Apos `$modal->transcribe()`, chamar `$refiner->refine()` se o prompt selecionado nao for "Whisper Only". Salvar tanto `text` (raw) quanto `refined_text` no model.
**Por que:** Atualmente o job async (queue Redis) so faz transcricao, sem refine. O pipeline completo so funciona via Livewire sincrono.
**Verificar:** `php artisan queue:work` processa job com refine.

### 4. Configurar XTTS endpoints
**Onde:** `.env`
**O que:** Setar `XTTS_SERVE_ENDPOINT` e `XTTS_SERVE_HEALTH` com URLs do Modal deploy existente. Verificar `modal app list | grep xtts`.
**Por que:** TTS nao funciona sem os endpoints configurados.
**Verificar:** `curl $XTTS_SERVE_HEALTH` retorna healthy.

### 5. Atualizar testes
**Onde:** `tests/Feature/Jobs/ProcessTranscriptionTest.php`
**O que:** Atualizar mock de `ModalService` -- agora usa `transcribe()` (HTTP), nao `run()` (subprocess).
**Por que:** Testes mockam interface antiga.
**Verificar:** `php artisan test`

## Como verificar

```bash
# App rodando
curl -s https://extractlab.cormorant-alpha.ts.net:8444 | head -5

# Whisper endpoint healthy
curl -s https://pedrogiudice--whisper-http-whisperhttp-web-health.modal.run

# Transcricao via curl (sem browser)
curl -X POST https://pedrogiudice--whisper-http-whisperhttp-web-transcribe.modal.run \
  -F "file=@docs/Refaudio.wav" -F "language=pt"

# Queue worker
systemctl --user status elco-machina-queue

# Laravel logs
tail -20 storage/logs/laravel.log
```

<session_metadata>
branch: main
last_commit: 6d17e926
modal_apps_deployed: whisper-http, xtts-serve
pending_tests: ProcessTranscriptionTest needs update
systemd_services: elco-machina.service, elco-machina-queue.service
</session_metadata>
