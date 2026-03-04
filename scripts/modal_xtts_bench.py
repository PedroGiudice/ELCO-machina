"""Modal XTTS v2 Benchmark - voice cloning zero-shot PT-BR na L4.

XTTS v2 (Coqui TTS / Idiap fork): 456M params, PT-BR nativo.
Audio 24kHz. Clonagem zero-shot com 6-30s de referencia.

Teste:
    modal run scripts/modal_xtts_bench.py
    modal run scripts/modal_xtts_bench.py --text "Outro texto em portugues."
"""

import time

import modal

app = modal.App("xtts-bench")

hf_secret = modal.Secret.from_name("huggingface-secret")

# VRAM estimate:
# XTTS v2: ~456M params FP16 = ~912MB
# Activations/buffers (autoregressive GPT + HiFi-GAN vocoder): ~1-2GB
# Total: ~3GB x 1.3 = ~3.9GB -> L4 (24GB) com folga
# Benchmarks DataRoot confirmam ~5GB real. L4 para menor wall time
GPU_CONFIG = "L4"

MODEL_DIR = "/models/xtts-v2"


def download_model():
    """Baixa XTTS v2 do HuggingFace no build da imagem."""
    from huggingface_hub import snapshot_download

    print("[BUILD] Baixando XTTS v2 de coqui/XTTS-v2...")
    snapshot_download("coqui/XTTS-v2", local_dir=MODEL_DIR)
    print("[BUILD] XTTS v2 baixado.")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "coqui-tts==0.26.0",
        "transformers>=4.43.0,<4.50.0",
        "torch>=2.1.0",
        "torchaudio>=2.1.0",
        "soundfile",
        "numpy<2.0",
        "huggingface_hub>=0.20.0",
        "torchcodec",
    )
    .run_function(download_model, secrets=[hf_secret])
)


@app.cls(
    image=image,
    gpu=GPU_CONFIG,
    scaledown_window=60,  # TODO: voltar pra 2 depois dos testes
    max_containers=1,
    timeout=300,
)
class TTS_Model:
    @modal.enter()
    def load(self):
        from TTS.tts.configs.xtts_config import XttsConfig
        from TTS.tts.models.xtts import Xtts

        t0 = time.perf_counter()
        config = XttsConfig()
        config.load_json(f"{MODEL_DIR}/config.json")
        self.model = Xtts.init_from_config(config)
        self.model.load_checkpoint(config, checkpoint_dir=MODEL_DIR, use_deepspeed=False)
        self.model.cuda()
        self.load_time = time.perf_counter() - t0
        print(f"[INIT] XTTS v2 carregado na GPU em {self.load_time:.1f}s")

    @modal.method()
    def synthesize(
        self,
        text: str,
        ref_audio_bytes: bytes,
        language: str = "pt",
        speed: float = 1.0,
        temperature: float = 0.7,
        top_k: int = 50,
        top_p: float = 0.85,
        repetition_penalty: float = 2.0,
        length_penalty: float = 1.0,
    ) -> dict:
        """Sintetiza audio com XTTS v2. Retorna WAV bytes + metricas."""
        import tempfile
        import os
        import soundfile as sf
        import torch

        t0 = time.perf_counter()

        # Audio de referencia -> tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(ref_audio_bytes)
            ref_file = f.name

        try:
            # Speaker embedding do audio de referencia
            gpt_cond_latent, speaker_embedding = self.model.get_conditioning_latents(
                audio_path=[ref_file]
            )

            print(f"[TTS] language={language} speed={speed} temp={temperature} top_k={top_k} top_p={top_p} rep_pen={repetition_penalty} len_pen={length_penalty}")

            output = self.model.inference(
                text=text,
                language=language,
                gpt_cond_latent=gpt_cond_latent,
                speaker_embedding=speaker_embedding,
                speed=speed,
                temperature=temperature,
                top_k=top_k,
                top_p=top_p,
                repetition_penalty=repetition_penalty,
                length_penalty=length_penalty,
                enable_text_splitting=True,
            )

            wav = torch.tensor(output["wav"]).unsqueeze(0)
            sr = 24000

            # WAV bytes
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out_f:
                out_path = out_f.name
            sf.write(out_path, output["wav"], sr)

            with open(out_path, "rb") as f:
                audio_bytes = f.read()

            duration = len(output["wav"]) / sr
            elapsed = time.perf_counter() - t0

            print(f"[TTS] {len(text)} chars -> {duration:.1f}s audio em {elapsed:.1f}s")

            return {
                "audio_bytes": audio_bytes,
                "duration_s": round(duration, 2),
                "sample_rate": sr,
                "inference_s": round(elapsed, 2),
                "model_load_s": round(self.load_time, 2),
                "text_len": len(text),
            }

        finally:
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

    @modal.method()
    def list_deps(self) -> dict:
        """Lista todas as deps carregadas pelo processo de inferencia."""
        import sys
        import subprocess

        # Modulos carregados que nao sao stdlib
        loaded = sorted(set(
            m.split(".")[0] for m in sys.modules
            if not m.startswith("_") and "." not in m or m.count(".") == 0
        ))

        # pip list completo
        pip_list = subprocess.run(
            [sys.executable, "-m", "pip", "list", "--format=freeze"],
            capture_output=True, text=True
        ).stdout.strip().split("\n")

        # pipdeptree do coqui-tts
        try:
            dep_tree = subprocess.run(
                [sys.executable, "-m", "pipdeptree", "-p", "coqui-tts", "--warn", "silence"],
                capture_output=True, text=True
            ).stdout.strip()
        except Exception:
            dep_tree = "(pipdeptree nao instalado)"

        return {
            "loaded_modules": loaded,
            "pip_packages": pip_list,
            "coqui_dep_tree": dep_tree,
        }


