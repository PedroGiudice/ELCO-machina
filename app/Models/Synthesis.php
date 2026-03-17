<?php

namespace App\Models;

use App\Enums\TranscriptionStatus;
use Database\Factories\SynthesisFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Synthesis extends Model
{
    /** @use HasFactory<SynthesisFactory> */
    use HasFactory, HasUlids;

    protected $fillable = [
        'transcription_id',
        'input_text',
        'audio_volume_path',
        'engine',
        'voice_ref_path',
        'params',
        'status',
        'error_message',
        'inference_time_s',
        'audio_duration_s',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'status' => TranscriptionStatus::class,
            'params' => 'array',
            'inference_time_s' => 'float',
            'audio_duration_s' => 'float',
        ];
    }

    /** @return BelongsTo<Transcription, $this> */
    public function transcription(): BelongsTo
    {
        return $this->belongsTo(Transcription::class);
    }
}
