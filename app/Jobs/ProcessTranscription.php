<?php

namespace App\Jobs;

use App\Enums\TranscriptionStatus;
use App\Models\Transcription;
use App\Services\ModalService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use RuntimeException;

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
            $sttModel = $modalService->defaultModel('stt');

            $response = $modalService->run($sttModel, [
                'audio' => $transcription->audio_volume_path,
                'language' => $transcription->language,
                'use_volume' => true,
            ]);

            $result = $response['result'];

            if ($result === null) {
                throw new RuntimeException('Modal returned no result');
            }

            $transcription->update([
                'status' => TranscriptionStatus::Completed,
                'text' => $result['text'] ?? null,
                'inference_time_s' => $result['inference_s'] ?? $result['inference_time_s'] ?? null,
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
