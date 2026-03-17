<nav
    class="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-elevated)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] pb-[var(--sab)] px-4"
>
    <div class="flex items-center justify-around h-16 max-w-md mx-auto">
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
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'"
                class="relative flex flex-col items-center justify-center w-20 h-12 rounded-[var(--radius-md)] transition-colors duration-200 cursor-pointer"
            >
                {{-- Indicator --}}
                <div
                    x-show="activePanel === '{{ $item['id'] }}'"
                    x-transition:enter="transition ease-out duration-200"
                    x-transition:enter-start="opacity-0 scale-95"
                    x-transition:enter-end="opacity-100 scale-100"
                    class="absolute inset-0 bg-[var(--accent-dim)] rounded-[var(--radius-md)]"
                ></div>

                {{-- Icon --}}
                <div
                    class="relative z-10 w-5 h-5 transition-transform duration-200"
                    :class="activePanel === '{{ $item['id'] }}' ? 'scale-110' : ''"
                >
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

                {{-- Label --}}
                <span class="relative z-10 text-xs font-medium mt-1">
                    {{ $item['label'] }}
                </span>
            </button>
        @endforeach
    </div>
</nav>
