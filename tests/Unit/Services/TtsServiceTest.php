<?php

namespace Tests\Unit\Services;

use App\Services\TtsService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class TtsServiceTest extends TestCase
{
    private TtsService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new TtsService;
    }

    public function test_fail_on_empty_text(): void
    {
        $result = $this->service->synthesize(text: '', refAudioPath: null);

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('vazio', $result['error']);
    }

    public function test_fail_on_missing_endpoint(): void
    {
        config()->set('voice.models.nonexistent', null);

        $result = $this->service->synthesize(
            text: 'Teste',
            refAudioPath: null,
            model: 'nonexistent',
        );

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('endpoint', $result['error']);
    }

    public function test_qwen_maps_language_to_full_name(): void
    {
        Http::fake(['*' => Http::response('fake-audio', 200, [
            'X-Inference-Time' => '1.5',
            'X-Audio-Duration' => '3.0',
            'X-Sample-Rate' => '24000',
        ])]);

        config()->set('voice.models.qwen-tts.endpoint', 'https://fake.modal.run/synthesize');

        $result = $this->service->synthesize(
            text: 'Teste',
            refAudioPath: null,
            model: 'qwen-tts',
            language: 'pt',
        );

        $this->assertTrue($result['success']);

        Http::assertSent(function ($request) {
            return $request['language'] === 'Portuguese';
        });
    }

    public function test_chatterbox_passes_iso_language_code(): void
    {
        Http::fake(['*' => Http::response('fake-audio', 200, [
            'X-Inference-Time' => '1.5',
            'X-Audio-Duration' => '3.0',
            'X-Sample-Rate' => '24000',
        ])]);

        config()->set('voice.models.chatterbox.endpoint', 'https://fake.modal.run/synthesize');

        $result = $this->service->synthesize(
            text: 'Teste',
            refAudioPath: null,
            model: 'chatterbox',
            language: 'pt',
        );

        $this->assertTrue($result['success']);

        Http::assertSent(function ($request) {
            return $request['language'] === 'pt';
        });
    }

    public function test_chatterbox_passes_model_specific_params(): void
    {
        Http::fake(['*' => Http::response('fake-audio', 200, [
            'X-Inference-Time' => '1.0',
            'X-Audio-Duration' => '2.0',
            'X-Sample-Rate' => '24000',
        ])]);

        config()->set('voice.models.chatterbox.endpoint', 'https://fake.modal.run/synthesize');

        $result = $this->service->synthesize(
            text: 'Teste',
            refAudioPath: null,
            model: 'chatterbox',
            params: ['exaggeration' => 0.8, 'cfg_weight' => 0.3],
        );

        $this->assertTrue($result['success']);

        Http::assertSent(function ($request) {
            return $request['exaggeration'] === '0.8'
                && $request['cfg_weight'] === '0.3';
        });
    }

    public function test_ref_audio_sent_as_base64(): void
    {
        Http::fake(['*' => Http::response('fake-audio', 200, [
            'X-Inference-Time' => '1.0',
            'X-Audio-Duration' => '2.0',
            'X-Sample-Rate' => '24000',
        ])]);

        config()->set('voice.models.qwen-tts.endpoint', 'https://fake.modal.run/synthesize');

        // Create a temp file
        $tmpFile = tempnam(sys_get_temp_dir(), 'tts_test_');
        file_put_contents($tmpFile, 'fake-audio-content');

        $result = $this->service->synthesize(
            text: 'Teste',
            refAudioPath: $tmpFile,
            model: 'qwen-tts',
        );

        unlink($tmpFile);

        $this->assertTrue($result['success']);

        Http::assertSent(function ($request) {
            return ! empty($request['ref_audio_base64'])
                && base64_decode($request['ref_audio_base64']) === 'fake-audio-content';
        });
    }

    public function test_handles_http_error(): void
    {
        Http::fake(['*' => Http::response('Model overloaded', 503)]);

        config()->set('voice.models.qwen-tts.endpoint', 'https://fake.modal.run/synthesize');

        $result = $this->service->synthesize(text: 'Teste', model: 'qwen-tts');

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('503', $result['error']);
    }

    public function test_returns_metadata_from_headers(): void
    {
        Http::fake(['*' => Http::response('audio-bytes', 200, [
            'X-Inference-Time' => '12.5',
            'X-Audio-Duration' => '5.2',
            'X-Sample-Rate' => '24000',
        ])]);

        config()->set('voice.models.qwen-tts.endpoint', 'https://fake.modal.run/synthesize');

        $result = $this->service->synthesize(text: 'Teste', model: 'qwen-tts');

        $this->assertTrue($result['success']);
        $this->assertEquals(12.5, $result['inference_time']);
        $this->assertEquals(5.2, $result['audio_duration']);
        $this->assertEquals(24000, $result['sample_rate']);
        $this->assertEquals('audio-bytes', $result['audio_bytes']);
    }
}
