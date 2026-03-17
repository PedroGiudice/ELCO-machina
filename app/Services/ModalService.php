<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\Process\Process;

class ModalService
{
    private string $scriptsPath;

    /** @var array<string, array{script: string, gpu?: string, deployed?: bool, endpoint?: string}> */
    private array $models;

    public function __construct()
    {
        $this->scriptsPath = config('voice.scripts_path', base_path('scripts'));
        $this->models = config('voice.models', []);
    }

    /**
     * Transcribe audio via the deployed web endpoint (HTTP POST multipart).
     *
     * @param  string  $audioPath  Local path to audio file
     * @param  string  $language  Language code
     * @param  string  $model  Model key (default: stt default)
     * @return array{text: string, language: string, duration_audio_s: float, inference_s: float, ...}
     */
    public function transcribe(string $audioPath, string $language = 'pt', ?string $model = null): array
    {
        $model ??= $this->defaultModel('stt');

        $endpoint = $this->getEndpoint($model);

        $response = Http::timeout(300)
            ->attach('file', file_get_contents($audioPath), basename($audioPath))
            ->post($endpoint, ['language' => $language]);

        if (! $response->successful()) {
            throw new RuntimeException(
                "Transcription failed ({$response->status()}): {$response->body()}"
            );
        }

        return $response->json();
    }

    /**
     * Check health of a deployed model endpoint.
     */
    public function health(?string $model = null): array
    {
        $model ??= $this->defaultModel('stt');
        $config = $this->getModelConfig($model);
        $healthUrl = $config['health'] ?? null;

        if (! $healthUrl) {
            return ['status' => 'unknown', 'reason' => 'no health endpoint configured'];
        }

        try {
            $response = Http::timeout(10)->get($healthUrl);

            return $response->successful()
                ? $response->json()
                : ['status' => 'error', 'http_status' => $response->status()];
        } catch (ConnectionException $e) {
            return ['status' => 'unreachable', 'error' => $e->getMessage()];
        }
    }

    /**
     * Execute a modal process via subprocess (for non-deployed models).
     * Kept for backward compatibility with `modal run` scripts.
     */
    public function run(string $model, array $options, ?callable $onOutput = null): array
    {
        $command = $this->buildCommand($model, $options);
        $process = new Process($command);
        $process->setTimeout(600);

        $result = null;
        $progress = [];

        $process->run(function (string $_type, string $buffer) use ($onOutput, &$result, &$progress) {
            foreach (explode("\n", $buffer) as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }

                $parsed = $this->parseOutputLine($line);

                if ($parsed['type'] === 'result') {
                    $result = $parsed['data'];
                } elseif ($parsed['type'] === 'progress') {
                    $progress[] = $parsed;
                }

                if ($onOutput) {
                    $onOutput($parsed);
                }
            }
        });

        if (! $process->isSuccessful() && $result === null) {
            throw new RuntimeException('Modal process failed: '.$process->getErrorOutput());
        }

        return [
            'result' => $result,
            'progress' => $progress,
            'exit_code' => $process->getExitCode(),
        ];
    }

    /**
     * Build CLI command for subprocess execution.
     */
    public function buildCommand(string $model, array $options): array
    {
        $config = $this->getModelConfig($model);

        $script = $this->scriptsPath.'/'.$config['script'];
        $isDeployed = $config['deployed'] ?? false;
        $command = $isDeployed
            ? ['python3', '-u', $script]
            : ['modal', 'run', $script];

        $optionMap = [
            'audio' => '--audio',
            'language' => '--language',
            'text' => '--text',
            'ref_audio' => '--ref-audio',
        ];

        $flagMap = [
            'use_volume' => '--use-volume',
            'benchmark' => '--benchmark',
        ];

        foreach ($options as $key => $value) {
            if (isset($optionMap[$key]) && $value !== null && $value !== '') {
                $command[] = $optionMap[$key];
                $command[] = (string) $value;
            } elseif (isset($flagMap[$key]) && $value) {
                $command[] = $flagMap[$key];
            }
        }

        return $command;
    }

    /**
     * Parse a single stdout line from a modal subprocess.
     */
    public function parseOutputLine(string $line): array
    {
        $line = trim($line);

        if (str_starts_with($line, 'PROGRESS:')) {
            $parts = explode(':', substr($line, 9), 2);

            return [
                'type' => 'progress',
                'key' => $parts[0] ?? '',
                'value' => $parts[1] ?? '',
            ];
        }

        if (str_starts_with($line, 'RESULT:')) {
            return [
                'type' => 'result',
                'data' => json_decode(substr($line, 7), true),
            ];
        }

        if (str_starts_with($line, 'ERROR:')) {
            return ['type' => 'error', 'message' => substr($line, 6)];
        }

        return ['type' => 'log', 'message' => $line];
    }

    /**
     * Get default model for a pipeline stage.
     */
    public function defaultModel(string $stage): string
    {
        return config("voice.defaults.{$stage}", '');
    }

    /**
     * Get the web endpoint URL for a deployed model.
     */
    private function getEndpoint(string $model): string
    {
        $config = $this->getModelConfig($model);

        $endpoint = $config['endpoint'] ?? null;

        if (! $endpoint) {
            throw new RuntimeException(
                "Model '{$model}' has no web endpoint configured. Set the endpoint env var or use run() for subprocess."
            );
        }

        return $endpoint;
    }

    private function getModelConfig(string $model): array
    {
        if (! isset($this->models[$model])) {
            throw new InvalidArgumentException(
                "Invalid model: {$model}. Valid: ".implode(', ', array_keys($this->models))
            );
        }

        return $this->models[$model];
    }
}
