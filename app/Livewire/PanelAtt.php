<?php

namespace App\Livewire;

use App\Models\Prompt;
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

    public string $activeContext = 'General';

    /** @var array<int, string> */
    public array $contextPools = ['General', 'Legal', 'Medical'];

    public function updatedAudioFile(): void
    {
        $this->validateOnly('audioFile', [
            'audioFile' => 'file|max:51200|mimes:mp3,wav,webm,ogg,flac',
        ]);
        $this->uploadError = null;
    }

    public function process(): void
    {
        if (! $this->audioFile) {
            $this->uploadError = 'Selecione um arquivo de audio.';

            return;
        }

        $this->isProcessing = true;

        // TODO: Enviar para backend STT + refiner
        // $path = $this->audioFile->store('audio', 'local');

        $this->isProcessing = false;
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
