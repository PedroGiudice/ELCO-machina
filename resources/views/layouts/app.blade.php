<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ config('app.name', 'ELCO') }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body class="antialiased">
    <div
        x-data="{ activePanel: 'att' }"
        class="flex flex-col h-dvh w-full bg-[var(--bg-base)] text-[var(--text-primary)]"
        style="padding-top: var(--sat); padding-left: var(--sal); padding-right: var(--sar);"
    >
        {{-- Full-screen panel --}}
        <div
            class="flex-1 min-h-0"
            :class="activePanel === 'editor' ? 'overflow-hidden' : 'overflow-y-auto'"
        >
            <div
                x-show="activePanel === 'att'"
                x-transition:enter="transition ease-out duration-200"
                x-transition:enter-start="opacity-0 translate-y-5"
                x-transition:enter-end="opacity-100 translate-y-0"
                x-transition:leave="transition ease-in duration-150"
                x-transition:leave-start="opacity-100 translate-y-0"
                x-transition:leave-end="opacity-0 -translate-y-2.5"
                class="min-h-full pb-32"
            >
                @livewire('panel-att')
            </div>

            <div
                x-show="activePanel === 'editor'"
                x-transition:enter="transition ease-out duration-200"
                x-transition:enter-start="opacity-0 translate-y-5"
                x-transition:enter-end="opacity-100 translate-y-0"
                x-transition:leave="transition ease-in duration-150"
                x-transition:leave-start="opacity-100 translate-y-0"
                x-transition:leave-end="opacity-0 -translate-y-2.5"
                style="height: 100%; display: flex; flex-direction: column; min-height: 0;"
            >
                @livewire('panel-editor')
            </div>

            <div
                x-show="activePanel === 'tts'"
                x-transition:enter="transition ease-out duration-200"
                x-transition:enter-start="opacity-0 translate-y-5"
                x-transition:enter-end="opacity-100 translate-y-0"
                x-transition:leave="transition ease-in duration-150"
                x-transition:leave-start="opacity-100 translate-y-0"
                x-transition:leave-end="opacity-0 -translate-y-2.5"
                class="min-h-full pb-32"
            >
                @livewire('panel-tts')
            </div>

            <div
                x-show="activePanel === 'config'"
                x-transition:enter="transition ease-out duration-200"
                x-transition:enter-start="opacity-0 translate-y-5"
                x-transition:enter-end="opacity-100 translate-y-0"
                x-transition:leave="transition ease-in duration-150"
                x-transition:leave-start="opacity-100 translate-y-0"
                x-transition:leave-end="opacity-0 -translate-y-2.5"
                class="min-h-full pb-32"
            >
                @livewire('panel-config')
            </div>

            <div
                x-show="activePanel === 'stats'"
                x-transition:enter="transition ease-out duration-200"
                x-transition:enter-start="opacity-0 translate-y-5"
                x-transition:enter-end="opacity-100 translate-y-0"
                x-transition:leave="transition ease-in duration-150"
                x-transition:leave-start="opacity-100 translate-y-0"
                x-transition:leave-end="opacity-0 -translate-y-2.5"
                class="min-h-full pb-32"
            >
                @livewire('panel-stats')
            </div>
        </div>

        {{-- Bottom Navigation --}}
        <x-bottom-nav />

        {{-- Bottom padding for safe area below nav --}}
        <div class="h-[var(--sab)] shrink-0"></div>
    </div>

    @livewireScripts
</body>
</html>
