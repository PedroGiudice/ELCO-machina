# Retomada: TTS Laravel Integration - UI e Finalizacao

## Contexto rapido

TTS funcional com dois modelos deployados no Modal: Qwen3-TTS Base (H100, vLLM-Omni
com GPU snapshot) para voice cloning, e Chatterbox Multilingual (A10G) para clonagem +
expressividade. Laravel integrado via TtsService com volume paths (sem base64).

Chatterbox e o modelo mais adequado para PT-BR com controle de tom: `exaggeration`
(0.25-2.0) modula intensidade emocional, `cfg_weight` (0.0-1.0) controla aderencia ao
sotaque do ref audio (0 = minimiza sotaque). Ambos ja expostos na UI como sliders.

Sessao anterior focou em: fix ref_text no vLLM-Omni, refatoracao do TtsService para
volume paths, investigacao de modelos alternativos. Conclusao: stack atual (Qwen + Chatterbox)
e suficiente, desde que os params do Chatterbox sejam bem configurados na UI.

App acessivel via `https://extractlab.cormorant-alpha.ts.net:8444` (HTTPS Tailscale).
HTTP puro (porta 8001) retorna 419 por SESSION_SECURE_COOKIE=true.

## Arquivos principais

- `app/Services/TtsService.php` -- synthesize() e uploadVoiceToVolume()
- `app/Livewire/PanelTts.php` -- componente Livewire de TTS
- `resources/views/livewire/panel-tts.blade.php` -- UI do painel TTS
- `config/voice.php` -- endpoints, volumes, modelos
- `scripts/modal_tts_qwen_vllm_snap.py` -- Qwen vLLM-Omni no Modal
- `scripts/modal_tts_chatterbox.py` -- Chatterbox no Modal
- `docs/contexto/22032026-tts-laravel-integration-volume-refs.md` -- contexto detalhado

## Proximos passos (por prioridade)

### 1. Setar endpoints no .env
**Onde:** `.env`
**O que:** Adicionar `QWEN_TTS_ENDPOINT`, `QWEN_TTS_HEALTH` com URLs do Modal
**Por que:** TtsService depende desses valores para funcionar
**Verificar:** `php artisan tinker --execute="dump(config('voice.models.qwen-tts.endpoint'))"`

### 2. Testar Chatterbox com cfg_weight=0 em PT-BR
**Onde:** UI em `https://extractlab.cormorant-alpha.ts.net:8444` ou curl direto
**O que:** Gerar audio PT-BR com cfg_weight=0 e exaggeration=0.7 para minimizar sotaque americano
**Por que:** Sessao anterior identificou sotaque americano no Chatterbox; docs oficiais recomendam cfg_weight=0 para minimizar
**Verificar:** Ouvir o audio gerado e comparar com cfg_weight=0.5 (default)

### 3. Definir labels e defaults dos params Chatterbox na UI
**Onde:** `resources/views/livewire/panel-tts.blade.php`, secao de parametros chatterbox
**O que:** Melhorar tooltips/labels dos sliders. Considerar defaults otimizados pra PT-BR (cfg_weight mais baixo)
**Por que:** Usuario precisa entender o que cada slider faz sem documentacao externa
**Verificar:** Verificacao visual na UI

### 4. UI responsiva mobile
**Onde:** `resources/views/livewire/panel-tts.blade.php`
**O que:** Ajustar layout para telas pequenas (celular). Grid 2-col vira stack, fontes adequadas
**Por que:** App sera usado no celular via Chrome/Tailscale, layout atual quebra
**Verificar:** Chrome DevTools mobile view ou acesso real pelo celular

### 5. VoiceDesign para criacao de refs (futuro)
**Onde:** Novo script Modal (nao criado ainda)
**O que:** Deploy pontual de Qwen3-TTS-12Hz-1.7B-VoiceDesign para gerar audios de referencia via descricao textual
**Por que:** Elimina necessidade de microfone para criar perfis de voz
**Verificar:** Gerar audio, salvar no volume, usar como ref no Base

## Como verificar

```bash
# Testes Laravel
php artisan test --filter=PanelTts

# Servico rodando
systemctl --user status elco-machina

# Acesso HTTPS
curl -s -o /dev/null -w "%{http_code}" https://extractlab.cormorant-alpha.ts.net:8444

# Endpoints configurados
php artisan tinker --execute="dump(config('voice.models.qwen-tts.endpoint'), config('voice.models.chatterbox.endpoint'))"

# Teste TTS Chatterbox direto
curl -X POST https://pedrogiudice--tts-chatterbox-ttsservice-web-synthesize.modal.run \
  -F "text=Teste de voz em portugues." \
  -F "exaggeration=0.7" \
  -F "cfg_weight=0.0" \
  -F "language=pt" \
  -o /tmp/chatterbox_test.wav && file /tmp/chatterbox_test.wav
```

<session_metadata>
branch: main
last_commit: 2b113a89
pending_tests: 0 (15/15 passing)
models_deployed: qwen-tts (tts-serve-vllm), chatterbox (tts-chatterbox)
access_url: https://extractlab.cormorant-alpha.ts.net:8444
blocker: .env endpoints not set
</session_metadata>
