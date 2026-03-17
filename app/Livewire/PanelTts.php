<?php

namespace App\Livewire;

use Livewire\Component;
use Livewire\WithFileUploads;

class PanelTts extends Component
{
    use WithFileUploads;

    public string $ttsStatus = 'idle';

    public ?string $statusMessage = null;

    public string $text = '';

    // XTTS params
    public float $speed = 1.0;

    public float $temperature = 0.75;

    public int $topK = 20;

    public float $topP = 0.75;

    public float $repetitionPenalty = 2.0;

    public float $lengthPenalty = 1.0;

    // Voice ref
    public $voiceRefFile = null;

    public ?string $voiceRefName = null;

    // Endpoint
    public string $modalEndpointUrl = '';

    // Audio output
    public ?string $ttsAudioUrl = null;

    public function resetParams(): void
    {
        $this->speed = 1.0;
        $this->temperature = 0.75;
        $this->topK = 20;
        $this->topP = 0.75;
        $this->repetitionPenalty = 2.0;
        $this->lengthPenalty = 1.0;
    }

    public function removeVoiceRef(): void
    {
        $this->voiceRefFile = null;
        $this->voiceRefName = null;
    }

    public function updatedVoiceRefFile(): void
    {
        if ($this->voiceRefFile) {
            $this->voiceRefName = $this->voiceRefFile->getClientOriginalName();
        }
    }

    public function synthesize(): void
    {
        if (empty($this->text) || ! $this->voiceRefName) {
            return;
        }

        $this->ttsStatus = 'synthesizing';
        $this->statusMessage = 'Sintetizando...';

        // TODO: Enviar para endpoint XTTS v2

        $this->ttsStatus = 'idle';
        $this->statusMessage = null;
    }

    public function render()
    {
        return view('livewire.panel-tts');
    }
}
