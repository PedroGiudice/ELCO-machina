<?php

namespace Tests\Feature\Jobs;

use App\Enums\TranscriptionStatus;
use App\Jobs\ProcessTranscription;
use App\Models\Transcription;
use App\Services\ModalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class ProcessTranscriptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_marks_transcription_as_processing_then_completed(): void
    {
        $transcription = Transcription::factory()->pending()->create();

        $mockModal = Mockery::mock(ModalService::class);
        $mockModal->shouldReceive('run')
            ->once()
            ->with('whisper-vllm', Mockery::on(function (array $options) use ($transcription) {
                return $options['audio'] === $transcription->audio_volume_path
                    && $options['language'] === 'pt'
                    && $options['use_volume'] === true;
            }))
            ->andReturn([
                'result' => [
                    'text' => 'Texto transcrito de teste.',
                    'inference_time_s' => 5.2,
                    'rtf' => 0.12,
                    'metadata' => ['segments' => 3],
                ],
                'progress' => [],
                'exit_code' => 0,
            ]);

        $this->app->instance(ModalService::class, $mockModal);

        $job = new ProcessTranscription($transcription->id);
        $job->handle($mockModal);

        $transcription->refresh();
        $this->assertEquals(TranscriptionStatus::Completed, $transcription->status);
        $this->assertEquals('Texto transcrito de teste.', $transcription->text);
        $this->assertEquals(5.2, $transcription->inference_time_s);
        $this->assertEquals(0.12, $transcription->rtf);
        $this->assertIsArray($transcription->metadata);
    }

    public function test_marks_transcription_as_failed_on_exception(): void
    {
        $transcription = Transcription::factory()->pending()->create();

        $mockModal = Mockery::mock(ModalService::class);
        $mockModal->shouldReceive('run')
            ->once()
            ->andThrow(new \RuntimeException('GPU timeout'));

        $this->app->instance(ModalService::class, $mockModal);

        $job = new ProcessTranscription($transcription->id);

        try {
            $job->handle($mockModal);
        } catch (\RuntimeException) {
            // Esperado -- o job re-throws para retry
        }

        $transcription->refresh();
        $this->assertEquals(TranscriptionStatus::Failed, $transcription->status);
        $this->assertStringContainsString('GPU timeout', $transcription->error_message);
    }

    public function test_marks_transcription_as_failed_when_no_result(): void
    {
        $transcription = Transcription::factory()->pending()->create();

        $mockModal = Mockery::mock(ModalService::class);
        $mockModal->shouldReceive('run')
            ->once()
            ->andReturn([
                'result' => null,
                'progress' => [],
                'exit_code' => 0,
            ]);

        $this->app->instance(ModalService::class, $mockModal);

        $job = new ProcessTranscription($transcription->id);

        try {
            $job->handle($mockModal);
        } catch (\RuntimeException) {
            // Esperado
        }

        $transcription->refresh();
        $this->assertEquals(TranscriptionStatus::Failed, $transcription->status);
        $this->assertStringContainsString('no result', $transcription->error_message);
    }
}
