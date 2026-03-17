<?php

namespace Database\Factories;

use App\Enums\TranscriptionStatus;
use App\Models\Synthesis;
use App\Models\Transcription;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Synthesis> */
class SynthesisFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'transcription_id' => Transcription::factory(),
            'input_text' => fake()->paragraphs(1, true),
            'audio_volume_path' => 'volumes/tts/'.fake()->uuid().'.wav',
            'engine' => 'xtts-serve',
            'voice_ref_path' => 'volumes/refs/reference.wav',
            'params' => ['temperature' => 0.75, 'top_k' => 20, 'top_p' => 0.75],
            'status' => TranscriptionStatus::Completed,
            'error_message' => null,
            'inference_time_s' => fake()->randomFloat(2, 2.0, 60.0),
            'audio_duration_s' => fake()->randomFloat(2, 5.0, 120.0),
        ];
    }

    public function pending(): static
    {
        return $this->state([
            'status' => TranscriptionStatus::Pending,
            'audio_volume_path' => null,
            'inference_time_s' => null,
            'audio_duration_s' => null,
        ]);
    }

    public function failed(): static
    {
        return $this->state([
            'status' => TranscriptionStatus::Failed,
            'audio_volume_path' => null,
            'error_message' => 'XTTS inference failed: voice reference too short',
            'inference_time_s' => null,
            'audio_duration_s' => null,
        ]);
    }
}
