<?php

return [
    'scripts_path' => env('VOICE_SCRIPTS_PATH', base_path('scripts')),

    // whisper: faster-whisper CTranslate2. T4. `modal run` (benchmark).
    // whisper-vllm: vLLM + GPU snapshot. L4. `python3` (deployed).
    // xtts: XTTS v2 voice cloning. L4. `modal run` (benchmark).
    // xtts-serve: XTTS v2 endpoint HTTP. L4. `modal deploy`.
    'models' => [
        'whisper' => [
            'script' => 'modal_whisper_bench.py',
            'gpu' => 'T4',
            'deployed' => false,
        ],
        'whisper-vllm' => [
            'script' => 'modal_whisper_vllm.py',
            'gpu' => 'L4',
            'deployed' => true,
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
        ],
    ],

    // Default model for each pipeline stage
    'defaults' => [
        'stt' => env('VOICE_STT_MODEL', 'whisper-vllm'),
        'tts' => env('VOICE_TTS_MODEL', 'xtts-serve'),
    ],
];
