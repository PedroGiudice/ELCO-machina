#!/usr/bin/env python3
"""Voice Analyzer via Qwen3-Omni Captioner no Modal (H100 GPU).

Analyzes voice characteristics from audio input.
Returns detailed text description of the speaker's voice.

Deploy:   modal deploy scripts/modal_voice_analyzer.py
Analyze:  curl -X POST https://<url>/web_analyze -F "audio=@voice.wav"
"""

import os
import time

import fastapi
import modal

APP_NAME = "voice-analyzer"
MODEL_NAME = "Qwen/Qwen3-Omni-30B-A3B-Captioner"
GPU_TYPE = "H100"
VOICE_REFS_PATH = "/voice-refs"

app = modal.App(
    APP_NAME, tags={"project": "elco-machina", "model": "qwen3-omni-captioner"}
)
hf_secret = modal.Secret.from_name("huggingface-secret")
voice_refs_vol = modal.Volume.from_name("tts-voice-refs", create_if_missing=True)


def build_image():
    """Download Qwen3-Omni Captioner weights."""
    from huggingface_hub import snapshot_download

    snapshot_download(MODEL_NAME)


image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "torch",
        "torchvision",
        "transformers>=4.52.0",
        "accelerate",
        "qwen-omni-utils",
        "soundfile",
        "numpy",
        "fastapi[standard]",
    )
    .run_function(build_image, secrets=[hf_secret])
)


@app.cls(
    image=image,
    gpu=GPU_TYPE,
    memory=32768,
    timeout=600,
    secrets=[hf_secret],
    volumes={VOICE_REFS_PATH: voice_refs_vol},
    enable_memory_snapshot=True,
    scaledown_window=15,
)
class VoiceAnalyzerService:
    @modal.enter(snap=True)
    def load(self):
        import logging

        import torch
        from transformers import Qwen3OmniMoeForConditionalGeneration, Qwen3OmniMoeProcessor

        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )
        self.logger = logging.getLogger("voice-analyzer")
        self.logger.info("Loading Qwen3-Omni Captioner...")

        self.model = Qwen3OmniMoeForConditionalGeneration.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.bfloat16,
            device_map="auto",
            attn_implementation="sdpa",
        )
        self.processor = Qwen3OmniMoeProcessor.from_pretrained(MODEL_NAME)
        self.logger.info("Captioner loaded — snapshot point.")

    @modal.enter(snap=False)
    def restore(self):
        import logging

        if not hasattr(self, "logger"):
            logging.basicConfig(
                level=logging.INFO,
                format="%(asctime)s - %(levelname)s - %(message)s",
            )
            self.logger = logging.getLogger("voice-analyzer")

        self.logger.info("Restored from snapshot.")

    @modal.fastapi_endpoint(method="POST")
    async def web_analyze(
        self,
        audio: fastapi.UploadFile = fastapi.File(...),
    ) -> fastapi.responses.JSONResponse:
        """Analyze voice characteristics from an audio file.

        Returns a detailed text description of the voice.
        """
        import tempfile

        from qwen_omni_utils import process_mm_info

        t0 = time.perf_counter()

        try:
            audio_bytes = await audio.read()
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            conversation = [
                {
                    "role": "user",
                    "content": [{"type": "audio", "audio": tmp_path}],
                },
            ]

            text = self.processor.apply_chat_template(
                conversation,
                add_generation_prompt=True,
                tokenize=False,
            )
            audios, _, _ = process_mm_info(conversation, use_audio_in_video=False)
            inputs = self.processor(
                text=text,
                audio=audios,
                return_tensors="pt",
                padding=True,
                use_audio_in_video=False,
            )
            inputs = inputs.to(self.model.device).to(self.model.dtype)

            text_ids, _ = self.model.generate(
                **inputs,
                thinker_return_dict_in_generate=True,
            )

            caption = self.processor.batch_decode(
                text_ids.sequences[:, inputs["input_ids"].shape[1]:],
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            )

            os.unlink(tmp_path)
            elapsed = time.perf_counter() - t0

            description = caption[0] if caption else ""
            self.logger.info(
                "[Analyzer] %.1fs -> '%s'",
                elapsed, description[:100],
            )

            return fastapi.responses.JSONResponse({
                "description": description,
                "inference_time": round(elapsed, 2),
            })

        except Exception as e:
            self.logger.error("[Analyzer] Error: %s", e)
            return fastapi.responses.JSONResponse(
                {"error": str(e)}, status_code=500,
            )
