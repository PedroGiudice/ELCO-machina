<?php

namespace App\Livewire;

use App\Models\Prompt;
use Illuminate\Contracts\View\View;
use Livewire\Attributes\On;
use Livewire\Component;

class PromptEditor extends Component
{
    public bool $isOpen = false;

    public ?string $promptId = null;

    public string $name = '';

    public string $systemInstruction = '';

    public float $temperature = 0.4;

    public bool $isBuiltin = false;

    public bool $confirmDelete = false;

    public bool $isSaving = false;

    public const MAX_INSTRUCTION_LENGTH = 5120;

    /** @var array<int, string> */
    public array $placeholders = [
        '{CONTEXT_MEMORY}',
        '{OUTPUT_LANGUAGE}',
        '{RECORDING_STYLE}',
        '{CUSTOM_INSTRUCTIONS}',
    ];

    #[On('edit-prompt')]
    public function editPrompt(string $promptId): void
    {
        $prompt = Prompt::query()->find($promptId);

        if (! $prompt) {
            return;
        }

        $this->promptId = $prompt->id;
        $this->name = $prompt->name;
        $this->systemInstruction = $prompt->content;
        $this->temperature = $prompt->temperature;
        $this->isBuiltin = $prompt->is_builtin;
        $this->confirmDelete = false;
        $this->isSaving = false;
        $this->isOpen = true;
    }

    public function save(): void
    {
        if (! $this->promptId || $this->isSaving) {
            return;
        }

        $this->isSaving = true;

        $prompt = Prompt::query()->find($this->promptId);

        if (! $prompt) {
            $this->isSaving = false;

            return;
        }

        $prompt->update([
            'name' => trim($this->name),
            'content' => mb_substr($this->systemInstruction, 0, self::MAX_INSTRUCTION_LENGTH),
            'temperature' => $this->temperature,
        ]);

        $this->isSaving = false;
        $this->isOpen = false;
        $this->dispatch('prompt-saved');
    }

    public function duplicate(): void
    {
        if (! $this->promptId) {
            return;
        }

        $original = Prompt::query()->find($this->promptId);

        if (! $original) {
            return;
        }

        $copy = $original->replicate();
        $copy->name = $original->name.' (copy)';
        $copy->is_builtin = false;
        $copy->is_default = false;
        $copy->save();

        $this->isOpen = false;
        $this->dispatch('prompt-saved');
        $this->dispatch('edit-prompt', promptId: $copy->id);
    }

    public function deletePrompt(): void
    {
        if (! $this->promptId || $this->isBuiltin) {
            return;
        }

        if (! $this->confirmDelete) {
            $this->confirmDelete = true;

            return;
        }

        Prompt::query()->where('id', $this->promptId)->where('is_builtin', false)->delete();

        $this->isOpen = false;
        $this->confirmDelete = false;
        $this->dispatch('prompt-saved');
    }

    public function close(): void
    {
        $this->isOpen = false;
        $this->confirmDelete = false;
    }

    public function render(): View
    {
        return view('livewire.prompt-editor');
    }
}
