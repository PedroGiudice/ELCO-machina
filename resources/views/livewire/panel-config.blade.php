<div
    x-data="{
        mics: [],
        async loadMics() {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                this.mics = devices.filter(d => d.kind === 'audioinput');
            } catch (e) {
                console.error('Failed to enumerate devices:', e);
            }
        }
    }"
    x-init="loadMics()"
    class="p-5 space-y-6"
>
    {{-- Header --}}
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[var(--accent)]"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            <h2 class="text-sm font-semibold">Configuracoes</h2>
        </div>
    </div>

    <div class="w-full h-px bg-[var(--border-subtle)]"></div>

    {{-- Audio Engine --}}
    <section class="space-y-4">
        <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            Motor de Audio
        </label>

        {{-- Mic Selection --}}
        <div>
            <label class="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                Dispositivo de Entrada
            </label>
            <div class="relative">
                <select
                    wire:model="selectedMicId"
                    class="w-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] py-2 px-3 text-xs focus:outline-none appearance-none text-[var(--text-primary)]"
                >
                    <option value="default">Padrao do sistema</option>
                    <template x-for="mic in mics" :key="mic.deviceId">
                        <option :value="mic.deviceId" x-text="mic.label || ('Microfone ' + mic.deviceId.slice(0, 5) + '...')"></option>
                    </template>
                </select>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute right-3 top-2.5 w-3 h-3 text-[var(--text-secondary)] pointer-events-none rotate-90"><path d="m9 18 6-6-6-6"/></svg>
            </div>
        </div>

        {{-- Audio Toggles --}}
        <div class="space-y-2">
            {{-- Noise Suppression --}}
            <div class="flex items-center justify-between p-3 bg-[var(--bg-overlay)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                <div>
                    <p class="text-xs font-medium text-[var(--text-primary)]">Reducao de Ruido</p>
                    <p class="text-[10px] text-[var(--text-secondary)]">Filtra ruido de fundo</p>
                </div>
                <button
                    wire:click="toggleNoiseSuppression"
                    class="w-10 h-5 rounded-full relative transition-colors {{ $noiseSuppression ? 'bg-emerald-500' : 'bg-[var(--border-subtle)]' }}"
                >
                    <div class="absolute top-1 w-3 h-3 rounded-full bg-white transition-all {{ $noiseSuppression ? 'left-6' : 'left-1' }}"></div>
                </button>
            </div>

            {{-- Echo Cancellation --}}
            <div class="flex items-center justify-between p-3 bg-[var(--bg-overlay)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                <div>
                    <p class="text-xs font-medium text-[var(--text-primary)]">Cancelamento de Eco</p>
                    <p class="text-[10px] text-[var(--text-secondary)]">Evita retorno de audio</p>
                </div>
                <button
                    wire:click="toggleEchoCancellation"
                    class="w-10 h-5 rounded-full relative transition-colors {{ $echoCancellation ? 'bg-emerald-500' : 'bg-[var(--border-subtle)]' }}"
                >
                    <div class="absolute top-1 w-3 h-3 rounded-full bg-white transition-all {{ $echoCancellation ? 'left-6' : 'left-1' }}"></div>
                </button>
            </div>

            {{-- Auto Gain --}}
            <div class="flex items-center justify-between p-3 bg-[var(--bg-overlay)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                <div>
                    <p class="text-xs font-medium text-[var(--text-primary)]">Ganho Automatico</p>
                    <p class="text-[10px] text-[var(--text-secondary)]">Normaliza nivel de volume</p>
                </div>
                <button
                    wire:click="toggleAutoGainControl"
                    class="w-10 h-5 rounded-full relative transition-colors {{ $autoGainControl ? 'bg-emerald-500' : 'bg-[var(--border-subtle)]' }}"
                >
                    <div class="absolute top-1 w-3 h-3 rounded-full bg-white transition-all {{ $autoGainControl ? 'left-6' : 'left-1' }}"></div>
                </button>
            </div>
        </div>
    </section>

    <div class="w-full h-px bg-[var(--border-subtle)]"></div>

    {{-- Intelligence Model --}}
    <section class="space-y-4">
        <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
            Modelo de IA
        </label>

        {{-- Claude Version --}}
        <div>
            <label class="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                Versao Claude
            </label>
            <div class="grid grid-cols-2 gap-2">
                @foreach($aiModels as $model)
                    <button
                        wire:click="setAiModel('{{ $model['id'] }}')"
                        class="flex flex-col items-start p-3 rounded-[var(--radius-sm)] border transition-all text-left {{ $aiModel === $model['id'] ? 'bg-[var(--accent-dim)] border-[var(--accent)]' : 'bg-[var(--bg-overlay)] border-[var(--border-subtle)] opacity-60 hover:opacity-100' }}"
                    >
                        <span class="text-xs font-bold">{{ $model['label'] }}</span>
                        <span class="text-[9px] text-[var(--text-secondary)]">{{ $model['desc'] }}</span>
                    </button>
                @endforeach
            </div>
        </div>

        {{-- STT Backend --}}
        <div>
            <label class="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                STT Backend
            </label>
            <div class="grid grid-cols-2 gap-2">
                @foreach($sttBackends as $backend)
                    <button
                        wire:click="setSttBackend('{{ $backend['id'] }}')"
                        class="flex flex-col items-start p-3 rounded-[var(--radius-sm)] border transition-all text-left {{ $sttBackend === $backend['id'] ? 'bg-[var(--accent-dim)] border-[var(--accent)]' : 'bg-[var(--bg-overlay)] border-[var(--border-subtle)] opacity-60 hover:opacity-100' }}"
                    >
                        <span class="text-xs font-bold">{{ $backend['label'] }}</span>
                        <span class="text-[9px] text-[var(--text-secondary)]">{{ $backend['desc'] }}</span>
                    </button>
                @endforeach
            </div>
        </div>
    </section>
</div>
