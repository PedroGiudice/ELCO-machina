ⓍTTS
ⓍTTS is a super cool Text-to-Speech model that lets you clone voices in different languages by using just a quick 3-second audio clip. Built on the 🐢Tortoise, ⓍTTS has important model changes that make cross-language voice cloning and multi-lingual speech generation super easy. There is no need for an excessive amount of training data that spans countless hours.

This is the same model that powers Coqui Studio, and Coqui API, however we apply a few tricks to make it faster and support streaming inference.

Features
Voice cloning.

Cross-language voice cloning.

Multi-lingual speech generation.

24khz sampling rate.

Streaming inference with < 200ms latency. (See Streaming inference)

Fine-tuning support. (See Training)

Updates with v2
Improved voice cloning.

Voices can be cloned with a single audio file or multiple audio files, without any effect on the runtime.

2 new languages: Hungarian and Korean.

Across the board quality improvements.

Code
Current implementation only supports inference and GPT encoder training.

Languages
As of now, XTTS-v2 supports 16 languages: English (en), Spanish (es), French (fr), German (de), Italian (it), Portuguese (pt), Polish (pl), Turkish (tr), Russian (ru), Dutch (nl), Czech (cs), Arabic (ar), Chinese (zh-cn), Japanese (ja), Hungarian (hu) and Korean (ko).

Stay tuned as we continue to add support for more languages. If you have any language requests, please feel free to reach out.

License
This model is licensed under Coqui Public Model License.

Contact
Come and join in our 🐸Community. We’re active on Discord and Twitter. You can also mail us at info@coqui.ai.

Inference
🐸TTS Command line
You can check all supported languages with the following command:

 tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 \
    --list_language_idx
You can check all Coqui available speakers with the following command:

 tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 \
    --list_speaker_idx
Coqui speakers
You can do inference using one of the available speakers using the following command:

 tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 \
     --text "It took me quite a long time to develop a voice, and now that I have it I'm not going to be silent." \
     --speaker_idx "Ana Florence" \
     --language_idx en \
     --use_cuda true
Clone a voice
You can clone a speaker voice using a single or multiple references:

Single reference
 tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 \
     --text "Bugün okula gitmek istemiyorum." \
     --speaker_wav /path/to/target/speaker.wav \
     --language_idx tr \
     --use_cuda true
Multiple references
 tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 \
     --text "Bugün okula gitmek istemiyorum." \
     --speaker_wav /path/to/target/speaker.wav /path/to/target/speaker_2.wav /path/to/target/speaker_3.wav \
     --language_idx tr \
     --use_cuda true
