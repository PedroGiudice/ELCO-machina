<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class TtsService
{
    /**
     * Synthesize speech via a deployed TTS model endpoint.
     *
     * @param  array<string, mixed>  $params  Model-specific params (exaggeration, cfg_weight, ref_text)
     * @return array{audio_bytes: string, inference_time: ?float, audio_duration: ?float, sample_rate: ?int, success: bool, error: ?string}
     */
    public function synthesize(
        string $text,
        ?string $refAudioPath = null,
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

        // Ref audio as base64
        if ($refAudioPath && file_exists($refAudioPath)) {
            $formData['ref_audio_base64'] = base64_encode(file_get_contents($refAudioPath));
        }

        // Model-specific params
        if ($model === 'qwen-tts') {
            if (! empty($params['ref_text'])) {
                $formData['ref_text'] = $params['ref_text'];
            }
        } elseif ($model === 'chatterbox') {
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
