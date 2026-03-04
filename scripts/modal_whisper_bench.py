"""Modal Whisper Benchmark - faster-whisper large-v3-turbo na T4.

Uso real: audio entra como bytes, sai texto. Sem Volume, sem estado.

Teste:
    modal run scripts/modal_whisper_bench.py --audio-path TesteModal.m4a

Benchmark (mede cold start + inferencia separados):
    modal run scripts/modal_whisper_bench.py --audio-path TesteModal.m4a --benchmark
"""

import time

import modal

app = modal.App("whisper-bench")

MODEL_ID = "deepdml/faster-whisper-large-v3-turbo-ct2"
GPU_CONFIG = "T4"

# VRAM estimate:
# large-v3-turbo FP16: ~1.6B params × 2 bytes = ~3.2GB
# + activations/buffers: ~1GB
# Total: ~4.2GB × 1.3 = ~5.5GB → T4 (16GB) com folga
# batch_size=1 (transcricao e sequencial por natureza)


hf_secret = modal.Secret.from_name("huggingface-secret")


def download_model():
    from huggingface_hub import snapshot_download

    snapshot_download(MODEL_ID, local_dir="/models/large-v3-turbo")


image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "faster-whisper>=1.1.0",
        "huggingface_hub>=0.20.0",
    )
    .run_function(download_model, secrets=[hf_secret])
)


@app.cls(
    image=image,
    gpu=GPU_CONFIG,
    # Modelo no snapshot da imagem (download no build, nao no runtime).
    # Cold start real = boot container + carregar ~1.6GB na GPU (~3-5s).
    # scaledown=0: nao pagar por idle. Cada chamada e stateless.
    max_containers=1,
    scaledown_window=2,
    timeout=300,
)
class Whisper:
    @modal.enter()
    def load(self):
        from faster_whisper import WhisperModel

        t0 = time.perf_counter()
        self.model = WhisperModel(
            "/models/large-v3-turbo",
            device="cuda",
            compute_type="float16",
        )
        self.load_time = time.perf_counter() - t0
        print(f"[INIT] Modelo carregado em {self.load_time:.1f}s")

    @modal.method()
    def transcribe(self, audio_bytes: bytes, language: str = "pt") -> dict:
        """Transcreve audio bytes. Retorna texto + metricas."""
        import tempfile
        import os

        # Bytes -> tempfile (faster-whisper precisa de path ou file-like)
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        try:
            t0 = time.perf_counter()
            segments, info = self.model.transcribe(
                tmp_path,
                language=language,
                beam_size=5,
                vad_filter=True,
            )
            # Materializar segments (generator lazy)
            segment_list = []
            for seg in segments:
                segment_list.append({
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": seg.text.strip(),
                })
            elapsed = time.perf_counter() - t0
        finally:
            os.unlink(tmp_path)

        full_text = " ".join(s["text"] for s in segment_list)
        duration = info.duration

        return {
            "text": full_text,
            "language": info.language,
            "duration_audio_s": round(duration, 1),
            "inference_s": round(elapsed, 2),
            "rtf": round(elapsed / duration, 3) if duration > 0 else 0,
            "model_load_s": round(self.load_time, 2),
            "segments": segment_list,
        }


@app.local_entrypoint()
def main(
    audio_path: str = "TesteModal.m4a",
    language: str = "pt",
    benchmark: bool = False,
):
    """Envia audio local para Modal, recebe transcricao."""
    print(f"Lendo {audio_path}...")
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()
    print(f"  {len(audio_bytes) / 1e6:.1f}MB")

    whisper = Whisper()

    if benchmark:
        # Primeira chamada: inclui cold start
        print("\n--- Run 1 (cold start) ---")
        t_total = time.perf_counter()
        result = whisper.transcribe.remote(audio_bytes, language)
        wall_time = time.perf_counter() - t_total
        print(f"  Wall time (total):  {wall_time:.1f}s")
        print(f"  Model load:         {result['model_load_s']}s")
        print(f"  Inference:          {result['inference_s']}s")
        print(f"  Audio duration:     {result['duration_audio_s']}s")
        print(f"  RTF:                {result['rtf']}")
        print(f"  Texto ({len(result['text'])} chars):")
        print(f"  {result['text'][:300]}...")

        # Segunda chamada: container quente
        print("\n--- Run 2 (warm) ---")
        t_total = time.perf_counter()
        result2 = whisper.transcribe.remote(audio_bytes, language)
        wall_time2 = time.perf_counter() - t_total
        print(f"  Wall time (total):  {wall_time2:.1f}s")
        print(f"  Inference:          {result2['inference_s']}s")
        print(f"  RTF:                {result2['rtf']}")

        # Custo
        print("\n--- Estimativa de custo ---")
        cost_per_hour = 0.59  # T4
        cost_per_sec = cost_per_hour / 3600
        inference_cost = result2['inference_s'] * cost_per_sec
        print(f"  GPU: T4 @ ${cost_per_hour}/h")
        print(f"  Custo por transcricao (warm): ${inference_cost:.5f}")
        print(f"  Custo por 1000 transcricoes:  ${inference_cost * 1000:.2f}")
        print(f"  Custo por hora de audio:      ${(3600 / result['duration_audio_s']) * inference_cost:.3f}")

    else:
        t_total = time.perf_counter()
        result = whisper.transcribe.remote(audio_bytes, language)
        wall_time = time.perf_counter() - t_total

        print(f"\n{'='*60}")
        print(f"Wall time:       {wall_time:.1f}s")
        print(f"Inference:       {result['inference_s']}s")
        print(f"Audio duration:  {result['duration_audio_s']}s")
        print(f"RTF:             {result['rtf']}")
        print(f"Language:        {result['language']}")
        print(f"\nTexto:\n{result['text']}")
