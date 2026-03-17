<?php

namespace App\Livewire;

use Livewire\Component;

class PanelConfig extends Component
{
    public string $aiModel = 'sonnet';

    public string $sttBackend = 'modal';

    public bool $noiseSuppression = true;

    public bool $echoCancellation = true;

    public bool $autoGainControl = true;

    public string $selectedMicId = 'default';

    public array $aiModels = [
        ['id' => 'haiku', 'label' => 'Haiku', 'desc' => 'Mais rapido'],
        ['id' => 'sonnet', 'label' => 'Sonnet', 'desc' => 'Equilibrado'],
        ['id' => 'opus', 'label' => 'Opus', 'desc' => 'Qualidade maxima'],
    ];

    public array $sttBackends = [
        ['id' => 'vm', 'label' => 'VM', 'desc' => 'whisper.cpp small (CPU, ~80s/min)'],
        ['id' => 'modal', 'label' => 'Modal', 'desc' => 'large-v3-turbo (GPU, ~8s/min)'],
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
