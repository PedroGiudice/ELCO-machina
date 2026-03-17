<?php

namespace App\Jobs;

use App\Enums\TranscriptionStatus;
use App\Models\Transcription;
use App\Services\ModalService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
class ProcessTranscription implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 600;

    public function __construct(
        private readonly string $transcriptionId,
    ) {}

    public function handle(ModalService $modalService): void
    {
        $transcription = Transcription::findOrFail($this->transcriptionId);

        $transcription->update(['status' => TranscriptionStatus::Processing]);

        try {
            $audioPath = storage_path("app/{$transcription->audio_path}");

            $result = $modalService->transcribe(
                audioPath: $audioPath,
                language: $transcription->language,
            );

            $transcription->update([
                'status' => TranscriptionStatus::Completed,
                'text' => $result['text'] ?? null,
                'inference_time_s' => $result['inference_s'] ?? null,
                'rtf' => $result['rtf'] ?? null,
                'metadata' => $result,
            ]);
        } catch (\Throwable $e) {
            $transcription->update([
                'status' => TranscriptionStatus::Failed,
                'error_message' => mb_substr($e->getMessage(), 0, 1000),
            ]);

            throw $e;
        }
    }
}
