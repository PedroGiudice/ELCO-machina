<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prompts', function (Blueprint $table) {
            $table->float('temperature')->default(0.4)->after('content');
            $table->boolean('is_builtin')->default(false)->after('is_default');
            $table->dropColumn('output_style');
        });
    }

    public function down(): void
    {
        Schema::table('prompts', function (Blueprint $table) {
            $table->string('output_style')->after('content');
            $table->dropColumn(['temperature', 'is_builtin']);
        });
    }
};
