<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transcriptions', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->text('text')->nullable();
            $table->string('output_style')->default('verbatim');
            $table->string('language')->default('pt');
            $table->string('recording_style')->default('dictation');
            $table->string('audio_volume_path')->nullable();
            $table->unsignedInteger('audio_size_bytes')->nullable();
            $table->float('audio_duration_s')->nullable();
            $table->string('engine')->default('whisper-vllm');
            $table->string('status')->default('pending');
            $table->text('error_message')->nullable();
            $table->float('inference_time_s')->nullable();
            $table->float('rtf')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transcriptions');
    }
};
