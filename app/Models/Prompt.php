<?php

namespace App\Models;

use Database\Factories\PromptFactory;
use Illuminate\Database\Eloquent\Builder;
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
        'temperature',
        'is_default',
        'is_builtin',
        'sort_order',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'temperature' => 'float',
            'is_default' => 'boolean',
            'is_builtin' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** @return Builder<static> */
    public function scopeBuiltin(Builder $query): Builder
    {
        return $query->where('is_builtin', true);
    }

    /** @return Builder<static> */
    public function scopeCustom(Builder $query): Builder
    {
        return $query->where('is_builtin', false);
    }
}
