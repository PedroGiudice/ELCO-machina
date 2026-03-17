<?php

namespace App\Livewire;

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

    public array $contextPools = ['General', 'Legal', 'Medical'];

    public array $styles = [
        'Whisper Only', 'Verbatim', 'Elegant Prose', 'Ana Suy', 'Poetic / Verses',
        'Normal', 'Verbose', 'Concise', 'Formal', 'Prompt (Claude)', 'Prompt (LLM)',
        'Bullet Points', 'Summary', 'Tech Docs', 'Email', 'Tweet Thread',
        'Code Generator', 'Custom',
    ];

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

    public function render()
    {
        return view('livewire.panel-att');
    }
}
