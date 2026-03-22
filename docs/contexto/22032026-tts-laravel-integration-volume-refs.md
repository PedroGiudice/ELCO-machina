# Contexto: TTS Laravel Integration + Volume Refs

**Data:** 2026-03-22
**Sessao:** main (continuacao da sessao tts-vllm-omni-optimization)
**Commit:** 2b113a89

---

## O que foi feito

### 1. Fix ref_text obrigatorio no vLLM-Omni

Erro fatal: `ValueError: Base in-context voice cloning requires ref_text or tokenized ref_ids`.
O modelo Base exige `ref_text` (transcricao do audio de referencia) alem de `ref_audio`.

Fix: companion `.txt` no volume. Script procura `ref_ptbr_male.txt` automaticamente
ao lado de `ref_ptbr_male.wav`. Se nao encontra, retorna 400 com mensagem clara.

Transcricao obtida via Whisper HTTP: "O crescimento ocorreu em todos os setores, alguns mais do que outros."

### 2. Refatoracao TtsService para volume paths

Removido base64 do fluxo Qwen. `TtsService::synthesize()` agora envia `ref_audio_path`
(nome do arquivo no volume Modal) + `ref_text` obrigatorio.

Upload para volume via `Process::run('modal volume put ...')` -- sem endpoint HTTP custom.

### 3. Migration ref_text + volume_filename

Nova migration: `ref_text` (text, nullable) e `volume_filename` (string, nullable)
na tabela `voice_profiles`. VoiceProfile fillable atualizado.

### 4. PanelTts atualizado

- Upload de voz exige `ref_text` (textarea obrigatorio)
- `uploadVoice()` chama `TtsService::uploadVoiceToVolume()` via `modal volume put`
- `synthesize()` usa `volume_filename` e `ref_text` do VoiceProfile
- 15 testes passando (30 assertions)

### 5. Investigacao de modelos TTS

| Modelo | Clonagem | Controle de tom | PT-BR | Status |
|--------|----------|-----------------|-------|--------|
| Qwen3-TTS Base (deployado) | Sim | Nao | Sim | Producao |
| Qwen3-TTS CustomVoice | Nao | Sim (instructions) | Sim | Nao deployado |
| Qwen3-TTS VoiceDesign | Nao | Sim (descricao) | Sim | Nao deployado |
| Chatterbox Multilingual (deployado) | Sim | Parcial (exaggeration + cfg_weight) | Sim (estavel) | Producao |
| IndexTTS-2 | Sim | Sim (8 eixos) | ? | Nao testado |
| chatterbox-vllm | Sim | Exaggeration | Degradado | vLLM 0.10.0, incompativel |

Decisao: Chatterbox ja faz clonagem + expressividade em PT-BR. Os tres Qwen sao
mutuamente exclusivos (Base, CustomVoice, VoiceDesign). Combinacao possivel via
pipeline (VoiceDesign gera ref -> Base clona), mas nao num unico request.

## Estado dos arquivos

| Arquivo | Status | Detalhe |
|---------|--------|---------|
| `scripts/modal_tts_qwen_vllm_snap.py` | Criado | GPU snapshot, companion .txt |
| `app/Services/TtsService.php` | Modificado | Volume paths, uploadVoiceToVolume via Process |
| `app/Livewire/PanelTts.php` | Modificado | ref_text obrigatorio, volume_filename |
| `app/Models/VoiceProfile.php` | Modificado | +ref_text, +volume_filename no fillable |
| `config/voice.php` | Modificado | qwen-tts: H100, volume key, script atualizado |
| `resources/views/livewire/panel-tts.blade.php` | Modificado | Textarea ref_text, voice cards com texto |
| `tests/Feature/Livewire/PanelTtsTest.php` | Modificado | 15 testes, cobertura volume + ref_text |
| `database/migrations/..._add_ref_text_and_volume_filename...` | Criado | Migration executada |
| `docs/ref_ptbr_male.txt` | Criado | Transcricao do audio de referencia |

## Commits desta sessao

```
2b113a89 feat(tts): vLLM-Omni snap deployment + volume-based voice refs + ref_text
```

## Decisoes tomadas

- **Volume path em vez de base64**: audio de referencia fica no volume Modal, Laravel envia so o filename. Motivo: performance, sem bloat HTTP. Descartado: endpoint HTTP custom de upload (over-engineering).
- **`modal volume put` via Process::run**: Laravel executa CLI diretamente. Motivo: simples, sem redeploy. Descartado: endpoint `upload_voice` no Modal.
- **Chatterbox como TTS principal para expressividade**: exaggeration + cfg_weight em PT-BR. Motivo: ja deployado, funcional, multilingual estavel. Descartado: IndexTTS-2 (nao testado), chatterbox-vllm (vLLM 0.10.0 incompativel).
- **Qwen Base para clonagem fiel**: quando a prioridade e copiar a voz, nao modular tom. Descartado: combinar clonagem + tom (impossivel num unico modelo Qwen).

## Metricas

| Metrica | Valor |
|---------|-------|
| vLLM-Omni snap cold start | ~1s (restore) |
| vLLM-Omni inferencia (32 chars) | ~28-32s, 2.8s audio |
| Content-type output | audio/wav, PCM 16-bit 24kHz |
| Tamanho output | 134KB para 2.8s |
| Testes PanelTts | 15 passando (0.52s) |

## Pendencias identificadas

1. **Definir params Chatterbox na UI** (alta) -- quais controles expor: exaggeration slider ja existe, cfg_weight existe, falta label/tooltip explicativo e valores default otimizados pra PT-BR
2. **cfg_weight=0 para PT-BR** (alta) -- testar se minimiza sotaque americano do Chatterbox em PT-BR
3. **VoiceDesign para criacao de refs** (media) -- deploy pontual para gerar audios de referencia sem microfone
4. **Setar .env endpoints** (alta) -- `QWEN_TTS_ENDPOINT` e `QWEN_TTS_HEALTH` no .env de producao
5. **UI responsiva mobile** (media) -- layout panel-tts quebrado em telas pequenas
6. **Segundo request vLLM-Omni** (baixa) -- testar latencia de requests subsequentes (warmup)
7. **SESSION_SECURE_COOKIE vs HTTP** (alta) -- app inacessivel via HTTP puro (419), acesso so via HTTPS Tailscale
