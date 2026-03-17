<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('syntheses', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('transcription_id')->nullable()->constrained('transcriptions')->nullOnDelete();
            $table->text('input_text');
            $table->string('audio_volume_path')->nullable();
            $table->string('engine')->default('xtts-serve');
            $table->string('voice_ref_path')->nullable();
            $table->json('params')->nullable();
            $table->string('status')->default('pending');
            $table->text('error_message')->nullable();
            $table->float('inference_time_s')->nullable();
            $table->float('audio_duration_s')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('syntheses');
    }
};
