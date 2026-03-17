<div
    x-data="{
        healthStatus: 'unknown',
        healthDetail: null,
        async testConnection() {
            const url = $wire.modalEndpointUrl;
            if (!url || !url.trim()) return;
            this.healthStatus = 'checking';
            this.healthDetail = null;
            const healthUrl = url.replace(/-synthesize\./, '-health.');
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 90000);
                const response = await fetch(healthUrl, { method: 'GET', signal: controller.signal });
                clearTimeout(timeoutId);
                if (response.ok) {
                    const data = await response.json();
                    this.healthStatus = 'connected';
                    const gpu = data.gpu || 'desconhecida';
                    const loadTime = data.model_load_s ? data.model_load_s + 's' : '?';
                    this.healthDetail = 'GPU: ' + gpu + ' | Modelo carregado em ' + loadTime;
                } else if (response.status === 503 || response.status === 502) {
                    this.healthStatus = 'starting';
                    this.healthDetail = 'Servidor em cold start. Aguarde e tente novamente.';
                } else {
                    this.healthStatus = 'offline';
                    this.healthDetail = 'HTTP ' + response.status;
                }
            } catch (err) {
                if (err.name === 'AbortError') {
                    this.healthStatus = 'starting';
                    this.healthDetail = 'Timeout -- servidor pode estar em cold start (ate 70s).';
                } else {
                    this.healthStatus = 'offline';
                    this.healthDetail = 'Servidor inacessivel. Verifique a URL.';
                }
            }
        }
    }"
    class="p-5 lg:p-8 space-y-6 max-w-3xl mx-auto"
