<?php

namespace Database\Seeders;

use App\Models\VoiceProfile;
use Illuminate\Database\Seeder;

class VoiceProfileSeeder extends Seeder
{
    public function run(): void
    {
        $presets = [
            [
                'name' => 'PT-BR Masculino 1',
                'file_path' => 'voice_profiles/ref_ptbr_male.wav',
                'duration_s' => 5.08,
                'sample_rate' => 48000,
                'is_preset' => true,
            ],
            [
                'name' => 'PT-BR Masculino 2',
                'file_path' => 'voice_profiles/ref_ptbr_male2.wav',
                'duration_s' => 5.02,
                'sample_rate' => 48000,
                'is_preset' => true,
            ],
        ];

        foreach ($presets as $preset) {
            VoiceProfile::updateOrCreate(
                ['name' => $preset['name']],
                $preset,
            );
        }
    }
}
