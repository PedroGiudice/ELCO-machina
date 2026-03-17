<div>
    @if($isOpen)
    <div
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        x-data
        x-on:keydown.escape.window="$wire.close()"
        x-on:keydown.ctrl.s.window.prevent="$wire.save()"
        x-on:keydown.meta.s.window.prevent="$wire.save()"
    >
        <div class="w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
            {{-- Header --}}
            <div class="flex items-center justify-between p-4 border-b border-white/10">
                <h2 class="text-sm font-bold flex items-center gap-2">
                    Edit Prompt: &ldquo;{{ $name }}&rdquo;
                </h2>
                <button
                    wire:click="close"
                    class="opacity-50 hover:opacity-100 transition-opacity"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>

            {{-- Body --}}
            <div class="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
                {{-- Name --}}
                <div>
                    <label class="text-[10px] text-white/50 mb-1.5 block uppercase tracking-wider font-bold">
                        Name
                    </label>
                    <input
                        type="text"
                        wire:model="name"
                        class="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-white/30"
                    >
                </div>

                {{-- System Instruction --}}
                <div class="flex-1 flex flex-col">
                    <div class="flex items-center justify-between mb-1.5">
                        <label class="text-[10px] text-white/50 uppercase tracking-wider font-bold">
                            System Instruction
                        </label>
                        <span class="text-[9px] font-mono {{ strlen($systemInstruction) > 5120 ? 'text-red-400' : 'text-white/30' }}">
                            {{ strlen($systemInstruction) }}/{{ self::MAX_INSTRUCTION_LENGTH }}
                        </span>
                    </div>
                    <textarea
                        wire:model="systemInstruction"
                        maxlength="{{ self::MAX_INSTRUCTION_LENGTH }}"
                        class="flex-1 min-h-[200px] w-full bg-black/20 border border-white/10 rounded-md p-3 text-xs font-mono focus:outline-none focus:border-white/30 resize-none leading-relaxed"
                        placeholder="System instruction for this prompt style..."
                    ></textarea>
                </div>

                {{-- Temperature --}}
                <div>
                    <div class="flex items-center justify-between mb-1.5">
                        <label class="text-[10px] text-white/50 uppercase tracking-wider font-bold">
                            Temperature
                        </label>
                        <span class="text-[10px] font-mono text-white/60">{{ number_format($temperature, 1) }}</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        wire:model.live="temperature"
                        class="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                            [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
                    >
                    <div class="flex justify-between text-[8px] text-white/20 mt-1">
                        <span>0.0 (preciso)</span>
                        <span>1.0</span>
                        <span>2.0 (criativo)</span>
                    </div>
                </div>

                {{-- Placeholders --}}
                <div>
                    <label class="text-[10px] text-white/50 mb-1.5 block uppercase tracking-wider font-bold">
                        Placeholders disponiveis
                    </label>
                    <div class="flex flex-wrap gap-1.5">
                        @foreach($placeholders as $ph)
                            <span class="px-2 py-1 bg-white/5 border border-white/10 rounded text-[9px] font-mono text-white/40">
                                {{ $ph }}
                            </span>
                        @endforeach
                    </div>
                </div>
            </div>

            {{-- Footer --}}
            <div class="p-4 border-t border-white/10 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    @if($isBuiltin)
                        <span class="text-[9px] text-white/30 px-2 py-1 bg-white/5 rounded">
                            Builtin -- cannot delete
                        </span>
                    @else
                        <button
                            wire:click="deletePrompt"
                            class="px-3 py-2 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5 {{ $confirmDelete ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-red-400 hover:bg-red-500/10' }}"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            {{ $confirmDelete ? 'Sure? Click again' : 'Delete' }}
                        </button>
                    @endif
                </div>

                <div class="flex items-center gap-2">
                    <button
                        wire:click="duplicate"
                        class="px-3 py-2 text-xs font-medium text-white/60 hover:text-white/90 hover:bg-white/5 rounded-sm transition-colors flex items-center gap-1.5"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        Duplicate
                    </button>
                    <button
                        wire:click="save"
                        wire:loading.attr="disabled"
                        class="px-4 py-2 text-white text-xs font-medium rounded-sm transition-colors shadow-lg flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>
                        <span wire:loading.remove wire:target="save">Save</span>
                        <span wire:loading wire:target="save">Saving...</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
    @endif
</div>
