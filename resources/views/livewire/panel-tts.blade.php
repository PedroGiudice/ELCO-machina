<div class="p-5 lg:p-8 space-y-6 max-w-3xl mx-auto">
    {{-- Header --}}
    <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-[var(--accent)]"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        <h2 class="text-sm lg:text-base font-semibold">Texto para Fala</h2>
    </div>

    {{-- Status --}}
    @php
        $statusColors = [
            'info' => 'text-blue-400',
            'success' => 'text-green-400',
            'error' => 'text-red-400',
        ];
    @endphp

    @if($statusMessage)
        <div class="flex items-center gap-2 text-[10px] {{ $statusColors[$statusType] ?? 'text-[var(--text-secondary)]' }}">
            @if($ttsStatus === 'synthesizing')
                <svg class="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            @endif
            <span>{{ $statusMessage }}</span>
        </div>
    @endif

    {{-- Model Selector --}}
    <section class="space-y-2">
        <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Modelo</label>
        <div class="flex gap-2">
            @foreach($availableModels as $key => $label)
                <button
                    wire:click="setModel('{{ $key }}')"
                    class="px-3 py-1.5 text-[11px] rounded-[var(--radius-sm)] border transition-colors
                        {{ $ttsModel === $key
                            ? 'bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--text-primary)]'
                            : 'bg-[var(--bg-overlay)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--accent-dim)]' }}"
                >
                    {{ $label }}
                </button>
            @endforeach
        </div>
    </section>

    {{-- Text Input --}}
    <section class="space-y-2">
        <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Texto</label>
        <textarea
            wire:model="text"
            rows="4"
            class="w-full px-3 py-2 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--accent)] transition-colors resize-y"
            placeholder="Escreva o texto a sintetizar (com acentos)..."
        ></textarea>
    </section>

    {{-- Language --}}
    <section class="space-y-2">
        <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Idioma</label>
        <select
            wire:model="language"
            class="w-full lg:max-w-xs px-3 py-2 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs focus:outline-none focus:border-[var(--accent)]"
        >
            <option value="pt">Portugues</option>
            <option value="en">English</option>
            <option value="es">Espanol</option>
        </select>
    </section>

    <div class="w-full h-px bg-[var(--border-subtle)]"></div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {{-- Voice Bank --}}
        <section class="space-y-3">
            <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Banco de Vozes
            </label>

            @if($voices->isEmpty())
                <p class="text-[10px] text-[var(--text-secondary)]">Nenhuma voz cadastrada.</p>
            @else
                <div class="space-y-1 max-h-40 overflow-y-auto">
                    @foreach($voices as $voice)
                        <label class="flex items-center justify-between px-3 py-2 bg-[var(--bg-overlay)] border rounded-[var(--radius-sm)] cursor-pointer transition-colors
                            {{ $selectedVoiceId === $voice->id ? 'border-[var(--accent)] bg-[var(--accent-dim)]' : 'border-[var(--border-subtle)] hover:bg-[var(--accent-dim)]' }}">
                            <div class="flex items-center gap-2 min-w-0">
                                <input
                                    type="radio"
                                    wire:click="selectVoice({{ $voice->id }})"
                                    {{ $selectedVoiceId === $voice->id ? 'checked' : '' }}
                                    class="accent-[var(--accent)] shrink-0"
                                >
                                <div class="min-w-0">
                                    <span class="text-xs">{{ $voice->name }}</span>
                                    @if($voice->is_preset)
                                        <span class="text-[9px] px-1.5 py-0.5 bg-[var(--accent-dim)] text-[var(--accent)] rounded">preset</span>
                                    @endif
                                    @if($voice->ref_text)
                                        <p class="text-[9px] text-[var(--text-secondary)] truncate" title="{{ $voice->ref_text }}">{{ Str::limit($voice->ref_text, 50) }}</p>
                                    @endif
                                </div>
                            </div>
                            @if(!$voice->is_preset)
                                <button wire:click.prevent="deleteVoice({{ $voice->id }})" class="text-[10px] text-red-400 hover:text-red-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                            @endif
                        </label>
                    @endforeach
                </div>
            @endif

            {{-- Upload new voice --}}
            <div class="space-y-2 p-3 bg-[var(--bg-base)] rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
                <input
                    type="text"
                    wire:model="newVoiceName"
                    placeholder="Nome da voz"
                    class="w-full px-2 py-1.5 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] focus:outline-none focus:border-[var(--accent)]"
                >
                <label class="flex items-center justify-between w-full h-9 px-3 bg-[var(--bg-overlay)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--accent-dim)] transition-colors">
                    <span class="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                        {{ $newVoiceFile ? $newVoiceFile->getClientOriginalName() : 'Selecionar audio' }}
                    </span>
                    <input type="file" wire:model="newVoiceFile" accept=".wav,.mp3,.ogg,.flac,.webm" class="hidden">
                </label>
                <div class="space-y-1">
                    <label class="text-[10px] text-[var(--text-secondary)]">Texto de referencia (transcricao do audio)</label>
                    <textarea
                        wire:model="newVoiceRefText"
                        rows="2"
                        class="w-full px-2 py-1.5 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] focus:outline-none focus:border-[var(--accent)] resize-y"
                        placeholder="Escreva exatamente o que e dito no audio de referencia"
                    ></textarea>
                </div>
                @if($newVoiceFile && $newVoiceName && $newVoiceRefText)
                    <button
                        wire:click="uploadVoice"
                        class="w-full py-1.5 text-[10px] font-medium bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)] rounded-[var(--radius-sm)] hover:bg-[var(--accent)] hover:text-[var(--bg-base)] transition-colors"
                    >
                        Salvar voz
                    </button>
                @endif
            </div>

            @if(!$selectedVoiceId && $ttsModel === 'qwen-tts')
                <p class="text-[10px] text-yellow-400">Qwen3-TTS requer audio de referencia.</p>
            @endif
        </section>

        {{-- Model Parameters --}}
        <section class="space-y-4">
            <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Parametros
            </label>

            <div class="space-y-4 p-3 bg-[var(--bg-base)] rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
                @if($ttsModel === 'chatterbox')
                    <x-slider label="Expressividade" :value="$exaggeration" :min="0.25" :max="2.0" :step="0.05" wire-model="exaggeration" />
                    <x-slider label="CFG Weight" :value="$cfgWeight" :min="0.0" :max="1.0" :step="0.05" wire-model="cfgWeight" />
                    <p class="text-[9px] text-[var(--text-secondary)]">
                        Expressividade: 0.5 = neutro. CFG Weight: 0.0 = minimiza sotaque do ref audio.
                    </p>
                @elseif($ttsModel === 'qwen-tts')
                    <p class="text-[10px] text-[var(--text-secondary)]">
                        O texto de referencia e o audio sao vinculados ao perfil de voz.
                        Selecione uma voz no banco ao lado ou faca upload de uma nova.
                    </p>
                @endif
            </div>
        </section>
    </div>

    <div class="w-full h-px bg-[var(--border-subtle)]"></div>

    {{-- Synthesize Button --}}
    <x-button
        variant="primary"
        class="w-full h-14 text-base"
        wire:click="synthesize"
        :disabled="empty(trim($text)) || $ttsStatus === 'synthesizing'"
    >
        @if($ttsStatus === 'synthesizing')
            <svg class="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Sintetizando...
        @else
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            Sintetizar
        @endif
    </x-button>

    {{-- Audio Player --}}
    @if($ttsAudioUrl)
        <section class="space-y-2">
            <div class="flex items-center justify-between">
                <label class="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Audio Gerado</label>
                <div class="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
                    @if($inferenceTime)
                        <span>Inferencia: {{ number_format($inferenceTime, 1) }}s</span>
                    @endif
                    @if($audioDuration)
                        <span>Duracao: {{ number_format($audioDuration, 1) }}s</span>
                    @endif
                </div>
            </div>
            <audio controls class="w-full" src="{{ $ttsAudioUrl }}"></audio>
            <button wire:click="clearResult" class="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Limpar resultado
            </button>
        </section>
    @endif
</div>
