<?php

namespace App\Services;

use Symfony\Component\Process\Process;

class RefinerService
{
    private int $timeout;

    public function __construct()
    {
        $this->timeout = (int) config('voice.refiner.timeout', 60);
    }

    /**
     * Refine transcribed text via Claude CLI headless.
     *
     * Equivalent to sidecar's ClaudeRefiner:
     *   env -u CLAUDECODE claude -p "$text" --system-prompt "$instruction"
     *       --model "$model" --effort low --output-format text
     *       --no-session-persistence --tools "" --disable-slash-commands
     *
     * @return array{refined_text: string, model_used: string, success: bool, error: ?string}
     */
    public function refine(
        string $text,
        string $systemInstruction,
        string $model = 'sonnet',
        float $_temperature = 0.3,
    ): array {
        if (trim($text) === '') {
            return [
                'refined_text' => $text,
                'model_used' => $model,
                'success' => false,
                'error' => 'Texto vazio',
            ];
        }

        $command = [
            'env', '-u', 'CLAUDECODE',
            'claude',
            '-p', $text,
            '--system-prompt', $systemInstruction,
            '--model', $model,
            '--effort', 'low',
            '--output-format', 'text',
            '--no-session-persistence',
            '--tools', '',
            '--disable-slash-commands',
        ];

        $process = new Process($command);
        $process->setTimeout($this->timeout);

        try {
            $process->run();
        } catch (\Throwable $e) {
            return [
                'refined_text' => $text,
                'model_used' => $model,
                'success' => false,
                'error' => 'Process error: '.mb_substr($e->getMessage(), 0, 200),
            ];
        }

        if (! $process->isSuccessful()) {
            $stderr = mb_substr($process->getErrorOutput(), 0, 500);

            return [
                'refined_text' => $text,
                'model_used' => $model,
                'success' => false,
                'error' => "Claude CLI exit {$process->getExitCode()}: {$stderr}",
            ];
        }

        $refined = trim($process->getOutput());

        if ($refined === '') {
            return [
                'refined_text' => $text,
                'model_used' => $model,
                'success' => false,
                'error' => 'Claude CLI retornou output vazio',
            ];
        }

        return [
            'refined_text' => $refined,
            'model_used' => $model,
            'success' => true,
            'error' => null,
        ];
    }
}
