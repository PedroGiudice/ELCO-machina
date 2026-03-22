<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class TtsService
{
    /**
     * Synthesize speech via a deployed TTS model endpoint.
     *
     * For qwen-tts: ref_audio_path (volume filename) + ref_text are required.
     * For chatterbox: ref_audio sent as base64 (no volume support).
     *
     * @param  array<string, mixed>  $params  Model-specific params (exaggeration, cfg_weight)
     * @return array{audio_bytes: ?string, inference_time: ?float, audio_duration: ?float, sample_rate: ?int, success: bool, error: ?string}
     */
    public function synthesize(
        string $text,
        ?string $volumeFilename = null,
        ?string $refText = null,
        ?string $localRefPath = null,
        ?string $model = null,
        string $language = 'pt',
        array $params = [],
    ): array {
        $model ??= config('voice.defaults.tts', 'qwen-tts');
        $endpoint = config("voice.models.{$model}.endpoint");

        if (! $endpoint) {
            return $this->fail("Modelo '{$model}' nao tem endpoint configurado.");
        }

        if (trim($text) === '') {
            return $this->fail('Texto vazio.');
        }

        $formData = ['text' => $text];

        // Language mapping (Qwen uses full name, Chatterbox uses ISO code)
        if ($model === 'qwen-tts') {
            $langMap = ['pt' => 'Portuguese', 'en' => 'English', 'es' => 'Spanish'];
            $formData['language'] = $langMap[$language] ?? 'Portuguese';
        } else {
            $formData['language'] = $language;
        }

        // Voice reference
        if ($model === 'qwen-tts') {
            if (! $volumeFilename) {
                return $this->fail('Qwen3-TTS requer audio de referencia (volume_filename).');
            }
            if (! $refText || trim($refText) === '') {
                return $this->fail('Qwen3-TTS requer ref_text (transcricao do audio de referencia).');
            }
            $formData['ref_audio_path'] = $volumeFilename;
            $formData['ref_text'] = $refText;
        } elseif ($model === 'chatterbox') {
            if ($localRefPath && file_exists($localRefPath)) {
                $formData['ref_audio_base64'] = base64_encode(file_get_contents($localRefPath));
            }
            $formData['exaggeration'] = (string) ($params['exaggeration'] ?? 0.5);
            $formData['cfg_weight'] = (string) ($params['cfg_weight'] ?? 0.5);
        }

        try {
            $response = Http::timeout(180)
                ->asForm()
                ->post($endpoint, $formData);

            if (! $response->successful()) {
                return $this->fail("HTTP {$response->status()}: ".mb_substr($response->body(), 0, 200));
            }

            return [
                'audio_bytes' => $response->body(),
                'inference_time' => (float) $response->header('X-Inference-Time'),
                'audio_duration' => (float) $response->header('X-Audio-Duration'),
                'sample_rate' => (int) $response->header('X-Sample-Rate'),
                'success' => true,
                'error' => null,
            ];
        } catch (\Throwable $e) {
            return $this->fail(mb_substr($e->getMessage(), 0, 200));
        }
    }

    /**
     * Upload a voice reference file (+ companion ref_text .txt) to the Modal volume.
     *
     * @return array{success: bool, filename: ?string, error: ?string}
     */
    public function uploadVoiceToVolume(
        string $localPath,
        string $volumeFilename,
        string $refText = '',
    ): array {
        $volume = config('voice.models.qwen-tts.volume', 'tts-voice-refs');

        if (! file_exists($localPath)) {
            return ['success' => false, 'filename' => null, 'error' => "Arquivo nao encontrado: {$localPath}"];
        }

        // Upload audio to Modal volume
        $result = \Illuminate\Support\Facades\Process::run(
            "modal volume put {$volume} {$localPath} {$volumeFilename}"
        );

        if (! $result->successful()) {
            return ['success' => false, 'filename' => null, 'error' => 'modal volume put falhou: '.$result->errorOutput()];
        }

        // Upload companion ref_text .txt
        if (trim($refText) !== '') {
            $txtName = pathinfo($volumeFilename, PATHINFO_FILENAME).'.txt';
            $tmpTxt = tempnam(sys_get_temp_dir(), 'ref_').'.txt';
            file_put_contents($tmpTxt, trim($refText));

            \Illuminate\Support\Facades\Process::run(
                "modal volume put {$volume} {$tmpTxt} {$txtName}"
            );
            unlink($tmpTxt);
        }

        return ['success' => true, 'filename' => $volumeFilename, 'error' => null];
    }

    /**
     * @return array{audio_bytes: null, inference_time: null, audio_duration: null, sample_rate: null, success: false, error: string}
     */
    private function fail(string $error): array
    {
        return [
            'audio_bytes' => null,
            'inference_time' => null,
            'audio_duration' => null,
            'sample_rate' => null,
            'success' => false,
            'error' => $error,
        ];
    }
}
