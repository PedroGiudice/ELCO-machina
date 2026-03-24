<div
    x-data="{
        isRecording: false,
        audioBlob: null,
        audioBlobSize: 0,
        mediaRecorder: null,
        selectedMicLabel: 'Default Mic',
        autoGainControl: true,

        async startRecording() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: this.autoGainControl }
                });
                this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                const chunks = [];

                this.mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
                this.mediaRecorder.onstop = () => {
                    this.audioBlob = new Blob(chunks, { type: 'audio/webm' });
                    this.audioBlobSize = (this.audioBlob.size / 1024).toFixed(1);
                    stream.getTracks().forEach(t => t.stop());
                };

                this.mediaRecorder.start();
                this.isRecording = true;
            } catch (err) {
                console.error('Mic error:', err);
            }
        },

        stopRecording() {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            this.isRecording = false;
        }
    }"
    class="p-5 lg:p-8 space-y-6 max-w-3xl mx-auto"
>
    {{-- Header --}}
    <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[var(--accent)]"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        <h2 class="text-sm lg:text-base font-semibold">Audio para Texto</h2>
    </div>

    {{-- Context Pool Selector --}}
    <section class="space-y-3">
        <div class="flex items-center justify-between">
            <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>
                Context Scope
            </label>
            <button class="text-[9px] flex items-center gap-1 hover:opacity-80 transition-colors text-[var(--accent)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>
                Memory
            </button>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            @foreach($contextPools as $ctx)
                <button
                    wire:click="setContext('{{ $ctx }}')"
                    class="flex-shrink-0 px-3 py-1.5 rounded-[var(--radius-sm)] text-[10px] font-medium transition-all border {{ $activeContext === $ctx ? 'bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--text-primary)]' : 'bg-[var(--bg-overlay)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]' }}"
                >
                    {{ $ctx }}
                </button>
            @endforeach
            <button class="flex-shrink-0 w-7 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-overlay)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            </button>
        </div>
    </section>

    <div class="w-full h-px bg-[var(--border-subtle)]"></div>

    {{-- Audio Capture + File Upload: side by side on desktop --}}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {{-- Audio Capture --}}
        <section class="space-y-3">
            <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                Audio Input
            </label>

            {{-- Recording Style Toggle --}}
            <div class="flex gap-2 bg-[var(--bg-overlay)] p-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
                @foreach(['Dictation', 'Interview'] as $style)
                    <button
                        wire:click="setRecordingStyle('{{ $style }}')"
                        class="flex-1 py-1.5 text-[10px] rounded-[var(--radius-sm)] transition-all flex items-center justify-center gap-1.5 {{ $recordingStyle === $style ? 'bg-[var(--accent-dim)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]' }}"
                    >
                        @if($style === 'Dictation')
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                        @else
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        @endif
                        {{ $style }}
                    </button>
                @endforeach
            </div>

            {{-- Recording Controls --}}
            <div class="bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
                <div class="flex items-center gap-2 mb-3">
                    <template x-if="!isRecording">
                        <x-button variant="secondary" class="flex-1 h-10" x-on:click="startRecording()">
                            <div class="w-2 h-2 rounded-full bg-red-500"></div>
                            Gravar
                        </x-button>
                    </template>
                    <template x-if="isRecording">
                        <x-button variant="secondary" class="flex-1 h-10 text-red-400 border-red-500/30 bg-red-500/10" x-on:click="stopRecording()">
                            <div class="w-3 h-3 bg-red-500 rounded-sm"></div>
                            Parar
                        </x-button>
                    </template>
                </div>

                {{-- Visualizer Area --}}
                <div class="h-12 bg-[var(--bg-base)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden relative">
                    <span class="text-[10px] text-[var(--text-secondary)]" x-text="isRecording ? 'Gravando...' : 'Pronto'"></span>
                    <template x-if="isRecording">
                        <div class="absolute top-1 right-2 flex items-center gap-1.5">
                            <div class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                            <span class="text-[9px] text-red-400 font-mono tracking-tighter">LIVE</span>
                        </div>
                    </template>
                </div>

                {{-- Mic Info --}}
                <div class="mt-2 text-[9px] text-[var(--text-secondary)] flex justify-between">
                    <span>Usando: <span x-text="selectedMicLabel"></span></span>
                    <span class="opacity-50">AGC <span x-text="autoGainControl ? 'ON' : 'OFF'"></span></span>
                </div>
            </div>
        </section>

        {{-- File Upload --}}
        <section class="space-y-3">
            <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                Importar Arquivo
            </label>
            <label
                class="flex items-center justify-between w-full h-11 px-3 bg-[var(--bg-overlay)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--accent-dim)] transition-colors group"
            >
                <span class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate">
                    @if($audioFile)
                        {{ number_format($audioFile->getSize() / 1024, 1) }} KB
                    @else
                        Selecione MP3, WAV...
                    @endif
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-[var(--text-secondary)]"><path d="m9 18 6-6-6-6"/></svg>
                <input type="file" wire:model="audioFile" accept=".mp3,.wav,.webm,.ogg,.flac" class="hidden">
            </label>
            @if($uploadError)
                <p class="text-[10px] text-red-400 pl-1">{{ $uploadError }}</p>
            @endif
        </section>
    </div>

    <div class="w-full h-px bg-[var(--border-subtle)]"></div>

    {{-- Output Settings --}}
    <section class="space-y-4">
        <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Configuracoes de Saida
        </label>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {{-- Language --}}
            <div>
                <label class="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                    Idioma de Saida
                </label>
                <select
                    wire:model="outputLanguage"
                    class="w-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] py-2.5 px-3 text-xs focus:outline-none appearance-none text-[var(--text-primary)]"
                >
                    <option value="English">Ingles</option>
                    <option value="Portuguese">Portugues</option>
                    <option value="Spanish">Espanhol</option>
                </select>
            </div>

            {{-- Style --}}
            <div>
                <div class="flex items-center justify-between mb-1.5">
                    <label class="text-[10px] text-[var(--text-secondary)]">
                        Estilo de Prompt
                    </label>
                    <button
                        wire:click="$dispatch('open-prompt-manager')"
                        class="text-[9px] flex items-center gap-1 hover:opacity-80 transition-colors text-[var(--accent)]"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
                        Gerenciar
                    </button>
                </div>
                <div class="flex gap-1.5">
                    <select
                        wire:model="outputStyle"
                        class="flex-1 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] py-2.5 px-3 text-xs focus:outline-none appearance-none text-[var(--text-primary)]"
                    >
                        @foreach($prompts as $prompt)
                            <option value="{{ $prompt->name }}">{{ $prompt->name }}</option>
                        @endforeach
                    </select>
                    @if($outputStyle !== 'Whisper Only')
                        @php
                            $selectedPrompt = $prompts->firstWhere('name', $outputStyle);
                        @endphp
                        @if($selectedPrompt)
                            <button
                                wire:click="$dispatch('edit-prompt', { promptId: '{{ $selectedPrompt->id }}' })"
                                class="px-2 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                title="Editar prompt"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                            </button>
                        @endif
                    @endif
                </div>
            </div>
        </div>

        {{-- Custom Style Input --}}
        @if($outputStyle === 'Custom')
            <div
                x-data
                x-show="true"
                x-transition:enter="transition ease-out duration-200"
                x-transition:enter-start="opacity-0"
                x-transition:enter-end="opacity-100"
            >
                <label class="text-[10px] text-[var(--text-secondary)] mb-1.5 flex justify-between">
                    <span>Instrucoes</span>
                    <span class="{{ strlen($customStylePrompt) > 150 ? 'text-red-400' : 'opacity-50' }}">
                        {{ strlen($customStylePrompt) }}/150
                    </span>
                </label>
                <textarea
                    wire:model="customStylePrompt"
                    maxlength="150"
                    placeholder="E.g. Explain like I'm five..."
                    class="w-full h-20 lg:h-24 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] p-3 text-xs focus:outline-none resize-none placeholder:opacity-30 text-[var(--text-primary)]"
                ></textarea>
            </div>
        @endif
    </section>

    {{-- Status Bar --}}
    @if($statusMessage)
        <div class="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-xs
            {{ $statusType === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : '' }}
            {{ $statusType === 'error' ? 'bg-red-500/10 border border-red-500/30 text-red-400' : '' }}
            {{ $statusType === 'info' ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400' : '' }}
        ">
            @if($isProcessing)
                <svg class="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            @elseif($statusType === 'success')
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M20 6 9 17l-5-5"/></svg>
            @elseif($statusType === 'error')
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
            @endif
            <span>{{ $statusMessage }}</span>
            @if($inferenceTime && $statusType === 'success')
                <span class="ml-auto text-[10px] opacity-70">
                    {{ $inferenceTime }}s inference | {{ $audioDuration }}s audio
                </span>
            @endif
        </div>
    @endif

    {{-- Process Button + Processing State --}}
    <div x-data="{
        running: false,
        elapsed: 0,
        phase: 0,
        timer: null,
        phases: ['Enviando audio', 'Transcrevendo', 'Processando resultado'],
        start() {
            this.elapsed = 0;
            this.phase = 0;
            this.running = true;
            this.timer = setInterval(() => {
                this.elapsed++;
                if (this.elapsed === 2) this.phase = 1;
                if (this.elapsed === 8) this.phase = 2;
            }, 1000);
        },
        stop() {
            this.running = false;
            clearInterval(this.timer);
            this.timer = null;
        },
        get time() {
            const m = Math.floor(this.elapsed / 60);
            const s = this.elapsed % 60;
            return m > 0 ? m + ':' + String(s).padStart(2, '0') : s + 's';
        }
    }"
    @click="if (!running && $el.querySelector('button:not([disabled])')) start()"
    @process-complete.window="stop()"
    >
        <x-button
            variant="primary"
            class="w-full h-12"
            wire:click="process"
            x-bind:disabled="running"
            :disabled="!$audioFile"
        >
            <template x-if="!running">
                <span class="flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
                    Transcrever
                </span>
            </template>
            <template x-if="running">
                <span class="flex items-center justify-center gap-2">
                    <span class="flex items-end gap-[3px] h-4">
                        <span class="w-[3px] bg-current rounded-full animate-[waveform_0.8s_ease-in-out_infinite_0.0s]"></span>
                        <span class="w-[3px] bg-current rounded-full animate-[waveform_0.8s_ease-in-out_infinite_0.15s]"></span>
                        <span class="w-[3px] bg-current rounded-full animate-[waveform_0.8s_ease-in-out_infinite_0.3s]"></span>
                        <span class="w-[3px] bg-current rounded-full animate-[waveform_0.8s_ease-in-out_infinite_0.45s]"></span>
                        <span class="w-[3px] bg-current rounded-full animate-[waveform_0.8s_ease-in-out_infinite_0.6s]"></span>
                    </span>
                    <span x-text="phases[phase]"></span>
                    <span class="text-xs opacity-60" x-text="time"></span>
                </span>
            </template>
        </x-button>

        {{-- Processing panel --}}
        <div x-show="running" x-transition.opacity class="mt-3 p-3 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] space-y-3">
            <div class="w-full h-1 bg-[var(--bg-base)] rounded-full overflow-hidden">
                <div class="h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent rounded-full animate-[sweep_1.5s_ease-in-out_infinite]"></div>
            </div>
            <div class="flex items-center justify-center gap-3">
                <template x-for="(p, i) in phases" :key="i">
                    <div class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full transition-colors duration-300"
                              :class="i < phase ? 'bg-green-400' : i === phase ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--border-subtle)]'"></span>
                        <span class="text-[9px] transition-colors duration-300"
                              :class="i === phase ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] opacity-50'"
                              x-text="p"></span>
                    </div>
                </template>
            </div>
            <p class="text-[9px] text-[var(--text-secondary)] text-center">
                Whisper (L4) &middot; Cold start ~15-40s, warm ~3-10s
            </p>
        </div>
    </div>

    {{-- Ready Indicator --}}
    @if($audioFile && !$isProcessing && !$resultText)
        <div class="flex items-center gap-2 justify-center text-[10px] text-[var(--text-secondary)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 text-emerald-500"><path d="M20 6 9 17l-5-5"/></svg>
            Pronto: {{ number_format($audioFile->getSize() / 1024, 1) }} KB
        </div>
    @endif

    {{-- Result --}}
    @if($resultText)
        <section class="space-y-2">
            <div class="flex items-center justify-between">
                <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    Resultado
                </label>
                <button
                    wire:click="clearResult"
                    class="text-[9px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                    Limpar
                </button>
            </div>
            <div class="bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-4 text-sm leading-relaxed text-[var(--text-primary)]">
                {{ $resultText }}
            </div>
        </section>
    @endif
</div>
