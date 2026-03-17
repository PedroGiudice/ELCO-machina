<?php

namespace App\Livewire;

use App\Models\Prompt;
use Database\Seeders\PromptSeeder;
use Illuminate\Contracts\View\View;
use Livewire\Attributes\On;
use Livewire\Component;
use Livewire\WithFileUploads;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PromptManager extends Component
{
    use WithFileUploads;

    public bool $isOpen = false;

    public bool $confirmReset = false;

    public ?string $deletingId = null;

    public $importFile = null;

    #[On('open-prompt-manager')]
    public function open(): void
    {
        $this->isOpen = true;
        $this->confirmReset = false;
        $this->deletingId = null;
    }

    #[On('prompt-saved')]
    public function refreshList(): void
    {
        // Livewire re-renders automatically, this just ensures the event is caught
    }

    public function close(): void
    {
        $this->isOpen = false;
        $this->confirmReset = false;
        $this->deletingId = null;
    }

    public function newPrompt(): void
    {
        $prompt = Prompt::query()->create([
            'name' => 'New Prompt',
            'content' => '',
            'temperature' => 0.4,
            'is_builtin' => false,
            'is_default' => false,
            'sort_order' => Prompt::query()->max('sort_order') + 1,
        ]);

        $this->isOpen = false;
        $this->dispatch('edit-prompt', promptId: $prompt->id);
    }

    public function editTemplate(string $promptId): void
    {
        $this->isOpen = false;
        $this->dispatch('edit-prompt', promptId: $promptId);
    }

    public function duplicatePrompt(string $promptId): void
    {
        $original = Prompt::query()->find($promptId);

        if (! $original) {
            return;
        }

        $copy = $original->replicate();
        $copy->name = $original->name.' (copy)';
        $copy->is_builtin = false;
        $copy->is_default = false;
        $copy->sort_order = Prompt::query()->max('sort_order') + 1;
        $copy->save();

        $this->dispatch('prompt-saved');
    }

    public function deletePrompt(string $id): void
    {
        if ($this->deletingId !== $id) {
            $this->deletingId = $id;

            return;
        }

        Prompt::query()->where('id', $id)->where('is_builtin', false)->delete();
        $this->deletingId = null;
        $this->dispatch('prompt-saved');
    }

    public function resetBuiltins(): void
    {
        if (! $this->confirmReset) {
            $this->confirmReset = true;

            return;
        }

        // Re-run the seeder to restore builtins to defaults
        $seeder = new PromptSeeder;
        $seeder->run();

        $this->confirmReset = false;
        $this->dispatch('prompt-saved');
    }

    public function exportPrompts(): StreamedResponse
    {
        $prompts = Prompt::query()->orderBy('sort_order')->get();

        /** @var array<int, array<string, mixed>> $data */
        $data = $prompts->map(fn (Prompt $p): array => [
            'name' => $p->name,
            'systemInstruction' => $p->content,
            'temperature' => $p->temperature,
            'isBuiltin' => $p->is_builtin,
        ])->all();

        return response()->streamDownload(function () use ($data): void {
            echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        }, 'prompt-templates.json', [
            'Content-Type' => 'application/json',
        ]);
    }

    public function importPrompts(): void
    {
        if (! $this->importFile) {
            return;
        }

        $this->validate([
            'importFile' => 'file|max:1024|mimes:json,txt',
        ]);

        $json = file_get_contents($this->importFile->getRealPath());

        if ($json === false) {
            return;
        }

        /** @var array<int, array{name: string, systemInstruction: string, temperature: float}>|null $imported */
        $imported = json_decode($json, true);

        if (! is_array($imported)) {
            return;
        }

        $maxSort = (int) Prompt::query()->max('sort_order');

        foreach ($imported as $template) {
            if (! isset($template['name'], $template['systemInstruction'])) {
                continue;
            }

            $maxSort++;
            Prompt::query()->create([
                'name' => $template['name'],
                'content' => $template['systemInstruction'],
                'temperature' => $template['temperature'] ?? 0.4,
                'is_builtin' => false,
                'is_default' => false,
                'sort_order' => $maxSort,
            ]);
        }

        $this->importFile = null;
        $this->dispatch('prompt-saved');
    }

    public function render(): View
    {
        $builtins = Prompt::query()->where('is_builtin', true)->orderBy('sort_order')->get();
        $customs = Prompt::query()->where('is_builtin', false)->orderBy('sort_order')->get();

        return view('livewire.prompt-manager', [
            'builtins' => $builtins,
            'customs' => $customs,
        ]);
    }
}
