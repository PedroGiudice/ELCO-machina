<?php

namespace App\Livewire;

use App\Models\VoiceProfile;
use App\Services\TtsService;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\Storage;
use Livewire\Component;
use Livewire\WithFileUploads;

class PanelTts extends Component
{
    use WithFileUploads;

    public string $text = '';

    public string $ttsModel = '';

    public string $language = 'pt';

    public ?int $selectedVoiceId = null;

    // Upload nova voz
    public $newVoiceFile = null;

    public string $newVoiceName = '';

    // Chatterbox params
    public float $exaggeration = 0.5;

    public float $cfgWeight = 0.5;

    // Qwen params
    public string $refText = '';

    // Estado
    public string $ttsStatus = 'idle';

    public ?string $statusMessage = null;

    public ?string $statusType = null;

    public ?string $ttsAudioUrl = null;

    public ?float $inferenceTime = null;

    public ?float $audioDuration = null;

    public function mount(): void
    {
        $this->ttsModel = config('voice.defaults.tts', 'qwen-tts');
    }

    public function setModel(string $model): void
    {
        $this->ttsModel = $model;
        $this->exaggeration = 0.5;
        $this->cfgWeight = 0.5;
        $this->refText = '';
    }

    public function selectVoice(int $id): void
    {
        $this->selectedVoiceId = $id;
    }

    public function uploadVoice(): void
    {
        $this->validate([
            'newVoiceFile' => 'required|file|max:51200|mimes:mp3,wav,webm,ogg,flac',
            'newVoiceName' => 'required|string|max:100',
        ]);

        $path = $this->newVoiceFile->store('voice_profiles', 'local');

        $voice = VoiceProfile::create([
            'name' => $this->newVoiceName,
            'file_path' => $path,
        ]);

        $this->selectedVoiceId = $voice->id;
        $this->newVoiceFile = null;
        $this->newVoiceName = '';
    }

    public function deleteVoice(int $id): void
    {
        $voice = VoiceProfile::find($id);
        if (! $voice || $voice->is_preset) {
            return;
        }

        Storage::disk('local')->delete($voice->file_path);
        $voice->delete();

        if ($this->selectedVoiceId === $id) {
            $this->selectedVoiceId = null;
        }
    }

    public function synthesize(): void
    {
        if (trim($this->text) === '') {
            $this->statusMessage = 'Escreva um texto para sintetizar.';
            $this->statusType = 'error';

            return;
        }

        $refPath = null;
        if ($this->selectedVoiceId) {
            $voice = VoiceProfile::find($this->selectedVoiceId);
            if ($voice) {
                $refPath = storage_path("app/{$voice->file_path}");
            }
        }

        if (! $refPath && $this->ttsModel === 'qwen-tts') {
            $this->statusMessage = 'Qwen3-TTS requer um audio de referencia para clonagem.';
            $this->statusType = 'error';

            return;
        }

        $this->ttsStatus = 'synthesizing';
        $this->statusMessage = 'Sintetizando...';
        $this->statusType = 'info';
        $this->ttsAudioUrl = null;
        $this->inferenceTime = null;
        $this->audioDuration = null;

        try {
            $params = [];
            if ($this->ttsModel === 'chatterbox') {
                $params['exaggeration'] = $this->exaggeration;
                $params['cfg_weight'] = $this->cfgWeight;
            } elseif ($this->ttsModel === 'qwen-tts' && trim($this->refText) !== '') {
                $params['ref_text'] = $this->refText;
            }

            $tts = app(TtsService::class);
            $result = $tts->synthesize(
                text: $this->text,
                refAudioPath: $refPath,
                model: $this->ttsModel,
                language: $this->language,
                params: $params,
            );

            if (! $result['success']) {
                $this->statusMessage = "Erro: {$result['error']}";
                $this->statusType = 'error';

                return;
            }

            // Save WAV to temp storage and generate URL
            $filename = 'tts_output/'.uniqid('tts_').'.wav';
            Storage::disk('local')->put($filename, $result['audio_bytes']);
            $this->ttsAudioUrl = route('tts.audio', ['file' => basename($filename)]);

            $this->inferenceTime = $result['inference_time'];
            $this->audioDuration = $result['audio_duration'];
            $this->statusMessage = "Concluido ({$this->ttsModel}, {$result['inference_time']}s).";
            $this->statusType = 'success';
        } catch (\Throwable $e) {
            $this->statusMessage = 'Erro: '.mb_substr($e->getMessage(), 0, 200);
            $this->statusType = 'error';
        } finally {
            $this->ttsStatus = 'idle';
        }
    }

    public function clearResult(): void
    {
        $this->ttsAudioUrl = null;
        $this->statusMessage = null;
        $this->statusType = null;
        $this->inferenceTime = null;
        $this->audioDuration = null;
    }

    public function render(): View
    {
        return view('livewire.panel-tts', [
            'voices' => VoiceProfile::orderBy('is_preset', 'desc')->orderBy('name')->get(),
            'availableModels' => [
                'qwen-tts' => 'Qwen3-TTS (naturalidade)',
                'chatterbox' => 'Chatterbox (velocidade)',
            ],
        ]);
    }
}
