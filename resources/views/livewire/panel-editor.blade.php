<div
    x-data="{
        copyText() {
            if (navigator.clipboard && $wire.value) {
                navigator.clipboard.writeText($wire.value);
            }
        }
    }"
    class="flex-1 flex flex-col min-h-0 bg-[var(--bg-base)]"
    style="height: 100%;"
>
    {{-- Toolbar --}}
    <div class="h-12 border-b border-[var(--border-subtle)] flex items-center px-4 justify-between bg-[var(--bg-elevated)] shrink-0">
        {{-- Left: Title + Context --}}
        <div class="flex items-center gap-3">
            <span class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Saida
            </span>
            <span class="text-[10px] px-2 py-0.5 rounded bg-[var(--accent-dim)] text-[var(--text-secondary)]">
                {{ $activeContext }}
            </span>
        </div>

        {{-- Right: Actions --}}
        <div class="flex items-center gap-2">
            {{-- Font Size Controls - Desktop --}}
            <div class="hidden md:flex items-center gap-1 mr-2">
                <button
                    wire:click="decreaseFontSize"
                    class="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-dim)] transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M5 12h14"/></svg>
                </button>
                <span class="text-[10px] text-[var(--text-secondary)] w-6 text-center font-mono">
                    {{ $fontSize }}
                </span>
                <button
                    wire:click="increaseFontSize"
                    class="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-dim)] transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                </button>
            </div>

            {{-- Clear --}}
            @if($value)
                <x-button variant="ghost" size="sm" wire:click="clear" class="text-red-400 hover:text-red-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    <span class="hidden md:inline">Limpar</span>
                </x-button>
            @endif

            {{-- Copy --}}
            <x-button variant="primary" size="sm" x-on:click="copyText()">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span class="hidden md:inline">Copiar</span>
            </x-button>
        </div>
    </div>

    {{-- Content Area --}}
    <div class="flex-1 relative min-h-0" style="min-height: 200px;">
        <textarea
            wire:model.lazy="value"
            spellcheck="false"
            style="font-size: {{ $fontSize }}px;"
            class="absolute inset-0 w-full h-full bg-transparent border-0 overflow-y-auto p-4 md:p-8 resize-none focus:ring-0 focus:outline-none leading-relaxed placeholder:opacity-30 {{ $outputStyle === 'Code Generator' ? 'font-mono' : 'font-editor' }} text-[var(--text-primary)]"
            placeholder="{{ $isProcessing ? 'Processando...' : 'Digite ou cole o texto aqui...' }}"
        ></textarea>

        {{-- Empty State Decoration --}}
        @if(!$value && !$isProcessing)
            <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 select-none pointer-events-none opacity-10">
                @if($outputStyle === 'Code Generator')
                    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-24 h-24"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
                @else
                    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-24 h-24"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" x2="2" y1="8" y2="22"/><line x1="17.5" x2="9" y1="15" y2="15"/></svg>
                @endif
            </div>
        @endif
    </div>

    {{-- Status Footer --}}
    <div class="h-7 border-t border-[var(--border-subtle)] flex items-center px-4 justify-between bg-[var(--bg-elevated)] text-[9px] text-[var(--text-secondary)] font-mono shrink-0">
        <div class="flex items-center gap-4">
            <span>Ln {{ $lineCount }}, Col {{ $charCount }}</span>
            <span>UTF-8</span>
            <span class="hidden md:inline opacity-50">
                Modelo: {{ $aiModel }}
            </span>
        </div>
        <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full {{ $isProcessing ? 'bg-yellow-500 animate-pulse' : 'bg-[var(--border-subtle)]' }}"></div>
            <span>{{ $isProcessing ? 'PROCESSANDO' : 'PRONTO' }}</span>
        </div>
    </div>
</div>
