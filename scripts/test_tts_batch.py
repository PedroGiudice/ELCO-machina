#!/usr/bin/env python3
"""Test TTS with multiple voices on both models."""
import base64
import requests
import sys

VOICES = {
    "Lucy": "chatterbox-tts-voices/chatterbox-tts-voices/prompts/Lucy.wav",
    "Marisol": "chatterbox-tts-voices/chatterbox-tts-voices/prompts/Marisol.wav",
    "Brian": "chatterbox-tts-voices/chatterbox-tts-voices/prompts/Brian.wav",
    "ptbr_male": "docs/ref_ptbr_male.wav",
    "ptbr_male2": "docs/ref_ptbr_male2.wav",
}

ENDPOINTS = {
    "chatterbox": "https://pedrogiudice--tts-chatterbox-ttsservice-web-synthesize.modal.run",
    "qwen": "https://pedrogiudice--tts-serve-ttsservice-web-synthesize.modal.run",
}

TEXT = "Olá, esta é uma demonstração do sistema de síntese de voz por clonagem."

voice = sys.argv[1] if len(sys.argv) > 1 else "Lucy"
model = sys.argv[2] if len(sys.argv) > 2 else "chatterbox"

ref_path = VOICES[voice]
endpoint = ENDPOINTS[model]

with open(ref_path, "rb") as f:
    ref_b64 = base64.b64encode(f.read()).decode()

data = {"text": TEXT, "ref_audio_base64": ref_b64}
if model == "chatterbox":
    data["language"] = "pt"
else:
    data["language"] = "Portuguese"

print(f"Testing {model} with {voice}...")
r = requests.post(endpoint, data=data, timeout=180)

print(f"Status: {r.status_code}")
print(f"Inference: {r.headers.get('X-Inference-Time')}s, Duration: {r.headers.get('X-Audio-Duration')}s")

output = f"/tmp/tts_{voice.lower()}_{model}.wav"
if r.status_code == 200:
    with open(output, "wb") as f:
        f.write(r.content)
    print(f"Saved {output} ({len(r.content)} bytes)")
else:
    print(f"Error: {r.text[:500]}")
