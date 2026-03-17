<?php

namespace Database\Factories;

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
            'temperature' => fake()->randomFloat(1, 0, 2),
            'is_default' => false,
            'is_builtin' => false,
            'sort_order' => fake()->numberBetween(0, 10),
        ];
    }

    public function default(): static
    {
        return $this->state([
            'is_default' => true,
        ]);
    }

    public function builtin(): static
    {
        return $this->state([
            'is_builtin' => true,
        ]);
    }
}
