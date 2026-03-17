@props([
    'label' => null,
    'showValue' => true,
    'min' => 0,
    'max' => 100,
    'step' => 1,
    'value' => 0,
    'formatSuffix' => '',
    'alpineModel' => null,
    'wireModel' => null,
])

@php
    $inputId = 'slider-' . \Illuminate\Support\Str::random(6);
@endphp

<div
    x-data="{
        val: {{ $value }},
        min: {{ $min }},
        max: {{ $max }},
        get pct() { return ((this.val - this.min) / (this.max - this.min)) * 100; }
    }"
    {{ $attributes->merge(['class' => 'flex flex-col gap-2']) }}
>
    @if($label || $showValue)
        <div class="flex justify-between items-center text-sm">
            @if($label)
                <span class="text-[var(--text-secondary)]">{{ $label }}</span>
            @endif
            @if($showValue)
                <span class="text-[var(--text-primary)] font-medium" x-text="val + '{{ $formatSuffix }}'"></span>
            @endif
        </div>
    @endif
    <div class="relative h-2 w-full">
        <div class="absolute inset-0 bg-[var(--bg-overlay)] rounded-full"></div>
        <div
            class="absolute left-0 top-0 h-full bg-[var(--accent)] rounded-full transition-all"
            :style="'width: ' + pct + '%'"
        ></div>
        <input
            type="range"
            min="{{ $min }}"
            max="{{ $max }}"
            step="{{ $step }}"
            x-model.number="val"
            @if($wireModel)
                wire:model.lazy="{{ $wireModel }}"
                x-on:change="$wire.set('{{ $wireModel }}', val)"
            @endif
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
        <div
            class="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[var(--accent)] rounded-full shadow-md pointer-events-none transition-all"
            :style="'left: calc(' + pct + '% - 8px)'"
        ></div>
    </div>
</div>
