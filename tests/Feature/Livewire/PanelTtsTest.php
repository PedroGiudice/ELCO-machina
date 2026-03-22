<?php

namespace Tests\Feature\Livewire;

use App\Livewire\PanelTts;
use App\Models\VoiceProfile;
use App\Services\TtsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

class PanelTtsTest extends TestCase
{
    use RefreshDatabase;

    public function test_renders_with_available_models(): void
    {
        Livewire::test(PanelTts::class)
            ->assertSee('Qwen3-TTS')
            ->assertSee('Chatterbox')
            ->assertSee('Sintetizar');
    }

    public function test_defaults_to_config_model(): void
    {
        config()->set('voice.defaults.tts', 'chatterbox');

        Livewire::test(PanelTts::class)
            ->assertSet('ttsModel', 'chatterbox');
    }

    public function test_switch_model_resets_params(): void
    {
        Livewire::test(PanelTts::class)
            ->set('exaggeration', 1.5)
            ->call('setModel', 'qwen-tts')
            ->assertSet('exaggeration', 0.5)
            ->assertSet('ttsModel', 'qwen-tts');
    }

    public function test_synthesize_rejects_empty_text(): void
    {
        Livewire::test(PanelTts::class)
            ->set('text', '')
            ->call('synthesize')
            ->assertSet('statusType', 'error')
            ->assertSee('Escreva um texto');
    }

    public function test_qwen_requires_voice_with_volume(): void
    {
        Livewire::test(PanelTts::class)
            ->set('ttsModel', 'qwen-tts')
            ->set('text', 'Teste')
            ->set('selectedVoiceId', null)
            ->call('synthesize')
            ->assertSet('statusType', 'error')
            ->assertSee('voz com upload no volume');
    }

    public function test_qwen_requires_voice_with_ref_text(): void
    {
        $voice = VoiceProfile::create([
            'name' => 'No Ref Text',
            'file_path' => 'voice_profiles/test.wav',
            'volume_filename' => 'voice_1.wav',
            'ref_text' => null,
            'is_preset' => false,
        ]);

        Livewire::test(PanelTts::class)
            ->set('ttsModel', 'qwen-tts')
            ->set('text', 'Teste')
            ->call('selectVoice', $voice->id)
            ->call('synthesize')
            ->assertSet('statusType', 'error')
            ->assertSee('texto de referencia');
    }

    public function test_voice_profile_select(): void
    {
        $voice = VoiceProfile::create([
            'name' => 'Test Voice',
            'file_path' => 'voice_profiles/test.wav',
            'is_preset' => false,
        ]);

        Livewire::test(PanelTts::class)
            ->call('selectVoice', $voice->id)
            ->assertSet('selectedVoiceId', $voice->id);
    }

    public function test_upload_voice_creates_profile(): void
    {
        Storage::fake('local');

        $mock = $this->mock(TtsService::class);
        $mock->shouldReceive('uploadVoiceToVolume')
            ->once()
            ->andReturn(['success' => true, 'filename' => 'voice_1.wav', 'error' => null]);

        $file = UploadedFile::fake()->create('minha_voz.wav', 100, 'audio/wav');

        Livewire::test(PanelTts::class)
            ->set('newVoiceName', 'Minha Voz')
            ->set('newVoiceRefText', 'Texto de referencia do audio')
            ->set('newVoiceFile', $file)
            ->call('uploadVoice');

        $this->assertDatabaseHas('voice_profiles', [
            'name' => 'Minha Voz',
            'ref_text' => 'Texto de referencia do audio',
        ]);
    }

    public function test_upload_voice_requires_ref_text(): void
    {
        Storage::fake('local');

        $file = UploadedFile::fake()->create('minha_voz.wav', 100, 'audio/wav');

        Livewire::test(PanelTts::class)
            ->set('newVoiceName', 'Minha Voz')
            ->set('newVoiceRefText', '')
            ->set('newVoiceFile', $file)
            ->call('uploadVoice')
            ->assertHasErrors(['newVoiceRefText']);
    }

    public function test_delete_voice_removes_non_preset(): void
    {
        Storage::fake('local');

        $voice = VoiceProfile::create([
            'name' => 'Deletavel',
            'file_path' => 'voice_profiles/del.wav',
            'is_preset' => false,
        ]);

        Livewire::test(PanelTts::class)
            ->call('deleteVoice', $voice->id);

        $this->assertDatabaseMissing('voice_profiles', ['id' => $voice->id]);
    }

    public function test_cannot_delete_preset_voice(): void
    {
        $voice = VoiceProfile::create([
            'name' => 'Preset',
            'file_path' => 'voice_profiles/preset.wav',
            'is_preset' => true,
        ]);

        Livewire::test(PanelTts::class)
            ->call('deleteVoice', $voice->id);

        $this->assertDatabaseHas('voice_profiles', ['id' => $voice->id]);
    }

    public function test_synthesize_calls_tts_service(): void
    {
        Http::fake(['*' => Http::response('fake-wav', 200, [
            'X-Inference-Time' => '5.0',
            'X-Audio-Duration' => '3.0',
            'X-Sample-Rate' => '24000',
        ])]);

        config()->set('voice.models.chatterbox.endpoint', 'https://fake.modal.run');

        Livewire::test(PanelTts::class)
            ->set('ttsModel', 'chatterbox')
            ->set('text', 'Teste de sintese')
            ->call('synthesize')
            ->assertSet('statusType', 'success')
            ->assertSet('inferenceTime', 5.0)
            ->assertSet('audioDuration', 3.0);
    }

    public function test_tts_audio_route_serves_wav(): void
    {
        $dir = storage_path('app/tts_output');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents("{$dir}/test_abc.wav", 'fake-wav-content');

        $response = $this->get(route('tts.audio', ['file' => 'test_abc.wav']));

        $response->assertOk();
        $response->assertHeader('Content-Type', 'audio/wav');

        unlink("{$dir}/test_abc.wav");
    }

    public function test_tts_audio_route_404_for_missing(): void
    {
        $response = $this->get(route('tts.audio', ['file' => 'nonexistent.wav']));

        $response->assertNotFound();
    }

    public function test_clear_result_resets_state(): void
    {
        Livewire::test(PanelTts::class)
            ->set('ttsAudioUrl', 'http://test.com/audio.wav')
            ->set('statusMessage', 'Concluido')
            ->set('inferenceTime', 5.0)
            ->call('clearResult')
            ->assertSet('ttsAudioUrl', null)
            ->assertSet('statusMessage', null)
            ->assertSet('inferenceTime', null);
    }
}
