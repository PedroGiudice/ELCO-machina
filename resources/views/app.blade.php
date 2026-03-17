<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pro ATT Machine</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'], 'build-laravel')
    @livewireStyles
</head>
<body class="bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">

    <div
        x-data="{ activePanel: 'att' }"
        class="flex flex-col h-screen w-full"
        style="padding-top: var(--sat); padding-left: var(--sal); padding-right: var(--sar);"
    >
        {{-- Panel content --}}
        <div class="flex-1 min-h-0 overflow-y-auto">
            <div x-show="activePanel === 'att'" x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0 translate-y-4" x-transition:enter-end="opacity-100 translate-y-0" class="min-h-full pb-32">
                @livewire('panel-att')
            </div>

            <div x-show="activePanel === 'editor'" x-cloak x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0 translate-y-4" x-transition:enter-end="opacity-100 translate-y-0" class="h-full flex flex-col min-h-0">
                @livewire('panel-editor')
            </div>

            <div x-show="activePanel === 'tts'" x-cloak x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0 translate-y-4" x-transition:enter-end="opacity-100 translate-y-0" class="min-h-full pb-32">
                @livewire('panel-tts')
            </div>

            <div x-show="activePanel === 'config'" x-cloak x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0 translate-y-4" x-transition:enter-end="opacity-100 translate-y-0" class="min-h-full pb-32">
                @livewire('panel-config')
            </div>

            <div x-show="activePanel === 'stats'" x-cloak x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0 translate-y-4" x-transition:enter-end="opacity-100 translate-y-0" class="min-h-full pb-32">
                @livewire('panel-stats')
            </div>
        </div>

        {{-- Bottom Navigation --}}
        <x-bottom-nav />

        {{-- Bottom safe area --}}
        <div class="h-[var(--sab)] shrink-0"></div>
    </div>

    @livewireScripts
</body>
</html>
