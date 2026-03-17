<?php

namespace App\Livewire;

use App\Enums\TranscriptionStatus;
use App\Models\Prompt;
use App\Models\Transcription;
use App\Services\ModalService;
use Illuminate\Contracts\View\View;
use Livewire\Attributes\On;
use Livewire\Component;
use Livewire\WithFileUploads;

class PanelAtt extends Component
{
    use WithFileUploads;

    public string $recordingStyle = 'Dictation';

    public string $outputStyle = 'Normal';

    public string $outputLanguage = 'Portuguese';

    public string $customStylePrompt = '';

    public bool $isProcessing = false;

    public $audioFile = null;

    public ?string $uploadError = null;

    public ?string $statusMessage = null;

    public ?string $statusType = null; // 'info', 'success', 'error'

    public ?string $resultText = null;

    public ?float $inferenceTime = null;

    public ?float $audioDuration = null;

    public string $activeContext = 'General';

    /** @var array<int, string> */
    public array $contextPools = ['General', 'Legal', 'Medical'];

    public function updatedAudioFile(): void
    {
        $this->validateOnly('audioFile', [
            'audioFile' => 'file|max:51200|mimes:mp3,wav,webm,ogg,flac',
        ]);
        $this->uploadError = null;
        $this->resultText = null;
        $this->statusMessage = null;
    }

    public function process(): void
    {
        if (! $this->audioFile) {
            $this->uploadError = 'Selecione um arquivo de audio.';

            return;
        }

        $this->isProcessing = true;
        $this->statusMessage = 'Salvando audio...';
        $this->statusType = 'info';
        $this->resultText = null;
        $this->inferenceTime = null;
        $this->audioDuration = null;

        try {
            $path = $this->audioFile->store('audio', 'local');
            $fullPath = storage_path("app/{$path}");

            $this->statusMessage = 'Enviando para transcricao (GPU)...';

            $modal = app(ModalService::class);

            $langMap = [
                'Portuguese' => 'pt',
                'English' => 'en',
                'Spanish' => 'es',
            ];
            $lang = $langMap[$this->outputLanguage] ?? 'pt';

            $result = $modal->transcribe($fullPath, $lang);

            $this->resultText = $result['text'] ?? '';
            $this->inferenceTime = $result['inference_s'] ?? null;
            $this->audioDuration = $result['duration_audio_s'] ?? null;

            Transcription::create([
                'audio_path' => $path,
                'language' => $lang,
                'status' => TranscriptionStatus::Completed,
                'text' => $this->resultText,
                'inference_time_s' => $this->inferenceTime,
                'rtf' => $result['rtf'] ?? null,
                'metadata' => $result,
            ]);

            $this->statusMessage = 'Transcricao concluida.';
            $this->statusType = 'success';

        } catch (\Throwable $e) {
            $this->statusMessage = 'Erro: '.mb_substr($e->getMessage(), 0, 200);
            $this->statusType = 'error';
        } finally {
            $this->isProcessing = false;
        }
    }

    public function clearResult(): void
    {
        $this->resultText = null;
        $this->statusMessage = null;
        $this->statusType = null;
        $this->inferenceTime = null;
        $this->audioDuration = null;
    }

    public function setRecordingStyle(string $style): void
    {
        $this->recordingStyle = $style;
    }

    public function setContext(string $ctx): void
    {
        $this->activeContext = $ctx;
    }

    #[On('prompt-saved')]
    public function refreshPrompts(): void
    {
        // Re-render will reload prompts from DB
    }

    public function render(): View
    {
        $prompts = Prompt::query()->orderBy('sort_order')->get();

        return view('livewire.panel-att', [
            'prompts' => $prompts,
        ]);
    }
}
