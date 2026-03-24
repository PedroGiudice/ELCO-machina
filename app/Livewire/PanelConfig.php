<?php

namespace App\Livewire;

use Livewire\Component;

class PanelConfig extends Component
{
    public string $aiModel = 'qwen3-4b';

    public string $sttBackend = 'whisper-http';

    public bool $noiseSuppression = true;

    public bool $echoCancellation = true;

    public bool $autoGainControl = true;

    public string $selectedMicId = 'default';

    public array $aiModels = [
        ['id' => 'qwen3-4b', 'label' => 'Qwen3-4B', 'desc' => 'Refinamento via Modal (GPU)'],
    ];

    public array $sttBackends = [
        ['id' => 'whisper-http', 'label' => 'Whisper HTTP', 'desc' => 'large-v3-turbo (Modal GPU, ~8s/min)'],
    ];

    public function setAiModel(string $model): void
    {
        $this->aiModel = $model;
    }

    public function setSttBackend(string $backend): void
    {
        $this->sttBackend = $backend;
    }

    public function toggleNoiseSuppression(): void
    {
        $this->noiseSuppression = ! $this->noiseSuppression;
    }

    public function toggleEchoCancellation(): void
    {
        $this->echoCancellation = ! $this->echoCancellation;
    }

    public function toggleAutoGainControl(): void
    {
        $this->autoGainControl = ! $this->autoGainControl;
    }

    public function render()
    {
        return view('livewire.panel-config');
    }
}
