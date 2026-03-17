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
        class="flex h-dvh w-full bg-[var(--bg-base)] text-[var(--text-primary)]"
        style="padding-top: var(--sat); padding-left: var(--sal); padding-right: var(--sar);"
    >
        {{-- Desktop Sidebar Navigation (lg+) --}}
        <nav class="hidden lg:flex flex-col items-center w-16 shrink-0 bg-[var(--bg-elevated)] border-r border-[var(--border-subtle)] py-6 gap-1">
            @php
                $navItems = [
                    ['id' => 'att', 'label' => 'ATT', 'icon' => 'mic'],
                    ['id' => 'editor', 'label' => 'Editor', 'icon' => 'file-text'],
                    ['id' => 'tts', 'label' => 'TTS', 'icon' => 'volume-2'],
                    ['id' => 'config', 'label' => 'Config', 'icon' => 'settings'],
                    ['id' => 'stats', 'label' => 'Sistema', 'icon' => 'activity'],
                ];
            @endphp

            @foreach($navItems as $item)
                <button
                    x-on:click="activePanel = '{{ $item['id'] }}'"
                    :class="activePanel === '{{ $item['id'] }}'
                        ? 'text-[var(--text-primary)] bg-[var(--accent-dim)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]'"
                    class="relative flex flex-col items-center justify-center w-12 h-12 rounded-[var(--radius-md)] transition-colors duration-200 cursor-pointer"
                    title="{{ $item['label'] }}"
                >
                    <div class="w-5 h-5">
                        @if($item['icon'] === 'mic')
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                        @elseif($item['icon'] === 'file-text')
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                        @elseif($item['icon'] === 'volume-2')
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                        @elseif($item['icon'] === 'settings')
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                        @elseif($item['icon'] === 'activity')
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>
                        @endif
                    </div>
                    <span class="text-[9px] font-medium mt-0.5 leading-tight">{{ $item['label'] }}</span>
                </button>
            @endforeach
        </nav>

        {{-- Main content area --}}
        <div class="flex-1 flex flex-col min-w-0">
            {{-- Panel content --}}
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
                    class="min-h-full pb-24 lg:pb-8"
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
                    class="min-h-full pb-24 lg:pb-8"
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
                    class="min-h-full pb-24 lg:pb-8"
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
                    class="min-h-full pb-24 lg:pb-8"
                >
                    @livewire('panel-stats')
                </div>
            </div>

            {{-- Bottom Navigation (mobile only) --}}
            <div class="lg:hidden">
                <x-bottom-nav />
            </div>

            {{-- Bottom padding for safe area below nav (mobile only) --}}
            <div class="h-[var(--sab)] shrink-0 lg:hidden"></div>
        </div>
    </div>

    @livewireScripts
</body>
</html>
