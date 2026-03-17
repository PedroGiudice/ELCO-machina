<?php

namespace Database\Factories;

use App\Enums\OutputStyle;
use App\Models\Prompt;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Prompt> */
class PromptFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'name' => fake()->words(3, true),
            'content' => 'Transcreva o audio a seguir de forma literal, mantendo todas as palavras e pausas.',
            'output_style' => fake()->randomElement(OutputStyle::cases()),
            'is_default' => false,
            'sort_order' => fake()->numberBetween(0, 10),
        ];
    }

    public function default(): static
    {
        return $this->state([
            'is_default' => true,
        ]);
    }
}
