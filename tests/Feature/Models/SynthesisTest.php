<?php

namespace Tests\Feature\Models;

use App\Enums\TranscriptionStatus;
use App\Models\Synthesis;
use App\Models\Transcription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SynthesisTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_synthesis_with_factory(): void
    {
        $synthesis = Synthesis::factory()->create();

        $this->assertDatabaseHas('syntheses', ['id' => $synthesis->id]);
        $this->assertInstanceOf(TranscriptionStatus::class, $synthesis->status);
    }

    public function test_belongs_to_transcription(): void
    {
        $transcription = Transcription::factory()->create();
        $synthesis = Synthesis::factory()->create(['transcription_id' => $transcription->id]);

        $this->assertEquals($transcription->id, $synthesis->transcription->id);
    }

    public function test_transcription_is_nullable(): void
    {
        $synthesis = Synthesis::factory()->create(['transcription_id' => null]);

        $this->assertNull($synthesis->transcription);
    }

    public function test_params_cast_as_array(): void
    {
        $synthesis = Synthesis::factory()->create([
            'params' => ['temperature' => 0.8, 'top_k' => 50],
        ]);

        $synthesis->refresh();
        $this->assertIsArray($synthesis->params);
        $this->assertEquals(0.8, $synthesis->params['temperature']);
    }

    public function test_pending_state(): void
    {
        $synthesis = Synthesis::factory()->pending()->create();

        $this->assertEquals(TranscriptionStatus::Pending, $synthesis->status);
        $this->assertNull($synthesis->audio_volume_path);
    }
}
