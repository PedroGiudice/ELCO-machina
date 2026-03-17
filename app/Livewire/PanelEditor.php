<?php

namespace App\Livewire;

use Livewire\Component;

class PanelEditor extends Component
{
    public string $value = '';

    public int $fontSize = 14;

    public string $outputStyle = 'Verbatim';

    public string $activeContext = 'General';

    public string $aiModel = 'sonnet';

    public bool $isProcessing = false;

    public function clear(): void
    {
        $this->value = '';
    }

    public function copy(): void
    {
        $this->dispatch('copy-to-clipboard', text: $this->value);
    }

    public function increaseFontSize(): void
    {
        $this->fontSize = min(24, $this->fontSize + 1);
    }

    public function decreaseFontSize(): void
    {
        $this->fontSize = max(10, $this->fontSize - 1);
    }

    public function render()
    {
        $lineCount = substr_count($this->value, "\n") + 1;
        $charCount = mb_strlen($this->value);

        return view('livewire.panel-editor', [
            'lineCount' => $lineCount,
            'charCount' => $charCount,
        ]);
    }
}
