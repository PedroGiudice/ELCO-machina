# Contexto: TTS Voice Pipeline -- VoiceDesign, Analyzer e UI Spinners

**Data:** 2026-03-24
**Sessao:** main (sem branch dedicado)
**Duracao:** ~2h

---

## O que foi feito

### 1. Voice profiles linkados ao volume Modal

Os presets de voz existiam no DB (`voice_profiles`) mas com `volume_filename` e `ref_text` nulos. O volume Modal `tts-voice-refs` ja tinha `ref_ptbr_male.wav` mas o DB nao sabia.

- Voz 1: `ref_text` recuperado do `.txt` companion no volume
- Voz 2: `ref_text` extraido via Whisper HTTP (`ref_ptbr_male2.wav` transcrito), arquivo uploadado ao volume

Estado DB apos fix:

| id | name | volume_filename | ref_text |
|----|------|----------------|----------|
| 1 | PT-BR Masculino 1 | ref_ptbr_male.wav | "O crescimento ocorreu em todos os setores..." |
| 2 | PT-BR Masculino 2 | ref_ptbr_male2.wav | "A cidade tambem dispoe de varias ilhas..." |

### 2. Endpoint .env corrigido

O `.env` apontava para `tts-serve` (deploy antigo sem GPU snapshot). Corrigido para `tts-serve-vllm`:

```
QWEN_TTS_ENDPOINT=https://pedrogiudice--tts-serve-vllm-ttsservice-web-synthesize.modal.run
QWEN_TTS_HEALTH=https://pedrogiudice--tts-serve-vllm-ttsservice-web-health.modal.run
```

### 3. Spinners/loading UI para TTS e STT

Substituido o spinner basico por:
- Waveform animada (5 barras CSS com timing staggered)
- Fases progressivas: dots que mudam cor conforme tempo ("Conectando ao modelo" -> "Processando texto" -> etc.)
- Timer Alpine.js contando segundos em tempo real
- Barra de progresso indeterminada (gradient sweep)
- Estimativa de tempo por modelo (cold start vs warm)
- Evento `synthesize-complete` / `process-complete` via `$this->dispatch()` para parar timer

Pattern aplicado em PanelTts e PanelAtt.

Keyframes adicionadas ao `resources/css/app.css`: `waveform` e `sweep`.

### 4. Conversao WAV -> OGG

Browser no Ubuntu nao reproduz WAV. Adicionada conversao via ffmpeg no `PanelTts::synthesize()`:
- WAV recebido do Modal -> ffmpeg converte para OGG Vorbis (q6) -> serve como `audio/ogg`
- Rota `/tts/audio/{file}` atualizada para aceitar `.wav` e `.ogg` com content-type correto
- Fallback para WAV se ffmpeg falhar

### 5. VoiceDesignService adicionado ao deploy TTS

Nova classe no `modal_tts_qwen_vllm_snap.py`:
- Modelo: `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`
- Endpoint: `web_design` -- aceita `voice_instructions` + `text` + `language` + `save_as`
- `save_as` grava audio + `.txt` companion direto no volume
- Mesma image, mesmo app, container separado, `scaledown_window=2`
- GPU snapshot habilitado

Bug encontrado e corrigido: API vLLM-Omni espera campo `instructions`, nao `voice_instructions`. Fix deployado.

Status: **container funciona, snapshot criado, mas request nao chega ao handler** (0 bytes retornados). Suspeita: gateway timeout do Modal durante cold start. Precisa re-testar agora que snapshot existe.

### 6. VoiceAnalyzerService (Qwen3-Omni Captioner) -- script separado

Modelo MoE 32B (3B ativos) para descrever voz a partir de audio. Script: `scripts/modal_voice_analyzer.py`.

- App separado (`voice-analyzer`) por incompatibilidade de deps
- Image: `debian_slim` + torch + transformers + `qwen-omni-utils` (sem flash-attn, usa sdpa)
- `enable_memory_snapshot=True` (sem GPU snapshot -- nao funciona sem vLLM sleep/wake)
- Deployado com sucesso

