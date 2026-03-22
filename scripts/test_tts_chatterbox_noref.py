#!/usr/bin/env python3
"""Test Chatterbox-Multilingual TTS without reference audio (default voice)."""
import requests

ENDPOINT = "https://pedrogiudice--tts-chatterbox-ttsservice-web-synthesize.modal.run"
OUTPUT = "/tmp/tts_chatterbox_noref.wav"

r = requests.post(
    ENDPOINT,
    data={
        "text": "A necessidade de modelos especializados em português brasileiro advém das complexidades fonéticas inerentes ao idioma.",
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
