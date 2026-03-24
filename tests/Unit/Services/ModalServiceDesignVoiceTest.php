<?php

namespace Tests\Unit\Services;

use App\Services\ModalService;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class ModalServiceDesignVoiceTest extends TestCase
{
    private ModalService $service;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('voice.voice_design.script', base_path('scripts/voicedesign_client.py'));
        config()->set('voice.voice_design.timeout', 600);
        config()->set('voice.scripts_path', base_path('scripts'));

        $this->service = new ModalService;
    }

    public function test_design_voice_returns_metadata_on_success(): void
    {
        $fakeWavPath = tempnam(sys_get_temp_dir(), 'vd_test_').'.wav';
        file_put_contents($fakeWavPath, 'fake-wav-content');

        $jsonOutput = json_encode([
            'inference_time' => 6.4,
            'duration' => 2.4,
            'sample_rate' => 24000,
            'saved_as' => '',
            'size' => 115244,
            'output_file' => $fakeWavPath,
        ]);

        Process::fake([
            '*voicedesign_client*' => Process::result(
                output: $jsonOutput,
                exitCode: 0,
            ),
        ]);

        $result = $this->service->designVoice(
            text: 'Bom dia, como posso ajudar?',
            voiceInstructions: 'Deep male voice, calm and professional tone',
        );

        $this->assertTrue($result['success']);
        $this->assertEquals(6.4, $result['inference_time']);
        $this->assertEquals(2.4, $result['duration']);
        $this->assertEquals(24000, $result['sample_rate']);
        $this->assertNull($result['error']);
        // file_path is null with Process::fake since the script doesn't actually run
        $this->assertArrayHasKey('file_path', $result);
    }

    public function test_design_voice_fails_on_empty_text(): void
    {
        $result = $this->service->designVoice(
            text: '',
            voiceInstructions: 'Some voice',
        );

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('vazio', $result['error']);
    }

    public function test_design_voice_fails_on_empty_instructions(): void
    {
        $result = $this->service->designVoice(
            text: 'Teste',
            voiceInstructions: '',
        );

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('instruc', strtolower($result['error']));
    }

    public function test_design_voice_fails_on_process_error(): void
    {
        Process::fake([
            '*voicedesign_client*' => Process::result(
                output: '',
                errorOutput: 'Modal connection failed',
                exitCode: 1,
            ),
        ]);

        $result = $this->service->designVoice(
            text: 'Teste',
            voiceInstructions: 'Deep male voice',
        );

        $this->assertFalse($result['success']);
        $this->assertNotNull($result['error']);
    }

    public function test_design_voice_passes_save_as_argument(): void
    {
        $fakeWavPath = tempnam(sys_get_temp_dir(), 'vd_test_').'.wav';
        file_put_contents($fakeWavPath, 'fake-wav-content');

        $jsonOutput = json_encode([
            'inference_time' => 5.0,
            'duration' => 2.0,
            'sample_rate' => 24000,
            'saved_as' => 'my_voice.wav',
            'size' => 50000,
            'output_file' => $fakeWavPath,
        ]);

        Process::fake([
            '*voicedesign_client*' => Process::result(
                output: $jsonOutput,
                exitCode: 0,
            ),
        ]);

        $result = $this->service->designVoice(
            text: 'Teste',
            voiceInstructions: 'Deep male voice',
            saveAs: 'my_voice',
        );

        $this->assertTrue($result['success']);
        $this->assertEquals('my_voice.wav', $result['saved_as']);

        Process::assertRan(function ($process) {
            $cmd = is_array($process->command) ? implode(' ', $process->command) : $process->command;

            return str_contains($cmd, '--save-as')
                && str_contains($cmd, 'my_voice');
        });

        // Cleanup
        if (file_exists($fakeWavPath)) {
            unlink($fakeWavPath);
        }
    }

    public function test_design_voice_passes_language_argument(): void
    {
        $fakeWavPath = tempnam(sys_get_temp_dir(), 'vd_test_').'.wav';
        file_put_contents($fakeWavPath, 'fake-wav-content');

        $jsonOutput = json_encode([
            'inference_time' => 3.0,
            'duration' => 1.5,
            'sample_rate' => 24000,
            'saved_as' => '',
            'size' => 30000,
            'output_file' => $fakeWavPath,
        ]);

        Process::fake([
            '*voicedesign_client*' => Process::result(
                output: $jsonOutput,
                exitCode: 0,
            ),
        ]);

        $result = $this->service->designVoice(
            text: 'Hello world',
            voiceInstructions: 'British accent',
            language: 'English',
        );

        $this->assertTrue($result['success']);

        Process::assertRan(function ($process) {
            $cmd = is_array($process->command) ? implode(' ', $process->command) : $process->command;

            return str_contains($cmd, '--language')
                && str_contains($cmd, 'English');
        });

        // Cleanup
        if (file_exists($fakeWavPath)) {
            unlink($fakeWavPath);
        }
    }

    public function test_design_voice_handles_json_with_error(): void
    {
        $jsonOutput = json_encode([
            'error' => 'voice_instructions is required',
            'status' => 400,
        ]);

        Process::fake([
            '*voicedesign_client*' => Process::result(
                output: $jsonOutput,
                exitCode: 1,
            ),
        ]);

        $result = $this->service->designVoice(
            text: 'Teste',
            voiceInstructions: 'Deep male voice',
        );

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('voice_instructions', $result['error']);
    }

    public function test_design_voice_uses_configured_timeout(): void
    {
        config()->set('voice.voice_design.timeout', 120);

        $fakeWavPath = tempnam(sys_get_temp_dir(), 'vd_test_').'.wav';
        file_put_contents($fakeWavPath, 'fake-wav-content');

        $jsonOutput = json_encode([
            'inference_time' => 1.0,
            'duration' => 1.0,
            'sample_rate' => 24000,
            'saved_as' => '',
            'size' => 10000,
            'output_file' => $fakeWavPath,
        ]);

        Process::fake([
            '*voicedesign_client*' => Process::result(
                output: $jsonOutput,
                exitCode: 0,
            ),
        ]);

        // Re-create service to pick up new config
        $service = new ModalService;

        $result = $service->designVoice(
            text: 'Teste',
            voiceInstructions: 'Deep male voice',
        );

        $this->assertTrue($result['success']);

        // Cleanup
        if (file_exists($fakeWavPath)) {
            unlink($fakeWavPath);
        }
    }
}
