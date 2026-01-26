# Contexto de Sessao: ELCO-MACHINA

## Resumo Executivo

Aplicativo Tauri para transcricao de voz com modelo local (Faster-Whisper). Funciona 100% offline. Util para dictar prompts e notas sem depender de APIs externas.

## Estado Atual

| Componente | Status |
|------------|--------|
| App Tauri | Codigo pronto |
| Sidecar Python | INSTALADO e funcional |
| Faster-Whisper | Instalado (modelo baixa na 1a execucao) |
| ffmpeg | Instalado (/usr/local/bin) |

## Stack Tecnologico

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19 + TypeScript + Vite |
| Desktop | Tauri 2.9.5 |
| Audio Backend | FastAPI + Faster-Whisper |
| Processamento | Web Audio API + MediaRecorder |

## Estrutura do Projeto

```
ELCO-machina/
├── App.tsx              # Componente principal (2718 linhas)
├── src/
│   └── services/
│       └── VoiceAIClient.ts  # Cliente do sidecar
├── src-tauri/           # Backend Rust
│   ├── tauri.conf.json
│   └── src/lib.rs
├── sidecar/             # Backend Python
│   ├── voice_ai/
│   │   ├── main.py      # FastAPI (porta 8765)
│   │   └── services/
│   │       ├── stt_service.py    # Faster-Whisper
│   │       └── refiner.py        # Gemini (opcional)
│   ├── .venv/           # Venv Python (instalado)
│   └── requirements.txt
└── package.json
```

## Fluxo de Transcricao

```
[Microfone] → MediaRecorder → Blob WebM
     ↓
Base64 encode
     ↓
HTTP POST → Sidecar (localhost:8765)
     ↓
Faster-Whisper (local, GPU opcional)
     ↓
Transcricao + metadados
     ↓
Refinamento opcional (Gemini)
     ↓
IndexedDB + UI
```

## Modelo de Audio

- **Tecnologia:** Faster-Whisper v1.0.3 (CTranslate2)
- **Modelo padrao:** Medium (1.5 GB)
- **Configuracao:** Auto-detect GPU (CUDA) ou CPU
- **VAD:** Habilitado (remove silencios)

## Como Usar

### Terminal 1: Sidecar
```bash
cd ~/ELCO-machina/sidecar
source .venv/bin/activate
uvicorn voice_ai.main:app --host 127.0.0.1 --port 8765
```

### Terminal 2: Frontend
```bash
cd ~/ELCO-machina
bun run dev
# Abrir http://localhost:3000
```

### Testar Health Check
```bash
curl http://localhost:8765/health | jq
```

## Endpoints da API

| Endpoint | Metodo | Funcao |
|----------|--------|--------|
| `/health` | GET | Status do sidecar |
| `/transcribe` | POST | Transcricao de audio |
| `/` | GET | Info basica |

### Exemplo de Transcricao
```bash
curl -X POST http://localhost:8765/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "audio": "BASE64_AUDIO",
    "format": "webm",
    "language": "pt"
  }'
```

## Estilos de Output

O app suporta diferentes estilos de transcricao:
- `verbatim` - Exatamente como falado
- `elegant_prose` - Prosa elegante
- `formal` - Linguagem formal
- `casual` - Linguagem casual
- `prompt` - Formatado como prompt
- `bullet_points` - Lista de pontos
- `summary` - Resumo

## Configuracao Opcional

### Gemini (para refinamento)
```bash
echo "GEMINI_API_KEY=sua_chave" > ~/ELCO-machina/.env.local
```

Sem a chave, o app funciona 100% offline usando apenas Faster-Whisper.

## Notas Importantes

1. **Primeiro uso:** Modelo Whisper (~1.5GB) sera baixado automaticamente
2. **RAM:** Recomendado 4GB+ para modelo medium
3. **GPU:** Opcional mas acelera significativamente
4. **Cache:** Modelos ficam em `~/.cache/huggingface/`

## Proximos Passos

1. Build completo: `bun run tauri build`
2. Testar com audio real
3. Ajustar estilos de output conforme necessidade
