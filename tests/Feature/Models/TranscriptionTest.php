<?php

namespace Tests\Feature\Models;

use App\Enums\OutputStyle;
use App\Enums\RecordingStyle;
use App\Enums\TranscriptionStatus;
use App\Models\Synthesis;
use App\Models\Transcription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TranscriptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_transcription_with_factory(): void
    {
        $transcription = Transcription::factory()->create();

        $this->assertDatabaseHas('transcriptions', ['id' => $transcription->id]);
        $this->assertInstanceOf(TranscriptionStatus::class, $transcription->status);
        $this->assertInstanceOf(OutputStyle::class, $transcription->output_style);
        $this->assertInstanceOf(RecordingStyle::class, $transcription->recording_style);
    }

    public function test_pending_state_has_no_text(): void
    {
        $transcription = Transcription::factory()->pending()->create();

        $this->assertEquals(TranscriptionStatus::Pending, $transcription->status);
        $this->assertNull($transcription->text);
        $this->assertNull($transcription->inference_time_s);
    }

    public function test_failed_state_has_error_message(): void
    {
        $transcription = Transcription::factory()->failed()->create();

        $this->assertEquals(TranscriptionStatus::Failed, $transcription->status);
        $this->assertNotNull($transcription->error_message);
        $this->assertNull($transcription->text);
    }

    public function test_has_many_syntheses(): void
    {
        $transcription = Transcription::factory()->create();
        Synthesis::factory()->count(2)->create(['transcription_id' => $transcription->id]);

        $this->assertCount(2, $transcription->syntheses);
    }

    public function test_metadata_cast_as_array(): void
    {
        $transcription = Transcription::factory()->create([
            'metadata' => ['segments' => 5, 'avg_logprob' => -0.23],
        ]);

        $transcription->refresh();
        $this->assertIsArray($transcription->metadata);
        $this->assertEquals(5, $transcription->metadata['segments']);
    }

    public function test_ulid_is_used_as_primary_key(): void
    {
        $transcription = Transcription::factory()->create();

        $this->assertMatchesRegularExpression('/^[0-9A-Za-z]{26}$/', $transcription->id);
    }
}
