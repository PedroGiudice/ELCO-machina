<?php

namespace Database\Factories;

use App\Enums\OutputStyle;
use App\Enums\RecordingStyle;
use App\Enums\TranscriptionStatus;
use App\Models\Transcription;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Transcription> */
class TranscriptionFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'text' => fake()->paragraphs(2, true),
            'output_style' => OutputStyle::Verbatim,
            'language' => 'pt',
            'recording_style' => RecordingStyle::Dictation,
            'audio_volume_path' => 'volumes/audio/'.fake()->uuid().'.wav',
            'audio_size_bytes' => fake()->numberBetween(100_000, 5_000_000),
            'audio_duration_s' => fake()->randomFloat(2, 5.0, 300.0),
            'engine' => 'whisper-vllm',
            'status' => TranscriptionStatus::Completed,
            'error_message' => null,
            'inference_time_s' => fake()->randomFloat(2, 1.0, 30.0),
            'rtf' => fake()->randomFloat(3, 0.01, 0.5),
            'metadata' => null,
        ];
    }

    public function pending(): static
    {
        return $this->state([
            'status' => TranscriptionStatus::Pending,
            'text' => null,
            'inference_time_s' => null,
            'rtf' => null,
        ]);
    }

    public function processing(): static
    {
        return $this->state([
            'status' => TranscriptionStatus::Processing,
            'text' => null,
            'inference_time_s' => null,
            'rtf' => null,
        ]);
    }

    public function failed(): static
    {
        return $this->state([
            'status' => TranscriptionStatus::Failed,
            'text' => null,
            'error_message' => 'Modal process failed: GPU timeout after 300s',
            'inference_time_s' => null,
            'rtf' => null,
        ]);
    }
}
