#!/usr/bin/env python3
"""VoiceDesign client — calls Modal SDK to generate voice from text description.

Usage:
    python3 scripts/voicedesign_client.py \
        --text "Bom dia, como posso ajudar?" \
        --voice-instructions "Deep male voice, calm and professional tone" \
        --language Portuguese \
        --output /tmp/designed_voice.wav \
        --save-as designed_male_calm

Exit codes: 0 = success, 1 = error.
Stdout: JSON metadata (no audio_bytes).
"""

import argparse
import base64
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="VoiceDesign via Modal SDK")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument(
        "--voice-instructions",
        required=True,
        help="Voice description (e.g. 'Deep male voice, calm tone')",
    )
    parser.add_argument("--language", default="Portuguese", help="Language (default: Portuguese)")
    parser.add_argument("--save-as", default="", help="Save to Modal volume as this name")
    parser.add_argument("--output", required=True, help="Local path to save WAV output")
    args = parser.parse_args()

    try:
        import modal

        VoiceDesignService = modal.Cls.from_name("tts-serve-vllm", "VoiceDesignService")
        svc = VoiceDesignService()

        result = svc.design.remote(
            text=args.text,
            voice_instructions=args.voice_instructions,
            language=args.language,
            save_as=args.save_as,
        )
    except Exception as e:
        print(json.dumps({"error": str(e), "status": 500}), flush=True)
        return 1

    if "error" in result:
        print(json.dumps({"error": result["error"], "status": result.get("status", 500)}), flush=True)
        return 1

    # Decode base64 audio and write to output path
    try:
        audio_bytes = base64.b64decode(result["audio_bytes"])
        with open(args.output, "wb") as f:
            f.write(audio_bytes)
    except Exception as e:
        print(json.dumps({"error": f"Failed to write output: {e}", "status": 500}), flush=True)
        return 1

    # Print metadata (without audio_bytes) as JSON to stdout
    metadata = {
        "inference_time": result.get("inference_time", 0),
        "duration": result.get("duration", 0),
        "sample_rate": result.get("sample_rate", 24000),
        "saved_as": result.get("saved_as", ""),
        "size": result.get("size", 0),
        "output_file": args.output,
    }
    print(json.dumps(metadata), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
