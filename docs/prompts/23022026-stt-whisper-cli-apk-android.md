# Retomada: STT whisper.cpp CLI + Editor Fix + Deploy

## Contexto rapido

O stt_service.py foi reescrito para usar whisper.cpp CLI via subprocess (modelo small q5_1, 190MB). O pipeline completo funciona: celular grava audio -> sidecar transcreve com whisper-cli -> refina com Claude sonnet headless -> retorna ao app. O APK foi buildado, assinado e instalado no Galaxy S24 via ADB.

Ha 3 pendencias imediatas: (1) o fix do editor height no mobile esta uncommitted, (2) o APK instalado nao tem esse fix, (3) as shared libs do whisper-cli estao em /tmp/ e serao perdidas em reboot.

## Arquivos principais

- `sidecar/voice_ai/services/stt_service.py` -- STT via whisper.cpp CLI (reescrito nesta sessao)
- `sidecar/voice_ai/services/refiner.py` -- ClaudeRefiner via subprocess `claude -p`
- `src/components/layout/AppLayout.tsx` -- fix editor height (uncommitted)
- `src/components/editor/Editor.tsx` -- componente do editor de texto
- `docs/contexto/23022026-stt-whisper-cli-apk-android.md` -- contexto detalhado desta sessao
- `docs/contexto/23022026-stt-benchmark-final-refiner.md` -- decisoes do benchmark STT

## Proximos passos (por prioridade)

### 1. Instalar libwhisper.so permanentemente
**Onde:** `/tmp/whisper.cpp/build/src/libwhisper.so.1` e `/tmp/whisper.cpp/build/ggml/src/libggml*.so.0`
**O que:** Copiar para `~/.local/lib/` ou `/usr/local/lib/`, rodar `sudo ldconfig`
**Por que:** `/tmp/` e limpo em reboot, o sidecar quebrara
**Verificar:**
```bash
# Sem LD_LIBRARY_PATH, deve encontrar as libs
ldd ~/.local/share/whisper.cpp/whisper-cli | grep "not found"
# Deve retornar vazio
```

### 2. Commitar fix do editor e rebuildar APK
**Onde:** `src/components/layout/AppLayout.tsx`
**O que:** Commit da mudanca + `cargo tauri android build --apk` + assinar + instalar
**Por que:** O textarea do Editor nao expande no mobile, usuario reportou
**Verificar:**
```bash
cd /home/opc/ELCO-machina
git add src/components/layout/AppLayout.tsx
git commit -m "fix(editor): expandir textarea no mobile (overflow-hidden quando ativo)"
cargo tauri android build --apk
# Assinar:
ZIPALIGN=~/Android/Sdk/build-tools/35.0.0/zipalign
APKSIGNER=~/Android/Sdk/build-tools/35.0.0/apksigner
$ZIPALIGN -f 4 src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk /tmp/proatt-aligned.apk
$APKSIGNER sign --ks proatt.keystore --ks-pass pass:proatt123 --out /tmp/proatt-signed.apk /tmp/proatt-aligned.apk
# Instalar (celular conectado via USB no cmr-auto):
scp /tmp/proatt-signed.apk cmr-auto@100.102.249.9:/tmp/proatt.apk
ssh cmr-auto@100.102.249.9 "adb install -r /tmp/proatt.apk"
```

### 3. Atualizar voice-ai.service no systemd
**Onde:** `/etc/systemd/system/voice-ai.service` ou `~/.config/systemd/user/`
**O que:** Apontar para o sidecar com novo stt_service, adicionar `Environment=LD_LIBRARY_PATH=...`, porta 8765
**Por que:** O service antigo ainda usa faster-whisper + whisper-server
**Verificar:**
```bash
sudo systemctl restart voice-ai
curl -s http://localhost:8765/health | jq '.models.whisper'
# Deve mostrar: {"status":"loaded","backend":"whisper-cli","model":"small"}
```

### 4. Mergear branch na main
**Onde:** branch `work/session-20260223-061009`
**O que:** Merge ou rebase na main (1 commit: stt_service rewrite)
**Verificar:**
```bash
git checkout main && git merge work/session-20260223-061009
```

### 5. Dropdown de modelo STT no frontend
**Onde:** `src/components/panels/PanelConfig.tsx`
**O que:** Adicionar selector small / large-v3-turbo. Backend ja aceita campo `stt_model` no TranscribeRequest
**Por que:** Decisao documentada — usuario escolhe modelo conforme necessidade (velocidade vs qualidade)

### 6. Remover faster-whisper do requirements.txt
**Onde:** `sidecar/requirements.txt`
**O que:** Remover `faster-whisper==1.2.1` (nao mais usado)

## Como verificar

```bash
# Sidecar rodando com novo STT
LD_LIBRARY_PATH=/tmp/whisper.cpp/build/src:/tmp/whisper.cpp/build/ggml/src \
  cd /home/opc/ELCO-machina/sidecar && .venv/bin/uvicorn voice_ai.main:app --host 0.0.0.0 --port 8765

# Health check
curl -s http://localhost:8765/health | python3 -m json.tool

# Teste STT direto
cd /home/opc/ELCO-machina/sidecar && .venv/bin/python -c "
import base64
from voice_ai.services.stt_service import STTService
with open('/home/opc/.claude/audio-teste.wav', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
svc = STTService()
result = svc.transcribe(b64, format='wav', language='pt')
print(result.text[:200])
"

# ADB no celular (via cmr-auto)
ssh cmr-auto@100.102.249.9 "adb devices"
ssh cmr-auto@100.102.249.9 "adb logcat -d | grep pro_att_machine_lib | tail -10"
```
