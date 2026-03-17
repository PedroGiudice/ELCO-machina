<?php

namespace App\Livewire;

use Livewire\Component;

class PanelStats extends Component
{
    public bool $sidecarAvailable = false;

    public string $sidecarStatus = 'offline';

    public string $sttBackend = 'modal';

    public bool $isSpeaking = false;

    public string $aiModel = 'sonnet';

    public bool $hasApiKey = false;

    public bool $isRecording = false;

    public bool $isProcessing = false;

    public string $selectedMicLabel = 'Default Mic';

    public string $appVersion = '0.3.3';

    public string $activeFilter = 'all';

    public array $logs = [];

    public array $filterChips = [
        ['id' => 'all', 'label' => 'Todos'],
        ['id' => 'stt', 'label' => 'STT'],
        ['id' => 'tts', 'label' => 'TTS'],
        ['id' => 'refiner', 'label' => 'Refiner'],
        ['id' => 'audio', 'label' => 'Audio'],
        ['id' => 'app', 'label' => 'App'],
        ['id' => 'ipc', 'label' => 'IPC'],
    ];

    public function setFilter(string $filter): void
    {
        $this->activeFilter = $filter;
    }

    public function getFilteredLogsProperty(): array
    {
        if ($this->activeFilter === 'all') {
            return $this->logs;
        }

        return array_filter($this->logs, fn ($log) => ($log['category'] ?? '') === $this->activeFilter);
    }

    public function render()
    {
        return view('livewire.panel-stats', [
            'filteredLogs' => $this->filteredLogs,
        ]);
    }
}
