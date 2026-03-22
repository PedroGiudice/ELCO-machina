#!/usr/bin/env python3
"""Test Chatterbox-Multilingual TTS synthesis endpoint."""
import base64
import requests

REF_AUDIO = "chatterbox-tts-voices/chatterbox-tts-voices/prompts/Brian.wav"
ENDPOINT = "https://pedrogiudice--tts-chatterbox-ttsservice-web-synthesize.modal.run"
OUTPUT = "/tmp/tts_test_chatterbox.wav"

with open(REF_AUDIO, "rb") as f:
    ref_b64 = base64.b64encode(f.read()).decode()

r = requests.post(
    ENDPOINT,
    data={
        "text": "Olá, esta é uma demonstração do sistema de síntese de voz por clonagem.",
        "ref_audio_base64": ref_b64,
        "language": "pt",
    },
    timeout=120,
)

print(f"Status: {r.status_code}")
print(f"Inference: {r.headers.get('X-Inference-Time')}s, Duration: {r.headers.get('X-Audio-Duration')}s")

if r.status_code == 200:
    with open(OUTPUT, "wb") as f:
        f.write(r.content)
    print(f"Saved {OUTPUT} ({len(r.content)} bytes)")
else:
    print(f"Error: {r.text[:500]}")