Problemas de build encontrados e resolvidos:
- `flash-attn` precisa de CUDA toolkit + compiladores -> removido, substituido por `sdpa`
- Image NVIDIA devel desnecessaria sem flash-attn -> voltou para `debian_slim`

### 7. Propriedade `$ttsStatus` removida do PanelTts

`wire:loading` do Livewire 3 cobre toda a duracao do request sincrono. A propriedade `$ttsStatus` era redundante. Removida do componente PHP; template usa apenas Alpine + `wire:loading`.

## Estado dos arquivos

| Arquivo | Status | Detalhe |
|---------|--------|---------|
| `app/Livewire/PanelTts.php` | Modificado | -$ttsStatus, +WAV->OGG, +dispatch('synthesize-complete') |
| `app/Livewire/PanelAtt.php` | Modificado | +dispatch('process-complete') |
| `resources/views/livewire/panel-tts.blade.php` | Modificado | Waveform spinner, Alpine timer, phase dots |
| `resources/views/livewire/panel-att.blade.php` | Modificado | Waveform spinner, Alpine timer, phase dots |
| `resources/css/app.css` | Modificado | +@keyframes waveform, sweep |
| `routes/web.php` | Modificado | Rota aceita .ogg, content-type dinamico |
| `scripts/modal_tts_qwen_vllm_snap.py` | Modificado | +VoiceDesignService, MODEL_BASE/VOICEDESIGN, build_tts_image |
| `scripts/modal_voice_analyzer.py` | **Criado** | Qwen3-Omni Captioner, app separado |
| `.env` | Modificado | Endpoints corrigidos para tts-serve-vllm |

## Commits desta sessao

Nenhum commit nesta sessao. Tudo esta como mudancas nao commitadas.

## Decisoes tomadas

- **VoiceDesign no mesmo deploy TTS**: ambos usam vLLM-Omni + mesma image. Containers separados no Modal.
- **Captioner em script separado**: deps incompativeis (transformers vs vLLM-Omni). Tentamos no mesmo app, fudeu no build por flash-attn. Separado como `voice-analyzer`.
- **flash-attn removido do Captioner**: compilacao exige CUDA toolkit + clang. Trocado por `sdpa` (built-in PyTorch). Performance aceitavel para uso esporadico.
- **GPU snapshot so com vLLM**: modelos transformers usam `enable_memory_snapshot` sem GPU snapshot.
- **WAV -> OGG**: Ubuntu browser nao reproduz WAV. ffmpeg converte server-side.
- **`$ttsStatus` removido**: `wire:loading` e suficiente para requests sincronos.

## Volume `tts-voice-refs` (estado atual)

```
ref_ptbr_male.wav + ref_ptbr_male.txt
ref_ptbr_male2.wav + ref_ptbr_male2.txt
designed_male_calm.wav + designed_male_calm.txt  (VoiceDesign output -- possivelmente invalido, 135 bytes)
```

## Pendencias identificadas

1. **VoiceDesign 0 bytes** (alta) -- request nao chega ao handler apos snapshot. Re-testar com `curl --max-time 600`. Se persistir, investigar gateway timeout do Modal.
2. **VoiceAnalyzer nao testado** (alta) -- deployado mas nunca chamado. Testar com `curl -F "audio=@ref_ptbr_male.wav"`.
3. **designed_male_calm.wav invalido** (media) -- 135 bytes, provavelmente JSON de erro. Deletar do volume e regenerar apos fix do VoiceDesign.
4. **Spinners visuais basicos** (baixa) -- usuario comentou "bem ruinzinhos". Melhorar design visual.
5. **Testes PanelAtt inexistentes** (media) -- 0 testes para o componente STT.
6. **Commit pendente** (alta) -- nada commitado nesta sessao.
7. **Frontend build** (media) -- `npx vite build --config vite.config.laravel.ts` feito mas precisa re-buildar apos qualquer mudanca CSS/Blade.