or for all wav files in a directory you can use:

 tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 \
     --text "Bugün okula gitmek istemiyorum." \
     --speaker_wav /path/to/target/*.wav \
     --language_idx tr \
     --use_cuda true
🐸TTS API
Clone a voice
You can clone a speaker voice using a single or multiple references:

Single reference
Splits the text into sentences and generates audio for each sentence. The audio files are then concatenated to produce the final audio. You can optionally disable sentence splitting for better coherence but more VRAM and possibly hitting models context length limit.

from TTS.api import TTS
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=True)

# generate speech by cloning a voice using default settings
tts.tts_to_file(text="It took me quite a long time to develop a voice, and now that I have it I'm not going to be silent.",
                file_path="output.wav",
                speaker_wav=["/path/to/target/speaker.wav"],
                language="en",
                split_sentences=True
                )
Multiple references
You can pass multiple audio files to the speaker_wav argument for better voice cloning.

from TTS.api import TTS

# using the default version set in 🐸TTS
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=True)

# using a specific version
# 👀 see the branch names for versions on https://huggingface.co/coqui/XTTS-v2/tree/main
# ❗some versions might be incompatible with the API
tts = TTS("xtts_v2.0.2", gpu=True)

# getting the latest XTTS_v2
tts = TTS("xtts", gpu=True)

# generate speech by cloning a voice using default settings
tts.tts_to_file(text="It took me quite a long time to develop a voice, and now that I have it I'm not going to be silent.",
                file_path="output.wav",
                speaker_wav=["/path/to/target/speaker.wav", "/path/to/target/speaker_2.wav", "/path/to/target/speaker_3.wav"],
                language="en")
Coqui speakers
You can do inference using one of the available speakers using the following code:

from TTS.api import TTS
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=True)

# generate speech by cloning a voice using default settings
tts.tts_to_file(text="It took me quite a long time to develop a voice, and now that I have it I'm not going to be silent.",
                file_path="output.wav",
                speaker="Ana Florence",
                language="en",
                split_sentences=True
                )
🐸TTS Model API
To use the model API, you need to download the model files and pass config and model file paths manually.

Manual Inference
If you want to be able to load_checkpoint with use_deepspeed=True and enjoy the speedup, you need to install deepspeed first.

pip install deepspeed==0.10.3
inference parameters
text: The text to be synthesized.

language: The language of the text to be synthesized.

gpt_cond_latent: The latent vector you get with get_conditioning_latents. (You can cache for faster inference with same speaker)

speaker_embedding: The speaker embedding you get with get_conditioning_latents. (You can cache for faster inference with same speaker)

temperature: The softmax temperature of the autoregressive model. Defaults to 0.65.

length_penalty: A length penalty applied to the autoregressive decoder. Higher settings causes the model to produce more terse outputs. Defaults to 1.0.

repetition_penalty: A penalty that prevents the autoregressive decoder from repeating itself during decoding. Can be used to reduce the incidence of long silences or “uhhhhhhs”, etc. Defaults to 2.0.

top_k: Lower values mean the decoder produces more “likely” (aka boring) outputs. Defaults to 50.

top_p: Lower values mean the decoder produces more “likely” (aka boring) outputs. Defaults to 0.8.

speed: The speed rate of the generated audio. Defaults to 1.0. (can produce artifacts if far from 1.0)

enable_text_splitting: Whether to split the text into sentences and generate audio for each sentence. It allows you to have infinite input length but might loose important context between sentences. Defaults to True.

Inference
import os
import torch
import torchaudio
from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts

print("Loading model...")
config = XttsConfig()
config.load_json("/path/to/xtts/config.json")
model = Xtts.init_from_config(config)
model.load_checkpoint(config, checkpoint_dir="/path/to/xtts/", use_deepspeed=True)
model.cuda()

print("Computing speaker latents...")
gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(audio_path=["reference.wav"])

print("Inference...")
out = model.inference(
    "It took me quite a long time to develop a voice and now that I have it I am not going to be silent.",
    "en",
    gpt_cond_latent,
    speaker_embedding,
    temperature=0.7, # Add custom parameters here
)
torchaudio.save("xtts.wav", torch.tensor(out["wav"]).unsqueeze(0), 24000)
Streaming manually
Here the goal is to stream the audio as it is being generated. This is useful for real-time applications. Streaming inference is typically slower than regular inference, but it allows to get a first chunk of audio faster.

import os
import time
import torch
import torchaudio
from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts

print("Loading model...")
config = XttsConfig()
config.load_json("/path/to/xtts/config.json")
model = Xtts.init_from_config(config)
model.load_checkpoint(config, checkpoint_dir="/path/to/xtts/", use_deepspeed=True)
model.cuda()

print("Computing speaker latents...")
gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(audio_path=["reference.wav"])

print("Inference...")
t0 = time.time()
chunks = model.inference_stream(
    "It took me quite a long time to develop a voice and now that I have it I am not going to be silent.",
    "en",
    gpt_cond_latent,
    speaker_embedding
)

wav_chuncks = []
for i, chunk in enumerate(chunks):
    if i == 0:
        print(f"Time to first chunck: {time.time() - t0}")
    print(f"Received chunk {i} of audio length {chunk.shape[-1]}")
    wav_chuncks.append(chunk)
wav = torch.cat(wav_chuncks, dim=0)
torchaudio.save("xtts_streaming.wav", wav.squeeze().unsqueeze(0).cpu(), 24000)
Training
Easy training
To make XTTS_v2 GPT encoder training easier for beginner users we did a gradio demo that implements the whole fine-tuning pipeline. The gradio demo enables the user to easily do the following steps:

Preprocessing of the uploaded audio or audio files in 🐸 TTS coqui formatter

Train the XTTS GPT encoder with the processed data

Inference support using the fine-tuned model

The user can run this gradio demo locally or remotely using a Colab Notebook.

Run demo on Colab
To make the XTTS_v2 fine-tuning more accessible for users that do not have good GPUs available we did a Google Colab Notebook.

The Colab Notebook is available here.

To learn how to use this Colab Notebook please check the XTTS fine-tuning video.

If you are not able to acess the video you need to follow the steps:

Open the Colab notebook and start the demo by runining the first two cells (ignore pip install errors in the first one).

Click on the link “Running on public URL:” on the second cell output.

On the first Tab (1 - Data processing) you need to select the audio file or files, wait for upload, and then click on the button “Step 1 - Create dataset” and then wait until the dataset processing is done.

Soon as the dataset processing is done you need to go to the second Tab (2 - Fine-tuning XTTS Encoder) and press the button “Step 2 - Run the training” and then wait until the training is finished. Note that it can take up to 40 minutes.

Soon the training is done you can go to the third Tab (3 - Inference) and then click on the button “Step 3 - Load Fine-tuned XTTS model” and wait until the fine-tuned model is loaded. Then you can do the inference on the model by clicking on the button “Step 4 - Inference”.

Run demo locally
To run the demo locally you need to do the following steps:

Install 🐸 TTS following the instructions available here.

Install the Gradio demo requirements with the command python3 -m pip install -r TTS/demos/xtts_ft_demo/requirements.txt

Run the Gradio demo using the command python3 TTS/demos/xtts_ft_demo/xtts_demo.py

Follow the steps presented in the tutorial video to be able to fine-tune and test the fine-tuned model.

If you are not able to access the video, here is what you need to do:

On the first Tab (1 - Data processing) select the audio file or files, wait for upload

Click on the button “Step 1 - Create dataset” and then wait until the dataset processing is done.

Go to the second Tab (2 - Fine-tuning XTTS Encoder) and press the button “Step 2 - Run the training” and then wait until the training is finished. it will take some time.

Go to the third Tab (3 - Inference) and then click on the button “Step 3 - Load Fine-tuned XTTS model” and wait until the fine-tuned model is loaded.

Now you can run inference with the model by clicking on the button “Step 4 - Inference”.

Advanced training
A recipe for XTTS_v2 GPT encoder training using LJSpeech dataset is available at https://github.com/coqui-ai/TTS/tree/dev/recipes/ljspeech/xtts_v1/train_gpt_xtts.py

You need to change the fields of the BaseDatasetConfig to match your dataset and then update GPTArgs and GPTTrainerConfig fields as you need. By default, it will use the same parameters that XTTS v1.1 model was trained with. To speed up the model convergence, as default, it will also download the XTTS v1.1 checkpoint and load it.

After training you can do inference following the code bellow.

import os
import torch
import torchaudio
from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts

# Add here the xtts_config path
CONFIG_PATH = "recipes/ljspeech/xtts_v1/run/training/GPT_XTTS_LJSpeech_FT-October-23-2023_10+36AM-653f2e75/config.json"
# Add here the vocab file that you have used to train the model
TOKENIZER_PATH = "recipes/ljspeech/xtts_v1/run/training/XTTS_v2_original_model_files/vocab.json"
# Add here the checkpoint that you want to do inference with
XTTS_CHECKPOINT = "recipes/ljspeech/xtts_v1/run/training/GPT_XTTS_LJSpeech_FT/best_model.pth"
# Add here the speaker reference
SPEAKER_REFERENCE = "LjSpeech_reference.wav"

# output wav path
OUTPUT_WAV_PATH = "xtts-ft.wav"

print("Loading model...")
config = XttsConfig()
config.load_json(CONFIG_PATH)
model = Xtts.init_from_config(config)
model.load_checkpoint(config, checkpoint_path=XTTS_CHECKPOINT, vocab_path=TOKENIZER_PATH, use_deepspeed=False)
model.cuda()

print("Computing speaker latents...")
gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(audio_path=[SPEAKER_REFERENCE])

print("Inference...")
out = model.inference(
    "It took me quite a long time to develop a voice and now that I have it I am not going to be silent.",
    "en",
    gpt_cond_latent,
    speaker_embedding,
    temperature=0.7, # Add custom parameters here
)
torchaudio.save(OUTPUT_WAV_PATH, torch.tensor(out["wav"]).unsqueeze(0), 24000)
References and Acknowledgements
VallE: https://arxiv.org/abs/2301.02111

Tortoise Repo: https://github.com/neonbjb/tortoise-tts

Faster implementation: https://github.com/152334H/tortoise-tts-fast

Univnet: https://arxiv.org/abs/2106.07889

Latent Diffusion:https://arxiv.org/abs/2112.10752

DALL-E: https://arxiv.org/abs/2102.12092

Perceiver: https://arxiv.org/abs/2103.03206

XttsConfig
class TTS.tts.configs.xtts_config.XttsConfig(output_path='output', logger_uri=None, run_name='run', project_name=None, run_description='🐸Coqui trainer run.', print_step=25, plot_step=100, model_param_stats=False, wandb_entity=None, dashboard_logger='tensorboard', save_on_interrupt=True, log_model_step=None, save_step=10000, save_n_checkpoints=5, save_checkpoints=True, save_all_best=False, save_best_after=10000, target_loss=None, print_eval=False, test_delay_epochs=0, run_eval=True, run_eval_steps=None, distributed_backend='nccl', distributed_url='tcp://localhost:54321', mixed_precision=False, precision='fp16', epochs=1000, batch_size=32, eval_batch_size=16, grad_clip=0.0, scheduler_after_epoch=True, lr=0.001, optimizer='radam', optimizer_params=None, lr_scheduler=None, lr_scheduler_params=<factory>, use_grad_scaler=False, allow_tf32=False, cudnn_enable=True, cudnn_deterministic=False, cudnn_benchmark=False, training_seed=54321, model='xtts', num_loader_workers=0, num_eval_loader_workers=0, use_noise_augment=False, audio=<factory>, use_phonemes=False, phonemizer=None, phoneme_language=None, compute_input_seq_cache=False, text_cleaner=None, enable_eos_bos_chars=False, test_sentences_file='', phoneme_cache_path=None, characters=None, add_blank=False, batch_group_size=0, loss_masking=None, min_audio_len=1, max_audio_len=inf, min_text_len=1, max_text_len=inf, compute_f0=False, compute_energy=False, compute_linear_spec=False, precompute_num_workers=0, start_by_longest=False, shuffle=False, drop_last=False, datasets=<factory>, test_sentences=<factory>, eval_split_max_size=None, eval_split_size=0.01, use_speaker_weighted_sampler=False, speaker_weighted_sampler_alpha=1.0, use_language_weighted_sampler=False, language_weighted_sampler_alpha=1.0, use_length_weighted_sampler=False, length_weighted_sampler_alpha=1.0, model_args=<factory>, model_dir=None, languages=<factory>, temperature=0.85, length_penalty=1.0, repetition_penalty=2.0, top_k=50, top_p=0.85, num_gpt_outputs=1, gpt_cond_len=12, gpt_cond_chunk_len=4, max_ref_len=10, sound_norm_refs=False)[source]
Defines parameters for XTTS TTS model.

Parameters:
model (str) – Model name. Do not change unless you know what you are doing.

model_args (XttsArgs) – Model architecture arguments. Defaults to XttsArgs().

audio (XttsAudioConfig) – Audio processing configuration. Defaults to XttsAudioConfig().

model_dir (str) – Path to the folder that has all the XTTS models. Defaults to None.

temperature (float) – Temperature for the autoregressive model inference. Larger values makes predictions more creative sacrificing stability. Defaults to 0.2.

length_penalty (float) – Exponential penalty to the length that is used with beam-based generation. It is applied as an exponent to the sequence length, which in turn is used to divide the score of the sequence. Since the score is the log likelihood of the sequence (i.e. negative), length_penalty > 0.0 promotes longer sequences, while length_penalty < 0.0 encourages shorter sequences.

repetition_penalty (float) – The parameter for repetition penalty. 1.0 means no penalty. Defaults to 2.0.

top_p (float) – If set to float < 1, only the smallest set of most probable tokens with probabilities that add up to top_p or higher are kept for generation. Defaults to 0.8.

num_gpt_outputs (int) – Number of samples taken from the autoregressive model, all of which are filtered using CLVP. As XTTS is a probabilistic model, more samples means a higher probability of creating something “great”. Defaults to 16.

gpt_cond_len (int) – Secs audio to be used as conditioning for the autoregressive model. Defaults to 12.

gpt_cond_chunk_len (int) – Audio chunk size in secs. Audio is split into chunks and latents are extracted for each chunk. Then the latents are averaged. Chunking improves the stability. It must be <= gpt_cond_len. If gpt_cond_len == gpt_cond_chunk_len, no chunking. Defaults to 4.

max_ref_len (int) – Maximum number of seconds of audio to be used as conditioning for the decoder. Defaults to 10.

sound_norm_refs (bool) – Whether to normalize the conditioning audio. Defaults to False.

Note

Check TTS.tts.configs.shared_configs.BaseTTSConfig for the inherited parameters.

Example

from TTS.tts.configs.xtts_config import XttsConfig
config = XttsConfig()
XttsArgs
class TTS.tts.models.xtts.XttsArgs(gpt_batch_size=1, enable_redaction=False, kv_cache=True, gpt_checkpoint=None, clvp_checkpoint=None, decoder_checkpoint=None, num_chars=255, tokenizer_file='', gpt_max_audio_tokens=605, gpt_max_text_tokens=402, gpt_max_prompt_tokens=70, gpt_layers=30, gpt_n_model_channels=1024, gpt_n_heads=16, gpt_number_text_tokens=None, gpt_start_text_token=None, gpt_stop_text_token=None, gpt_num_audio_tokens=8194, gpt_start_audio_token=8192, gpt_stop_audio_token=8193, gpt_code_stride_len=1024, gpt_use_masking_gt_prompt_approach=True, gpt_use_perceiver_resampler=False, input_sample_rate=22050, output_sample_rate=24000, output_hop_length=256, decoder_input_dim=1024, d_vector_dim=512, cond_d_vector_in_each_upsampling_layer=True, duration_const=102400)[source]
A dataclass to represent XTTS model arguments that define the model structure.

Parameters:
gpt_batch_size (int) – The size of the auto-regressive batch.

enable_redaction (bool, optional) – Whether to enable redaction. Defaults to True.

kv_cache (bool, optional) – Whether to use the kv_cache. Defaults to True.

gpt_checkpoint (str, optional) – The checkpoint for the autoregressive model. Defaults to None.

clvp_checkpoint (str, optional) – The checkpoint for the ConditionalLatentVariablePerseq model. Defaults to None.

decoder_checkpoint (str, optional) – The checkpoint for the DiffTTS model. Defaults to None.

num_chars (int, optional) – The maximum number of characters to generate. Defaults to 255.

model (For GPT) –

gpt_max_audio_tokens (int, optional) – The maximum mel tokens for the autoregressive model. Defaults to 604.

gpt_max_text_tokens (int, optional) – The maximum text tokens for the autoregressive model. Defaults to 402.

gpt_max_prompt_tokens (int, optional) – The maximum prompt tokens or the autoregressive model. Defaults to 70.

gpt_layers (int, optional) – The number of layers for the autoregressive model. Defaults to 30.

gpt_n_model_channels (int, optional) – The model dimension for the autoregressive model. Defaults to 1024.

gpt_n_heads (int, optional) – The number of heads for the autoregressive model. Defaults to 16.

gpt_number_text_tokens (int, optional) – The number of text tokens for the autoregressive model. Defaults to 255.

gpt_start_text_token (int, optional) – The start text token for the autoregressive model. Defaults to 255.

gpt_checkpointing (bool, optional) – Whether to use checkpointing for the autoregressive model. Defaults to False.

gpt_train_solo_embeddings (bool, optional) – Whether to train embeddings for the autoregressive model. Defaults to False.

gpt_code_stride_len (int, optional) – The hop_size of dvae and consequently of the gpt output. Defaults to 1024.

gpt_use_masking_gt_prompt_approach (bool, optional) – If True, it will use ground truth as prompt and it will mask the loss to avoid repetition. Defaults to True.

gpt_use_perceiver_resampler (bool, optional) – If True, it will use perceiver resampler from flamingo paper - https://arxiv.org/abs/2204.14198. Defaults to False.

XTTS Model
Previous
🐶 Bark
Copyright © 2021 Coqui GmbH, 2020 TTS authors
Made with Sphinx and @pradyunsg's Furo