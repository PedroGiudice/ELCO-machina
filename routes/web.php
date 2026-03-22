<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('layouts.app');
})->name('home');

Route::get('/tts/audio/{file}', function (string $file) {
    $path = storage_path("app/tts_output/{$file}");
    abort_unless(file_exists($path), 404);

    return response()->file($path, ['Content-Type' => 'audio/wav']);
})->where('file', '[a-zA-Z0-9_]+\.wav')->name('tts.audio');
