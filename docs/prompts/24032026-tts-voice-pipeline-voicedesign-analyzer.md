# Retomada: TTS Voice Pipeline -- VoiceDesign, Analyzer e UI

## Contexto rapido

Sessao focada no pipeline de voz do ELCO-machina (app Laravel). Tres servicos Modal deployados:

1. **TTSService** (Qwen3-TTS Base) -- voice cloning com ref audio, GPU snapshot, funcional
2. **VoiceDesignService** (Qwen3-TTS VoiceDesign) -- cria voz por descricao textual, deployado mas **0 bytes retornados** no teste
3. **VoiceAnalyzerService** (Qwen3-Omni Captioner) -- descreve voz de audio, deployado mas **nao testado**

Voice profiles do DB agora linkados ao volume Modal (`volume_filename` + `ref_text` preenchidos). UI de TTS e STT ganhou spinners com waveform, timer e fases. Audio convertido de WAV para OGG (compatibilidade browser Linux). Nada commitado.

## Arquivos principais

- `scripts/modal_tts_qwen_vllm_snap.py` -- TTSService + VoiceDesignService (mesmo deploy)
- `scripts/modal_voice_analyzer.py` -- VoiceAnalyzerService (deploy separado)
- `app/Livewire/PanelTts.php` -- componente TTS (synthesize, uploadVoice, WAV->OGG)
- `app/Livewire/PanelAtt.php` -- componente STT (+dispatch)
- `resources/views/livewire/panel-tts.blade.php` -- template com Alpine timer/waveform
- `resources/views/livewire/panel-att.blade.php` -- template com Alpine timer/waveform
- `resources/css/app.css` -- keyframes waveform e sweep
- `config/voice.php` -- config dos modelos (endpoints, volumes)
- `docs/contexto/24032026-tts-voice-pipeline-voicedesign-analyzer.md` -- contexto detalhado

## Proximos passos (por prioridade)

### 1. Commitar tudo
**Onde:** root do projeto
**O que:** 8 arquivos modificados + 1 criado, 445 insertions
**Por que:** nada foi commitado nesta sessao
**Verificar:**
```bash
php artisan test --filter=PanelTts  # 15/15 passando
npx vite build --config vite.config.laravel.ts  # build OK
```

### 2. Testar VoiceDesign (0 bytes)
**Onde:** Modal endpoint `voicedesignservice-web-design`
**O que:** re-executar curl com `--max-time 600`. Snapshot ja existe, restore deve ser <5s.
**Por que:** request nunca chegou ao handler no teste anterior (suspeita: gateway timeout durante cold start)
**Verificar:**
```bash
curl --max-time 600 -X POST https://pedrogiudice--tts-serve-vllm-voicedesignservice-web-design.modal.run \
  -F "text=Bom dia, como posso ajudar?" \
  -F "voice_instructions=Deep male voice, calm and professional tone" \
  -F "language=Portuguese" \
  -F "save_as=designed_male_calm" \
  -o /tmp/voicedesign_test.wav
file /tmp/voicedesign_test.wav  # deve ser audio/wav, nao empty/JSON
```

### 3. Testar VoiceAnalyzer (nunca testado)
**Onde:** Modal endpoint `voiceanalyzerservice-web-analyze`
**O que:** enviar audio de referencia e verificar descricao retornada
**Por que:** script deployado mas nunca validado end-to-end
**Verificar:**
```bash
curl --max-time 300 -X POST https://pedrogiudice--voice-analyzer-voiceanalyzerservice-web-analyze.modal.run \
  -F "audio=@storage/app/voice_profiles/ref_ptbr_male.wav" | python3 -m json.tool
# Espera: {"description": "...", "inference_time": N.N}
```

### 4. Limpar `designed_male_calm` invalido do volume
**Onde:** volume Modal `tts-voice-refs`
**O que:** deletar o WAV de 135 bytes (JSON de erro salvo como WAV)
**Por que:** arquivo corrompido que pode confundir o pipeline
**Verificar:**
```bash
modal volume rm tts-voice-refs designed_male_calm.wav
modal volume rm tts-voice-refs designed_male_calm.txt
modal volume ls tts-voice-refs
```

### 5. Teste end-to-end TTS via Laravel
**Onde:** `http://localhost:8001` ou Tailscale URL, painel TTS
**O que:** selecionar voz preset, digitar texto, clicar sintetizar, ouvir audio OGG no player
**Por que:** nunca testado end-to-end com os endpoints corrigidos
**Verificar:** audio reproduz no `<audio controls>`, spinners animam durante request

### 6. Melhorar visual dos spinners (baixa prioridade)
**Onde:** `panel-tts.blade.php`, `panel-att.blade.php`
**O que:** design mais sofisticado (usuario comentou "bem ruinzinhos")
**Por que:** estetica da UI

## Deploys ativos no Modal

| App | Classe | Endpoint |
|-----|--------|----------|
| tts-serve-vllm | TTSService | `ttsservice-web-synthesize` |
| tts-serve-vllm | VoiceDesignService | `voicedesignservice-web-design` |
| voice-analyzer | VoiceAnalyzerService | `voiceanalyzerservice-web-analyze` |

## Regra critica

**NUNCA executar comandos que acionem containers GPU no Modal** (curl contra endpoints, modal deploy, modal run). Pedir ao usuario ou passar o comando pronto.

## Como verificar

```bash
php artisan test --filter=PanelTts           # 15 tests, 30 assertions
npx vite build --config vite.config.laravel.ts  # CSS com keyframes
git status                                   # 8 modified + 1 untracked
```