@app.local_entrypoint()
def main(
    text: str = "A necessidade de modelos especializados em português brasileiro advém das complexidades fonéticas inerentes ao idioma.",
    ref_audio: str = "docs/Refaudio.wav",
    language: str = "pt",
    speed: float = 1.0,
    temperature: float = 0.75,
    top_k: int = 20,
    top_p: float = 0.75,
    repetition_penalty: float = 2.0,
    length_penalty: float = 1.0,
    deps: bool = False,
):
    """
    modal run scripts/modal_xtts_bench.py
    modal run scripts/modal_xtts_bench.py --text "Outro texto." --temperature 0.3
    modal run scripts/modal_xtts_bench.py --deps
    """
    from pathlib import Path

    tts = TTS_Model()

    if deps:
        info = tts.list_deps.remote()
        print("=== Modulos carregados apos load + inference ===")
        print("\n".join(info["loaded_modules"]))
        print(f"\n=== pip packages ({len(info['pip_packages'])}) ===")
        print("\n".join(info["pip_packages"]))
        print("\n=== coqui-tts dependency tree ===")
        print(info["coqui_dep_tree"])
        return

    print(f"Lendo referencia: {ref_audio}")
    ref_bytes = Path(ref_audio).read_bytes()
    print(f"  {len(ref_bytes) / 1e6:.1f}MB")

    print(f"\n--- Sintese ---")
    t0 = time.time()
    result = tts.synthesize.remote(
        text=text,
        ref_audio_bytes=ref_bytes,
        language=language,
        speed=speed,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        repetition_penalty=repetition_penalty,
        length_penalty=length_penalty,
    )
    wall = time.time() - t0
    print(f"  Wall time:     {wall:.1f}s")
    print(f"  Model load:    {result['model_load_s']}s")
    print(f"  Inference:     {result['inference_s']}s")
    print(f"  Audio duration:{result['duration_s']}s")
    print(f"  Text length:   {result['text_len']} chars")

    # Salva output local
    out = Path("/tmp/xtts_output.wav")
    out.write_bytes(result["audio_bytes"])
    print(f"  Salvo em: {out}")

    # Transfere para cmr-auto
    import subprocess
    remote_dir = "cmr-auto@100.102.249.9:/home/cmr-auto/Documents/audios/xtts-output/"
    print(f"\n--- Transferindo para cmr-auto ---")
    # Garante que o diretorio remoto existe
    subprocess.run(["ssh", "cmr-auto@100.102.249.9", "mkdir", "-p", "/home/cmr-auto/Documents/audios/xtts-output"], check=True)
    scp = subprocess.run(["scp", str(out), remote_dir], capture_output=True, text=True)
    if scp.returncode == 0:
        print(f"  Transferido para {remote_dir}")
    else:
        print(f"  Falha no SCP: {scp.stderr}")

    # Custo
    print("\n--- Estimativa de custo ---")
    cost_per_hour = 0.80  # L4
    cost_per_sec = cost_per_hour / 3600
    inf_cost = result["inference_s"] * cost_per_sec
    print(f"  GPU: L4 @ ${cost_per_hour}/h")
    print(f"  Custo por sintese: ${inf_cost:.5f}")
    print(f"  Custo por 1000 sinteses: ${inf_cost * 1000:.2f}")