>
    {{-- Header --}}
    <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[var(--accent)]"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        <h2 class="text-sm lg:text-base font-semibold">Texto para Fala (XTTS v2)</h2>
    </div>

    {{-- Status --}}
    @php
        $statusLabels = [
            'idle' => 'Pronto',
            'cold_start' => 'Inicializando GPU...',
            'synthesizing' => 'Sintetizando...',
            'playing' => 'Reproduzindo...',
            'error' => 'Erro',
        ];
        $statusColors = [
            'idle' => 'text-[var(--text-secondary)]',
            'cold_start' => 'text-yellow-400',
            'synthesizing' => 'text-blue-400',
            'playing' => 'text-green-400',
            'error' => 'text-red-400',
        ];
        $isBusy = in_array($ttsStatus, ['cold_start', 'synthesizing']);
        $isSpeaking = $ttsStatus === 'playing';
        $hasText = !empty($text);
    @endphp

    <div class="flex items-center gap-2 text-[10px] {{ $statusColors[$ttsStatus] ?? 'text-[var(--text-secondary)]' }}">
        @if($isBusy)
            <svg class="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        @endif
        @if($ttsStatus === 'error')
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        @endif
        <span>{{ $statusMessage ?? ($statusLabels[$ttsStatus] ?? 'Pronto') }}</span>
    </div>

    {{-- Main Action --}}
    <x-button
        :variant="$isSpeaking ? 'secondary' : 'primary'"
        class="w-full h-14 text-base {{ $isSpeaking ? 'text-red-400 border-red-500/50' : '' }}"
        wire:click="synthesize"
        :disabled="(!$hasText || !$voiceRefName) && !$isSpeaking && !$isBusy"
    >
        @if($isSpeaking || $isBusy)
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M16 9a5 5 0 0 1-.95 2.293"/><path d="M19.364 5.636a9 9 0 0 1 .935 10.418"/><line x1="2" x2="22" y1="2" y2="22"/><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m9.4 14.6-2.8-2.8"/></svg>
            Parar
        @else
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            Ler Texto em Voz Alta
        @endif
    </x-button>

    @if(!$hasText)
        <p class="text-[10px] text-[var(--text-secondary)] text-center">
            Escreva ou transcreva um texto primeiro
        </p>
    @endif

    @if($hasText && !$voiceRefName)
        <p class="text-[10px] text-yellow-400 text-center">
            Envie um audio de referencia para clonagem de voz
        </p>
    @endif

    <div class="w-full h-px bg-[var(--border-subtle)]"></div>

    {{-- Voice Cloning + XTTS Parameters: side by side on desktop --}}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {{-- Voice Cloning --}}
        <section class="space-y-3">
            <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Clonagem de Voz
            </label>
            <p class="text-[9px] text-[var(--text-secondary)]">
                @if($voiceRefName)
                    Amostra: {{ $voiceRefName }}
                @else
                    Selecione um audio de referencia (obrigatorio para XTTS v2).
                @endif
            </p>
            <label class="flex items-center justify-between w-full h-11 px-3 bg-[var(--bg-overlay)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--accent-dim)] transition-colors group">
                <span class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                    {{ $voiceRefName ? 'Trocar amostra de voz' : 'Selecionar amostra de voz' }}
                </span>
                <input type="file" wire:model="voiceRefFile" accept=".wav,.mp3,.ogg,.flac,.webm" class="hidden">
            </label>
            @if($voiceRefName)
                <button wire:click="removeVoiceRef" class="text-[10px] text-red-400 hover:text-red-300">
                    Remover amostra
                </button>
            @endif
        </section>

        {{-- XTTS v2 Parameters --}}
        <section class="space-y-4">
            <div class="flex items-center justify-between">
                <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    Parametros XTTS v2
                </label>
                <button wire:click="resetParams" class="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" title="Resetar para valores padrao">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    Resetar
                </button>
            </div>

            <div class="space-y-4 p-3 bg-[var(--bg-base)] rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
                <x-slider label="Velocidade" :value="$speed" :min="0.5" :max="2.0" :step="0.05" wire-model="speed" format-suffix="x" />
                <x-slider label="Temperatura" :value="$temperature" :min="0.1" :max="0.8" :step="0.05" wire-model="temperature" />
                <x-slider label="Top K" :value="$topK" :min="1" :max="100" :step="1" wire-model="topK" />
                <x-slider label="Top P" :value="$topP" :min="0.1" :max="1.0" :step="0.05" wire-model="topP" />
                <x-slider label="Penalidade de Repeticao" :value="$repetitionPenalty" :min="1.0" :max="5.0" :step="0.1" wire-model="repetitionPenalty" />
                <x-slider label="Penalidade de Comprimento" :value="$lengthPenalty" :min="0.5" :max="2.0" :step="0.1" wire-model="lengthPenalty" />
            </div>
        </section>
    </div>

    <div class="w-full h-px bg-[var(--border-subtle)]"></div>

    {{-- Endpoint URL --}}
    <section class="space-y-2">
        <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Servidor TTS (XTTS v2)
        </label>
        <input
            type="url"
            wire:model="modalEndpointUrl"
            x-on:input="healthStatus = 'unknown'; healthDetail = null"
            class="w-full lg:max-w-lg px-3 py-2 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] font-mono focus:outline-none focus:border-[var(--accent)] transition-colors"
            placeholder="https://..."
        >
        <div class="flex items-center gap-2">
            <button
                x-on:click="testConnection()"
                :disabled="healthStatus === 'checking' || !$wire.modalEndpointUrl.trim()"
                class="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
                <template x-if="healthStatus === 'checking'">
                    <svg class="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                </template>
                <template x-if="healthStatus === 'connected'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-green-400"><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/></svg>
                </template>
                <template x-if="healthStatus === 'offline'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-red-400"><line x1="2" x2="22" y1="2" y2="22"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.913-2.644"/><path d="M5 12.859a10 10 0 0 1 5.17-2.544"/></svg>
                </template>
                <template x-if="healthStatus !== 'checking' && healthStatus !== 'connected' && healthStatus !== 'offline'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/></svg>
                </template>
                Testar Conexao
            </button>
            <template x-if="healthStatus !== 'unknown'">
                <span
                    class="text-[10px]"
                    :class="{
                        'text-blue-400': healthStatus === 'checking',
                        'text-green-400': healthStatus === 'connected',
                        'text-yellow-400': healthStatus === 'starting',
                        'text-red-400': healthStatus === 'offline'
                    }"
                    x-text="{
                        checking: 'Verificando...',
                        connected: 'Conectado',
                        starting: 'Inicializando...',
                        offline: 'Offline'
                    }[healthStatus]"
                ></span>
            </template>
        </div>
        <template x-if="healthDetail">
            <p class="text-[9px] text-[var(--text-secondary)]" x-text="healthDetail"></p>
        </template>
    </section>
</div>
