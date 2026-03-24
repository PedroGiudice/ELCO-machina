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
        'qwen-tts' => [
            'script' => 'modal_tts_qwen_vllm_snap.py',
            'gpu' => 'H100',
            'deployed' => true,
            'endpoint' => env('QWEN_TTS_ENDPOINT'),
            'volume' => 'tts-voice-refs',
            'health' => env('QWEN_TTS_HEALTH'),
        ],
        'chatterbox' => [
            'script' => 'modal_tts_chatterbox.py',
            'gpu' => 'A10G',
            'deployed' => true,
            'endpoint' => env('CHATTERBOX_TTS_ENDPOINT'),
            'health' => env('CHATTERBOX_TTS_HEALTH'),
        ],
    ],

    // Default model for each pipeline stage
    'defaults' => [
        'stt' => env('VOICE_STT_MODEL', 'whisper-http'),
        'tts' => env('VOICE_TTS_MODEL', 'qwen-tts'),
    ],

    // VoiceDesign (Qwen3-TTS VoiceDesign via Modal SDK subprocess)
    'voice_design' => [
        'script' => env('VOICE_DESIGN_SCRIPT', base_path('scripts/voicedesign_client.py')),
        'timeout' => (int) env('VOICE_DESIGN_TIMEOUT', 600),
    ],

    // Refiner (Qwen3-4B via Modal vLLM)
    'refiner' => [
        'endpoint' => env('REFINER_ENDPOINT'),
        'health' => env('REFINER_HEALTH'),
        'timeout' => (int) env('REFINER_TIMEOUT', 30),
    ],
];
