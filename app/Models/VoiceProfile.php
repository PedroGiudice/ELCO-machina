<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VoiceProfile extends Model
{
    protected $fillable = [
        'name',
        'file_path',
        'ref_text',
        'volume_filename',
        'duration_s',
        'sample_rate',
        'is_preset',
    ];

    protected $casts = [
        'duration_s' => 'float',
        'sample_rate' => 'integer',
        'is_preset' => 'boolean',
    ];
}
