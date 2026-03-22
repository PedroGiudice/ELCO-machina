<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class RefinerService
{
    private string $endpoint;

    private int $timeout;

    public function __construct()
    {
        $this->endpoint = config('voice.refiner.endpoint', '');
        $this->timeout = (int) config('voice.refiner.timeout', 30);
    }

    /**
     * Refine transcribed text via Qwen3-4B (vLLM on Modal).
     *
     * @return array{refined_text: string, model_used: string, success: bool, error: ?string, inference_s: ?float}
     */
    public function refine(
        string $text,
        string $systemInstruction,
    ): array {
        if (trim($text) === '') {
            return [
                'refined_text' => $text,
                'model_used' => 'none',
                'success' => false,
                'error' => 'Texto vazio',
            ];
        }

        if ($this->endpoint === '') {
            return [
                'refined_text' => $text,
                'model_used' => 'none',
                'success' => false,
                'error' => 'REFINER_ENDPOINT not configured',
            ];
        }

        try {
            $response = Http::timeout($this->timeout)
                ->asForm()
                ->post($this->endpoint, [
                    'text' => $text,
                    'system_prompt' => $systemInstruction,
                    'max_tokens' => min(mb_strlen($text) * 3, 4096),
                ]);

            if (! $response->successful()) {
                return [
                    'refined_text' => $text,
                    'model_used' => 'qwen3-4b',
                    'success' => false,
                    'error' => "HTTP {$response->status()}: ".mb_substr($response->body(), 0, 200),
                ];
            }

            $data = $response->json();

            if (! ($data['success'] ?? false)) {
                return [
                    'refined_text' => $text,
                    'model_used' => $data['model'] ?? 'qwen3-4b',
                    'success' => false,
                    'error' => $data['error'] ?? 'Unknown error from refiner',
                ];
            }

            $refined = trim($data['refined_text'] ?? '');
            if ($refined === '') {
                return [
                    'refined_text' => $text,
                    'model_used' => $data['model'] ?? 'qwen3-4b',
                    'success' => false,
                    'error' => 'Refiner retornou texto vazio',
                ];
            }

            return [
                'refined_text' => $refined,
                'model_used' => $data['model'] ?? 'qwen3-4b',
                'success' => true,
                'error' => null,
                'inference_s' => $data['inference_s'] ?? null,
            ];
        } catch (\Throwable $e) {
            return [
                'refined_text' => $text,
                'model_used' => 'qwen3-4b',
                'success' => false,
                'error' => mb_substr($e->getMessage(), 0, 200),
            ];
        }
    }
}
