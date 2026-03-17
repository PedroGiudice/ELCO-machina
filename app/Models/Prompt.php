<?php

namespace App\Models;

use App\Enums\OutputStyle;
use Database\Factories\PromptFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Prompt extends Model
{
    /** @use HasFactory<PromptFactory> */
    use HasFactory, HasUlids;

    protected $fillable = [
        'name',
        'content',
        'output_style',
        'is_default',
        'sort_order',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'output_style' => OutputStyle::class,
            'is_default' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
