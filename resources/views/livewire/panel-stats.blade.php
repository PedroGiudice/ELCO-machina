<div class="p-5 space-y-4 h-full flex flex-col">
    {{-- Header --}}
    <div class="flex items-center gap-2 flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[var(--accent)]"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>
        <h2 class="text-sm font-semibold">Sistema</h2>
    </div>

    {{-- Split Layout --}}
    <div class="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden">
        {{-- Left: Atividade (Logs) --}}
        <div class="flex-[3] flex flex-col min-h-0 md:border-r md:border-[var(--border-subtle)] md:pr-4">
            <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex-shrink-0">
                Atividade
            </label>
            <div class="flex gap-1 flex-wrap mb-2 flex-shrink-0">
                @foreach($filterChips as $chip)
                    <button
                        wire:click="setFilter('{{ $chip['id'] }}')"
                        class="px-2 py-0.5 text-[10px] rounded-full border transition-colors {{ $activeFilter === $chip['id'] ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-transparent text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--text-secondary)]' }}"
                    >
                        {{ $chip['label'] }}
                    </button>
                @endforeach
            </div>
            <div class="flex-1 overflow-y-auto bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 space-y-1">
                @if(empty($filteredLogs))
                    <span class="text-[11px] text-[var(--text-secondary)] font-mono opacity-50">
                        Nenhuma atividade registrada.
                    </span>
                @else
                    @foreach($filteredLogs as $entry)
                        @php
                            $catColors = [
                                'stt' => 'text-blue-400',
                                'tts' => 'text-purple-400',
                                'refiner' => 'text-amber-400',
                                'audio' => 'text-emerald-400',
                                'app' => 'text-neutral-400',
                                'ipc' => 'text-cyan-400',
                            ];
                            $typeColors = [
                                'info' => 'text-[var(--text-secondary)]',
                                'success' => 'text-emerald-400',
                                'warning' => 'text-amber-400',
                                'error' => 'text-red-400',
                            ];
                            $catColor = $catColors[$entry['category'] ?? 'app'] ?? 'text-neutral-400';
                            $typeColor = $typeColors[$entry['type'] ?? 'info'] ?? 'text-[var(--text-secondary)]';
                        @endphp
                        <div class="flex gap-2 text-[11px] font-mono leading-relaxed">
                            <span class="text-[var(--text-secondary)] opacity-50 flex-shrink-0">{{ $entry['time'] ?? '' }}</span>
                            <span class="{{ $catColor }} flex-shrink-0 uppercase">[{{ $entry['category'] ?? 'app' }}]</span>
                            <span class="{{ $typeColor }} break-all">{{ $entry['msg'] ?? '' }}</span>
                        </div>
                    @endforeach
                @endif
            </div>
        </div>

        {{-- Right: Servicos --}}
        <div class="flex-[2] flex flex-col min-h-0 overflow-y-auto space-y-3">
            <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex-shrink-0">
                Servicos
            </label>

            @php
                $sttStatus = $sidecarAvailable ? 'healthy' : 'error';
                $ttsStatusVal = $isSpeaking ? 'healthy' : ($sidecarAvailable ? 'inactive' : 'warning');
                $claudeStatus = $hasApiKey ? 'healthy' : 'warning';
                $audioStatus = $isRecording ? 'healthy' : ($isProcessing ? 'warning' : 'inactive');

                $statusDotColors = [
                    'healthy' => 'bg-emerald-500',
                    'warning' => 'bg-amber-500',
                    'error' => 'bg-red-500',
                    'inactive' => 'bg-neutral-500',
                ];
            @endphp

            {{-- STT --}}
            <div class="bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 space-y-2">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full flex-shrink-0 {{ $statusDotColors[$sttStatus] }}"></div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-[var(--text-secondary)]"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                    <span class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">STT</span>
                </div>
                <div class="space-y-1 pl-4">
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Motor</span>
                        <span class="text-[var(--text-primary)] font-mono">{{ $sttBackend === 'modal' ? 'faster-whisper large-v3-turbo (GPU)' : 'whisper.cpp small (CPU)' }}</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Backend</span>
                        <span class="text-[var(--text-primary)] font-mono">{{ $sttBackend === 'modal' ? 'Modal' : 'VM' }}</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Status</span>
                        <span class="text-[var(--text-primary)] font-mono">{{ $sidecarAvailable ? 'online' : 'offline' }}</span>
                    </div>
                </div>
            </div>

            {{-- TTS --}}
            <div class="bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 space-y-2">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full flex-shrink-0 {{ $statusDotColors[$ttsStatusVal] }}"></div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-[var(--text-secondary)]"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    <span class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">TTS</span>
                </div>
                <div class="space-y-1 pl-4">
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Motor</span>
                        <span class="text-[var(--text-primary)] font-mono">XTTS v2</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Falando</span>
                        <span class="text-[var(--text-primary)] font-mono">{{ $isSpeaking ? 'sim' : 'nao' }}</span>
                    </div>
                </div>
            </div>

            {{-- Claude Refiner --}}
            <div class="bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 space-y-2">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full flex-shrink-0 {{ $statusDotColors[$claudeStatus] }}"></div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-[var(--text-secondary)]"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>
                    <span class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Claude</span>
                </div>
                <div class="space-y-1 pl-4">
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Modelo</span>
                        <span class="text-[var(--text-primary)] font-mono">{{ $aiModel }}</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Backend</span>
                        <span class="text-[var(--text-primary)] font-mono">Claude CLI (sidecar)</span>
                    </div>
                </div>
            </div>

            {{-- Audio --}}
            <div class="bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 space-y-2">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full flex-shrink-0 {{ $statusDotColors[$audioStatus] }}"></div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-[var(--text-secondary)]"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>
                    <span class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Audio</span>
                </div>
                <div class="space-y-1 pl-4">
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Microfone</span>
                        <span class="text-[var(--text-primary)] font-mono">{{ $selectedMicLabel }}</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Gravando</span>
                        <span class="text-[var(--text-primary)] font-mono">{{ $isRecording ? 'sim' : 'nao' }}</span>
                    </div>
                </div>
            </div>

            {{-- App --}}
            <div class="bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 space-y-2">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500"></div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-[var(--text-secondary)]"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                    <span class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">App</span>
                </div>
                <div class="space-y-1 pl-4">
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Versao</span>
                        <span class="text-[var(--text-primary)] font-mono">v{{ $appVersion }}</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">STT</span>
                        <span class="text-[var(--text-primary)] font-mono">{{ $sttBackend === 'modal' ? 'Modal (GPU)' : 'VM (CPU)' }}</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px]">
                        <span class="text-[var(--text-secondary)]">Processando</span>
                        <span class="text-[var(--text-primary)] font-mono">{{ $isProcessing ? 'sim' : 'nao' }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
