<?php

return [
    'scripts_path' => env('VOICE_SCRIPTS_PATH', base_path('scripts')),

    // Models with web endpoints use HTTP directly (no subprocess).
    // Models without endpoints fall back to subprocess (modal run / python3).
    'models' => [
        'whisper' => [
            'script' => 'modal_whisper_bench.py',
            'gpu' => 'T4',
            'deployed' => false,
        ],
        'whisper-http' => [
            'script' => 'modal_whisper_http.py',
            'gpu' => 'L4',
            'deployed' => true,
            'endpoint' => env('WHISPER_HTTP_ENDPOINT'),
            'health' => env('WHISPER_HTTP_HEALTH'),
        ],
        'whisper-offline' => [
            'script' => 'modal_whisper_offline.py',
            'gpu' => 'L4',
            'deployed' => false,
        ],
        'xtts' => [
            'script' => 'modal_xtts_bench.py',
            'gpu' => 'L4',
            'deployed' => false,
        ],
        'xtts-serve' => [
            'script' => 'modal_xtts_serve.py',
            'gpu' => 'L4',
            'deployed' => true,
            'endpoint' => env('XTTS_SERVE_ENDPOINT'),
            'health' => env('XTTS_SERVE_HEALTH'),
        ],
    ],

    // Default model for each pipeline stage
    'defaults' => [
        'stt' => env('VOICE_STT_MODEL', 'whisper-http'),
        'tts' => env('VOICE_TTS_MODEL', 'xtts-serve'),
    ],

    // Refiner (Qwen3-4B via Modal vLLM)
    'refiner' => [
        'endpoint' => env('REFINER_ENDPOINT'),
        'health' => env('REFINER_HEALTH'),
        'timeout' => (int) env('REFINER_TIMEOUT', 30),
    ],
];
