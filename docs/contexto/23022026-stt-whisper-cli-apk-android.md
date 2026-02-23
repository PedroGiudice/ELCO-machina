# Contexto: STT whisper.cpp CLI + APK Android + Editor Fix

**Data:** 2026-02-23
**Sessao:** work/session-20260223-061009
**Duracao:** ~2h

---

## O que foi feito

### 1. Reescrita do stt_service.py para whisper.cpp CLI

O stt_service.py usava faster-whisper (CTranslate2) com large-v3-turbo como fallback quando whisper-server HTTP nao estava disponivel. Isso contradiz a decisao documentada em `docs/contexto/23022026-stt-benchmark-final-refiner.md`:

- **Engine:** whisper.cpp CLI via subprocess (2x mais rapido que server HTTP)
- **Modelo default:** small q5_1 (190MB, RTF ~0.44)
- **Sem --prompt, sem VAD**

Reescrito completamente:
- Removido: faster-whisper, whisper-server HTTP, imports de httpx/numpy/soundfile
- Adicionado: chamada a `/home/opc/.local/share/whisper.cpp/whisper-cli` via subprocess
- Output JSON parseado do formato whisper.cpp (offsets.from/to em ms)
- Dois modelos disponiveis: `small` (default, q5_1) e `large-v3-turbo` (q5_0)
- Config via env: `WHISPER_CLI`, `WHISPER_MODELS_DIR`, `WHISPER_DEFAULT_MODEL`, `WHISPER_THREADS`, `WHISPER_TIMEOUT`

**Bug encontrado durante teste:** `libwhisper.so.1` nao encontrada pelo whisper-cli quando executado via uvicorn. A lib mora em `/tmp/whisper.cpp/build/src/` (compilada mas nao instalada). Solucao: iniciar sidecar com `LD_LIBRARY_PATH=/tmp/whisper.cpp/build/src:/tmp/whisper.cpp/build/ggml/src`.

**Pendencia critica:** as libs em `/tmp/` serao perdidas em reboot. Precisam ser copiadas para `/usr/local/lib/` ou `~/.local/lib/` e rodar `ldconfig`.

### 2. Build APK Android e instalacao via ADB

- Build: `cargo tauri android build --apk` na Contabo
- APK unsigned: 70MB em `src-tauri/gen/android/app/build/outputs/apk/universal/release/`
- Assinatura: `zipalign` + `apksigner` com `proatt.keystore` (senha: `proatt123`)
- Celular rejeitou por assinatura incompativel com versao anterior — necessario `adb uninstall com.proatt.machine` antes
- Instalado com sucesso via cmr-auto (PC Linux) como ponte ADB USB

### 3. Teste end-to-end: celular -> sidecar -> whisper-cli -> Claude refiner

Pipeline completo testado:
- App no Galaxy S24 Ultra grava audio
- Envia POST para `http://100.123.73.128:8765/transcribe` via Tailscale
- Sidecar recebe, converte para WAV 16kHz via ffmpeg, transcreve com whisper-cli small
- Refina via Claude CLI headless (sonnet)
- Retorna 200 OK ao app

Log confirmado:
```
07:05:16 [stt_service] INFO: Transcrevendo 34.2s com whisper-cli 'small'...
07:05:58 [refiner] INFO: Refinamento concluido via claude/sonnet
100.84.227.100 - "POST /transcribe HTTP/1.1" 200 OK
```

### 4. Fix editor height (uncommitted)

O textarea do Editor nao expandia no mobile — `flex-1` nao funciona quando o container pai tem `overflow-y-auto`. Fix em `AppLayout.tsx`: quando `activePanel === 'editor'`, usar `overflow-hidden` e `h-full` em vez de `overflow-y-auto` e `min-h-full pb-32`.

### 5. Limpeza de teams/tasks orfaos

Removidos 65 task directories e 1 team (`claude-refiner-integration`) orfaos de sessao anterior que travou.

## Estado dos arquivos

| Arquivo | Status |
|---------|--------|
| `sidecar/voice_ai/services/stt_service.py` | Reescrito - whisper.cpp CLI subprocess |
| `src/components/layout/AppLayout.tsx` | Modificado (uncommitted) - fix editor height mobile |
| `CLAUDE.md` | Modificado (uncommitted) - limpeza menor |

## Commits desta sessao

```
a51f5d77 refactor(stt): migrar para whisper.cpp CLI subprocess
```

## Pendencias identificadas

1. **Instalar libwhisper.so permanentemente** (alta) -- libs em `/tmp/whisper.cpp/build/` serao perdidas em reboot. Copiar para `~/.local/lib/` e configurar `ldconfig` ou `LD_LIBRARY_PATH` no systemd service
2. **Commitar AppLayout.tsx** (alta) -- fix do editor height esta uncommitted
3. **Rebuildar APK com fix do editor** (alta) -- o APK instalado nao tem o fix
4. **Atualizar voice-ai.service** (alta) -- systemd service antigo ainda usa o stt_service anterior. Precisa: (a) apontar pro novo sidecar, (b) adicionar `LD_LIBRARY_PATH`, (c) mudar porta para 8765
5. **Dropdown de modelo STT no frontend** (media) -- decisao documentada: usuario escolhe entre small/large-v3-turbo. Backend ja aceita `stt_model` no request. Frontend nao tem UI
6. **Mergear branch na main** (media) -- `work/session-20260223-061009` tem 1 commit ahead
7. **Remover faster-whisper do requirements.txt** (baixa) -- nao e mais usado pelo stt_service

## Decisoes tomadas

- **whisper.cpp CLI > faster-whisper**: alinhamento com benchmark documentado (RTF 0.346 vs ~1.2)
- **Porta 8765**: manter default do app em vez de mudar pra 8420 (zero mudancas frontend)
- **APK unsigned nao instala**: Galaxy S24 rejeita. Assinatura obrigatoria com apksigner
- **ADB via USB no cmr-auto**: mais confiavel que ADB wireless via Tailscale
