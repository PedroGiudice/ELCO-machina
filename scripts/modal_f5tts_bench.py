"""Modal F5-TTS Benchmark - voice cloning zero-shot na L4.

F5-TTS v1 Base: 335M params, ~1.4GB (modelo + vocoder Vocos).
Audio 24kHz. Clonagem zero-shot com ~10-15s de referencia.

Teste:
    modal run scripts/modal_f5tts_bench.py --text "Texto para sintetizar"

Com audio de referencia customizado:
    modal run scripts/modal_f5tts_bench.py --ref-audio ref.wav --ref-text "Transcricao do audio" --text "Texto"
"""

import time

import modal

app = modal.App("f5tts-bench")

hf_secret = modal.Secret.from_name("huggingface-secret")

# VRAM estimate:
# F5TTS v1 Base: 335M params FP32 = ~1.34GB
# Vocoder Vocos: ~54MB
# Activations/buffers (diffusion steps): ~1-2GB
# Total: ~3.5GB x 1.3 = ~4.5GB -> L4 (24GB) com folga
GPU_CONFIG = "L4"

PTBR_CKPT = "/models/f5tts-ptbr/pt-br/model_last.safetensors"
USE_PTBR = True  # True = checkpoint PT-BR firstpixel
# NOTA: o autor do checkpoint usa ref_text="" (Whisper auto-transcreve)


def download_model():
    """Baixa F5-TTS PT-BR + vocoder no build da imagem."""
    import os
    token = os.environ.get("HF_TOKEN", "")
    if token:
        os.environ["HUGGING_FACE_HUB_TOKEN"] = token

    from huggingface_hub import snapshot_download

    # Checkpoint PT-BR fine-tuned
    print("[BUILD] Baixando F5-TTS PT-BR checkpoint...")
    snapshot_download("firstpixel/F5-TTS-pt-br", local_dir="/models/f5tts-ptbr")

    # Modelo base (para vocoder Vocos e vocab)
    print("[BUILD] Baixando vocoder e vocab...")
    from f5_tts.api import F5TTS
    model = F5TTS(device="cpu")
    del model
    print("[BUILD] Tudo baixado.")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "f5-tts>=1.1.0",
        "torch>=2.1.0",
        "torchaudio>=2.1.0",
        "soundfile",
        "numpy<2.0",
    )
    .run_function(download_model, secrets=[hf_secret])
)


@app.cls(
    image=image,
    gpu=GPU_CONFIG,
    scaledown_window=2,
    max_containers=1,
    timeout=300,
)
class TTS:
    @modal.enter()
    def load(self):
        from f5_tts.api import F5TTS

        t0 = time.perf_counter()
        if USE_PTBR:
            self.model = F5TTS(ckpt_file=PTBR_CKPT, device="cuda")
        else:
            self.model = F5TTS(device="cuda")  # modelo base oficial
        self.load_time = time.perf_counter() - t0
        print(f"[INIT] F5-TTS carregado na GPU em {self.load_time:.1f}s")

    @modal.method()
    def synthesize(
        self,
        text: str,
        ref_audio_bytes: bytes | None = None,
        ref_text: str = "",
        seed: int | None = None,
        nfe_step: int = 32,
        cfg_strength: float = 2.0,
        speed: float = 1.0,
        sway_sampling_coef: float = -1.0,
    ) -> dict:
        """Sintetiza audio via API high-level F5TTS.infer(). Retorna WAV bytes + metricas."""
        import tempfile
        import os

        t0 = time.perf_counter()

        # Audio de referencia
        ref_file = None
        if ref_audio_bytes:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(ref_audio_bytes)
                ref_file = f.name
        else:
            from importlib.resources import files
            ref_file = str(files("f5_tts").joinpath("infer/examples/basic/basic_ref_en.wav"))
            ref_text = "some call me nature, others call me mother nature."
            print("[TTS] Sem audio de referencia, usando exemplo embutido")

        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out_f:
                out_path = out_f.name

            print(f"[TTS] nfe_step={nfe_step} cfg={cfg_strength} speed={speed}")

            wav, sr, _ = self.model.infer(
                ref_file=ref_file,
                ref_text=ref_text,
                gen_text=text,
                file_wave=out_path,
                nfe_step=nfe_step,
                cfg_strength=cfg_strength,
                sway_sampling_coef=sway_sampling_coef,
                speed=speed,
                seed=seed,
            )

            with open(out_path, "rb") as f:
                audio_bytes = f.read()

            elapsed = time.perf_counter() - t0
            duration = len(wav) / sr

            print(f"[TTS] {len(text)} chars -> {duration:.1f}s audio em {elapsed:.1f}s")

            return {
                "audio_bytes": audio_bytes,
                "duration_s": round(duration, 2),
                "sample_rate": sr,
                "inference_s": round(elapsed, 2),
                "model_load_s": round(self.load_time, 2),
                "text_len": len(text),
                "nfe_step": nfe_step,
                "cfg_strength": cfg_strength,
            }

        finally:
            if ref_audio_bytes and ref_file:
                os.unlink(ref_file)
            if 'out_path' in locals() and os.path.exists(out_path):
                os.unlink(out_path)

    @modal.method()
    def health(self) -> dict:
        import torch
        return {
            "status": "healthy",
            "model_loaded": hasattr(self, "model") and self.model is not None,
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "model_load_s": getattr(self, "load_time", None),
        }


