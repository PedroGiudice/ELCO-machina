<?php

namespace Tests\Feature\Models;

use App\Models\Prompt;
use Database\Seeders\PromptSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PromptTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_prompt_with_factory(): void
    {
        $prompt = Prompt::factory()->create();

        $this->assertDatabaseHas('prompts', ['id' => $prompt->id]);
        $this->assertIsFloat($prompt->temperature);
        $this->assertIsBool($prompt->is_builtin);
    }

    public function test_default_state(): void
    {
        $prompt = Prompt::factory()->default()->create();

        $this->assertTrue($prompt->is_default);
    }

    public function test_builtin_state(): void
    {
        $prompt = Prompt::factory()->builtin()->create();

        $this->assertTrue($prompt->is_builtin);
    }

    public function test_ulid_is_used_as_primary_key(): void
    {
        $prompt = Prompt::factory()->create();

        $this->assertMatchesRegularExpression('/^[0-9A-Za-z]{26}$/', $prompt->id);
    }

    public function test_builtin_scope(): void
    {
        Prompt::factory()->builtin()->count(3)->create();
        Prompt::factory()->count(2)->create();

        $this->assertCount(3, Prompt::builtin()->get());
        $this->assertCount(2, Prompt::custom()->get());
    }

    public function test_seeder_creates_18_builtins(): void
    {
        $this->seed(PromptSeeder::class);

        $this->assertCount(18, Prompt::builtin()->get());
        $this->assertNotNull(Prompt::query()->where('name', 'Normal')->where('is_default', true)->first());
    }
}
