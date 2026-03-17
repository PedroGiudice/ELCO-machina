<?php

namespace App\Services;

use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\Process\Process;

class ModalService
{
    private string $scriptsPath;

    /** @var array<string, array{script: string, gpu?: string, deployed?: bool}> */
    private array $models;

    public function __construct()
    {
        $this->scriptsPath = config('voice.scripts_path', base_path('scripts'));
        $this->models = config('voice.models', []);
    }

    /**
     * Build the command array for a given model and options.
     *
     * @param  string  $model  Model key (whisper-vllm|xtts-serve|etc)
     * @param  array<string, mixed>  $options  Key-value options to pass
     * @return list<string>
     */
    public function buildCommand(string $model, array $options): array
    {
        if (! isset($this->models[$model])) {
            throw new InvalidArgumentException(
                "Invalid model: {$model}. Valid models: ".implode(', ', array_keys($this->models))
            );
        }

        $script = $this->scriptsPath.'/'.$this->models[$model]['script'];
        $isDeployed = $this->models[$model]['deployed'] ?? false;
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
     * Parse a single line of stdout from the modal process.
     *
     * Protocol:
     *   PROGRESS:<key>:<value>  -> progress event
     *   RESULT:<json>           -> final result
     *   ERROR:<message>         -> error
     *   anything else           -> log line
     *
     * @return array{type: string, ...}
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
            $json = substr($line, 7);

            return [
                'type' => 'result',
                'data' => json_decode($json, true),
            ];
        }

        if (str_starts_with($line, 'ERROR:')) {
            return ['type' => 'error', 'message' => substr($line, 6)];
        }

        return ['type' => 'log', 'message' => $line];
    }

    /**
     * Execute a modal process, streaming output through a callback.
     *
     * @param  string  $model  Model key
     * @param  array<string, mixed>  $options  CLI options
     * @param  callable|null  $onOutput  Called for each parsed output line
     * @return array{result: mixed, progress: list<array>, exit_code: int}
     */
    public function run(string $model, array $options, ?callable $onOutput = null): array
    {
        $command = $this->buildCommand($model, $options);
        $process = new Process($command);
        $process->setTimeout(600);

        $result = null;
        $progress = [];

        $process->run(function (string $type, string $buffer) use ($onOutput, &$result, &$progress) {
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
     * Get default model for a pipeline stage.
     */
    public function defaultModel(string $stage): string
    {
        return config("voice.defaults.{$stage}", '');
    }
}