@app.local_entrypoint()
def main(
    text: str = "O processamento de audio com inteligencia artificial permite transcrever e sintetizar voz com alta qualidade e baixo custo.",
    ref_audio: str = "",
    ref_text: str = "",
    seed: int = -1,
    nfe_step: int = 64,
    cfg_strength: float = 2.0,
    speed: float = 1.0,
):
    """
    modal run scripts/modal_f5tts_bench.py
    modal run scripts/modal_f5tts_bench.py --text "Seu texto" --ref-audio ref.wav --ref-text "Transcricao"
    """
    from pathlib import Path

    tts = TTS()

    ref_bytes = None
    if ref_audio:
        print(f"Lendo referencia: {ref_audio}")
        ref_bytes = Path(ref_audio).read_bytes()
        print(f"  {len(ref_bytes) / 1e6:.1f}MB")

    actual_seed = seed if seed >= 0 else None

    # Run 1: cold start
    print("\n--- Run 1 (cold start) ---")
    t0 = time.time()
    result = tts.synthesize.remote(
        text=text,
        ref_audio_bytes=ref_bytes,
        ref_text=ref_text,
        seed=actual_seed,
        nfe_step=nfe_step,
        cfg_strength=cfg_strength,
        speed=speed,
    )
    wall = time.time() - t0
    print(f"  Wall time:     {wall:.1f}s")
    print(f"  Model load:    {result['model_load_s']}s")
    print(f"  Inference:     {result['inference_s']}s")
    print(f"  Audio duration:{result['duration_s']}s")
    print(f"  Text length:   {result['text_len']} chars")

    # Salva output
    out = Path("/tmp/f5tts_output.wav")
    out.write_bytes(result["audio_bytes"])
    print(f"  Salvo em: {out}")

    # Run 2: warm
    print("\n--- Run 2 (warm) ---")
    t0 = time.time()
    result2 = tts.synthesize.remote(
        text=text,
        ref_audio_bytes=ref_bytes,
        ref_text=ref_text,
        seed=actual_seed,
    )
    wall2 = time.time() - t0
    print(f"  Wall time:     {wall2:.1f}s")
    print(f"  Inference:     {result2['inference_s']}s")
    print(f"  Audio duration:{result2['duration_s']}s")

    # Custo
    print("\n--- Estimativa de custo ---")
    cost_per_hour = 0.80  # L4
    cost_per_sec = cost_per_hour / 3600
    inf_cost = result2["inference_s"] * cost_per_sec
    print(f"  GPU: L4 @ ${cost_per_hour}/h")
    print(f"  Custo por sintese (warm): ${inf_cost:.5f}")
    print(f"  Custo por 1000 sinteses:  ${inf_cost * 1000:.2f}")
