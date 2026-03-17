<?php

namespace Tests\Feature\Models;

use App\Enums\OutputStyle;
use App\Models\Prompt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PromptTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_prompt_with_factory(): void
    {
        $prompt = Prompt::factory()->create();

        $this->assertDatabaseHas('prompts', ['id' => $prompt->id]);
        $this->assertInstanceOf(OutputStyle::class, $prompt->output_style);
    }

    public function test_default_state(): void
    {
        $prompt = Prompt::factory()->default()->create();

        $this->assertTrue($prompt->is_default);
    }

    public function test_ulid_is_used_as_primary_key(): void
    {
        $prompt = Prompt::factory()->create();

        $this->assertMatchesRegularExpression('/^[0-9A-Za-z]{26}$/', $prompt->id);
    }
}
