#!/usr/bin/env python3
"""Test VoiceDesign via Modal SDK (bypass HTTP gateway)."""

import base64
import modal

VoiceDesignService = modal.Cls.from_name("tts-serve-vllm", "VoiceDesignService")

svc = VoiceDesignService()
result = svc.design.remote(
    text="Bom dia, como posso ajudar?",
    voice_instructions="Deep male voice, calm and professional tone",
    language="Portuguese",
    save_as="designed_male_calm",
)

print(f"Result keys: {list(result.keys())}")

if "error" in result:
    print(f"Error: {result['error']}")
else:
    print(f"Duration: {result['duration']}s")
    print(f"Inference: {result['inference_time']}s")
    print(f"Size: {result['size']} bytes")
    print(f"Saved as: {result.get('saved_as', 'N/A')}")

    audio = base64.b64decode(result["audio_bytes"])
    with open("/tmp/voicedesign_test.wav", "wb") as f:
        f.write(audio)
    print(f"Written to /tmp/voicedesign_test.wav ({len(audio)} bytes)")
