<div>
    @if($isOpen)
    <div
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        x-data
        x-on:keydown.escape.window="$wire.close()"
    >
        <div class="w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
            {{-- Header --}}
            <div class="flex items-center justify-between p-4 border-b border-white/10">
                <h2 class="text-sm font-bold">Prompt Manager</h2>
                <button
                    wire:click="close"
                    class="opacity-50 hover:opacity-100 transition-opacity"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>

            {{-- Toolbar --}}
            <div class="px-4 py-3 border-b border-white/10 flex flex-wrap gap-2">
                <button
                    wire:click="newPrompt"
                    class="px-3 py-1.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors flex items-center gap-1.5"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                    New Prompt
                </button>

                {{-- Import --}}
                <label class="px-3 py-1.5 text-[10px] font-medium bg-white/5 text-white/60 border border-white/10 rounded hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                    Import
                    <input type="file" wire:model="importFile" accept=".json,.txt" class="hidden">
                </label>

                @if($importFile)
                    <button
                        wire:click="importPrompts"
                        class="px-3 py-1.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/30 transition-colors flex items-center gap-1.5"
                    >
                        Confirm Import
                    </button>
                @endif

                <button
                    wire:click="exportPrompts"
                    class="px-3 py-1.5 text-[10px] font-medium bg-white/5 text-white/60 border border-white/10 rounded hover:bg-white/10 transition-colors flex items-center gap-1.5"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    Export
                </button>

                <button
                    wire:click="resetBuiltins"
                    class="px-3 py-1.5 text-[10px] font-medium border rounded transition-colors flex items-center gap-1.5 {{ $confirmReset ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10' }}"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                    {{ $confirmReset ? 'Sure? Click again' : 'Reset Builtins' }}
                </button>
            </div>

            {{-- Body --}}
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
                {{-- Builtins --}}
                <div>
                    <h3 class="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                        Builtins ({{ $builtins->count() }})
                    </h3>
                    <div class="border border-white/10 rounded-md divide-y divide-white/5">
                        @foreach($builtins as $t)
                            <div class="flex items-center justify-between py-2 px-3 hover:bg-white/5 rounded transition-colors group">
                                <div class="flex-1 min-w-0">
                                    <span class="text-xs text-white/80 truncate block">{{ $t->name }}</span>
                                </div>
                                <div class="flex items-center gap-3 flex-shrink-0">
                                    <span class="text-[9px] font-mono text-white/30">
                                        temp: {{ number_format($t->temperature, 1) }}
                                    </span>
                                    <div class="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                        <button
                                            wire:click="editTemplate('{{ $t->id }}')"
                                            class="p-1 hover:bg-white/10 rounded transition-colors"
                                            title="Edit"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                                        </button>
                                        <button
                                            wire:click="duplicatePrompt('{{ $t->id }}')"
                                            class="p-1 hover:bg-white/10 rounded transition-colors"
                                            title="Duplicate"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        @endforeach
                    </div>
                </div>

                {{-- Custom --}}
                @if($customs->count() > 0)
                    <div>
                        <h3 class="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                            Custom ({{ $customs->count() }})
                        </h3>
                        <div class="border border-white/10 rounded-md divide-y divide-white/5">
                            @foreach($customs as $t)
                                <div class="flex items-center justify-between py-2 px-3 hover:bg-white/5 rounded transition-colors group">
                                    <div class="flex-1 min-w-0">
                                        <span class="text-xs text-white/80 truncate block">{{ $t->name }}</span>
                                    </div>
                                    <div class="flex items-center gap-3 flex-shrink-0">
                                        <span class="text-[9px] font-mono text-white/30">
                                            temp: {{ number_format($t->temperature, 1) }}
                                        </span>
                                        <div class="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                            <button
                                                wire:click="editTemplate('{{ $t->id }}')"
                                                class="p-1 hover:bg-white/10 rounded transition-colors"
                                                title="Edit"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                                            </button>
                                            <button
                                                wire:click="duplicatePrompt('{{ $t->id }}')"
                                                class="p-1 hover:bg-white/10 rounded transition-colors"
                                                title="Duplicate"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                            </button>
                                            <button
                                                wire:click="deletePrompt('{{ $t->id }}')"
                                                class="p-1 rounded transition-colors {{ $deletingId === $t->id ? 'bg-red-500/20 text-red-400' : 'hover:bg-red-500/10 text-white/50 hover:text-red-400' }}"
                                                title="{{ $deletingId === $t->id ? 'Click again to confirm' : 'Delete' }}"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            @endforeach
                        </div>
                    </div>
                @else
                    <p class="text-[10px] text-white/30 text-center py-4">
                        No custom templates yet. Click &ldquo;New Prompt&rdquo; or &ldquo;Duplicate&rdquo; a builtin.
                    </p>
                @endif
            </div>
        </div>
    </div>
    @endif
</div>
