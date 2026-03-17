<?php

namespace App\Models;

use App\Enums\OutputStyle;
use App\Enums\RecordingStyle;
use App\Enums\TranscriptionStatus;
use Database\Factories\TranscriptionFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Transcription extends Model
{
    /** @use HasFactory<TranscriptionFactory> */
    use HasFactory, HasUlids;

    protected $fillable = [
        'text',
        'output_style',
        'language',
        'recording_style',
        'audio_volume_path',
        'audio_size_bytes',
        'audio_duration_s',
        'engine',
        'status',
        'error_message',
        'inference_time_s',
        'rtf',
        'metadata',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'output_style' => OutputStyle::class,
            'recording_style' => RecordingStyle::class,
            'status' => TranscriptionStatus::class,
            'audio_size_bytes' => 'integer',
            'audio_duration_s' => 'float',
            'inference_time_s' => 'float',
            'rtf' => 'float',
            'metadata' => 'array',
        ];
    }

    /** @return HasMany<Synthesis, $this> */
    public function syntheses(): HasMany
    {
        return $this->hasMany(Synthesis::class);
    }
}
