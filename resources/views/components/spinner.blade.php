@props([
    'size' => 'md',
    'message' => null,
])

@php
    $sizeClasses = [
        'sm' => 'w-4 h-4',
        'md' => 'w-6 h-6',
        'lg' => 'w-8 h-8',
    ];
    $sizeClass = $sizeClasses[$size] ?? $sizeClasses['md'];
@endphp

@if($message)
    <div class="flex flex-col items-center gap-3 py-8">
        <div class="{{ $sizeClass }} animate-spin {{ $attributes->get('class', '') }}">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.2" stroke-width="3"></circle>
                <path d="M12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
            </svg>
        </div>
        <span class="text-sm text-[var(--text-secondary)]">{{ $message }}</span>
    </div>
@else
    <div class="{{ $sizeClass }} animate-spin {{ $attributes->get('class', '') }}">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.2" stroke-width="3"></circle>
            <path d="M12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
        </svg>
    </div>
@endif
