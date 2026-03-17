@props([
    'variant' => 'primary',
    'size' => 'md',
    'isLoading' => false,
    'type' => 'button',
])

@php
    $variantClasses = [
        'primary' => 'bg-[var(--accent)] text-[var(--bg-base)] hover:opacity-90',
        'secondary' => 'bg-[var(--bg-overlay)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)]',
        'ghost' => 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-dim)]',
    ];

    $sizeClasses = [
        'sm' => 'h-8 px-3 text-sm rounded-[var(--radius-sm)]',
        'md' => 'h-10 px-4 text-sm rounded-[var(--radius-md)]',
        'lg' => 'h-12 px-6 text-base rounded-[var(--radius-lg)]',
    ];

    $classes = 'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none '
        . ($variantClasses[$variant] ?? $variantClasses['primary']) . ' '
        . ($sizeClasses[$size] ?? $sizeClasses['md']);
@endphp

<button
    type="{{ $type }}"
    {{ $attributes->merge(['class' => $classes]) }}
    @if($isLoading) disabled @endif
>
    @if($isLoading)
        <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    @endif
    {{ $slot }}
</button>
