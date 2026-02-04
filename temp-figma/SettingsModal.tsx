import React, { useState } from 'react';
import { useGlobal } from '../context/GlobalContext';
import { IconSettings } from './icons';
import { X, Eye, EyeOff, Mic, Activity, Zap, Cpu, Trash2, RotateCcw, MessageSquare, Server, Cloud, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as Dialog from '@radix-ui/react-dialog';

export const SettingsModal = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    geminiKey,
    setGeminiKey,
    selectedModel,
    setSelectedModel,
    promptStyle,
    setPromptStyle,
    isPromptStylePersistent,
    setIsPromptStylePersistent,
    // Voice AI Sidecar
    transcriptionMode,
    setTranscriptionMode,
    sidecarAvailable,
    sidecarStatus,
    checkSidecarHealth
  } = useGlobal();
  const [showKey, setShowKey] = useState(false);
  const [tempKey, setTempKey] = useState(geminiKey);
  const [activeTab, setActiveTab] = useState('general');
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  // Sync temp key when opening
  React.useEffect(() => {
    if (isSettingsOpen) setTempKey(geminiKey);
  }, [isSettingsOpen, geminiKey]);

  const handleSaveKey = () => {
    setGeminiKey(tempKey);
    // Show success toast?
  };

  const handleCheckHealth = async () => {
    setIsCheckingHealth(true);
    await checkSidecarHealth();
    setIsCheckingHealth(false);
  };

  if (!isSettingsOpen) return null;

  return (
    <Dialog.Root open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] bg-[#18181b] border border-white/10 rounded-lg shadow-2xl z-50 flex flex-col outline-none animate-in zoom-in-95 duration-200">

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2 text-zinc-200">
              <IconSettings className="w-5 h-5 text-indigo-500" />
              <h2 className="text-sm font-bold uppercase tracking-wide">System Configuration</h2>
            </div>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-zinc-700">

            {/* Transcription Mode Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Transcription Engine</h3>
                <button
                  onClick={handleCheckHealth}
                  disabled={isCheckingHealth}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3 h-3", isCheckingHealth && "animate-spin")} />
                  Check Status
                </button>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-md p-4 space-y-4">
                {/* Status Indicator */}
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-zinc-500" />
                    <span className="text-xs text-zinc-300">Local Sidecar</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      sidecarAvailable ? "bg-emerald-500" : "bg-red-500"
                    )} />
                    <span className={cn(
                      "text-[10px] font-medium",
                      sidecarAvailable ? "text-emerald-400" : "text-red-400"
                    )}>
                      {sidecarAvailable ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>

                {/* Mode Selection */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'auto', name: 'Auto', desc: 'Best available', icon: Zap },
                    { id: 'local', name: 'Local', desc: 'Whisper sidecar', icon: Server },
                    { id: 'cloud', name: 'Cloud', desc: 'Gemini API', icon: Cloud },
                  ].map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => setTranscriptionMode(mode.id as 'auto' | 'local' | 'cloud')}
                      className={cn(
                        "flex flex-col gap-1 p-3 rounded-md border text-left transition-all",
                        transcriptionMode === mode.id
                          ? "bg-indigo-500/10 border-indigo-500/50"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={cn("text-xs font-bold", transcriptionMode === mode.id ? "text-indigo-300" : "text-zinc-300")}>
                          {mode.name}
                        </span>
                        <mode.icon className={cn("w-3 h-3", transcriptionMode === mode.id ? "text-indigo-400" : "text-zinc-600")} />
                      </div>
                      <span className="text-[10px] text-zinc-500">{mode.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Mode Description */}
                <p className="text-[10px] text-zinc-500">
                  {transcriptionMode === 'auto' && "Automatically uses local sidecar when available, falls back to cloud."}
                  {transcriptionMode === 'local' && "Forces local Whisper transcription. Requires sidecar to be running."}
                  {transcriptionMode === 'cloud' && "Always uses Gemini cloud API for transcription."}
                </p>

                {/* Sidecar Error */}
                {sidecarStatus.error && (
                  <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                    Error: {sidecarStatus.error}
                  </div>
                )}
              </div>
            </section>

            {/* API Key Section */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Gemini API Key</h3>
              <div className="bg-white/5 border border-white/10 rounded-md p-4 space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? "text" : "password"}
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      placeholder="Enter your Gemini API Key"
                      className="w-full h-10 bg-black/20 border border-white/10 rounded-sm px-3 text-sm text-zinc-200 outline-none focus:border-indigo-500 transition-colors"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    onClick={handleSaveKey}
                    className="h-10 px-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-sm hover:bg-emerald-500/20 font-medium text-xs transition-colors"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Your key is stored locally in your browser. Get a key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google AI Studio</a>.
                </p>
              </div>
            </section>

            {/* Audio Engine */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Audio Engine</h3>
              <div className="bg-white/5 border border-white/10 rounded-md p-4 space-y-4">
                <div className="space-y-1">
                   <label className="text-[10px] text-zinc-500">Input Device</label>
                   <select className="w-full bg-black/20 border border-white/10 rounded-sm py-2 px-3 text-xs text-zinc-300 outline-none">
                     <option>Default Microphone (Built-in)</option>
                     <option>External Microphone (USB)</option>
                   </select>
                </div>

                <div className="space-y-2 pt-2">
                  {['Noise Suppression', 'Echo Cancellation', 'Auto Gain Control'].map(feature => (
                    <div key={feature} className="flex items-center justify-between">
                      <span className="text-xs text-zinc-300">{feature}</span>
                      <Switch />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Intelligence Model */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Intelligence Model</h3>
                <button className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Reset Key
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'gemini-2.0-flash', name: '2.5 Flash', desc: 'Fastest', icon: Zap },
                  { id: 'gemini-2.0-pro', name: '2.5 Pro', desc: 'Balanced', icon: Activity },
                  { id: 'gemini-3.0-flash', name: '3.0 Flash', desc: 'Next Gen Speed', icon: Zap },
                  { id: 'gemini-3.0-pro', name: '3.0 Pro', desc: 'Max Reasoning', icon: Cpu },
                ].map(model => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={cn(
                      "flex flex-col gap-1 p-3 rounded-md border text-left transition-all",
                      selectedModel === model.id
                        ? "bg-indigo-500/10 border-indigo-500/50"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={cn("text-xs font-bold", selectedModel === model.id ? "text-indigo-300" : "text-zinc-300")}>
                        {model.name}
                      </span>
                      <model.icon className={cn("w-3 h-3", selectedModel === model.id ? "text-indigo-400" : "text-zinc-600")} />
                    </div>
                    <span className="text-[10px] text-zinc-500">{model.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Output Settings */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Output Settings</h3>
              <div className="bg-white/5 border border-white/10 rounded-md p-4 space-y-4">
                <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <label className="text-xs text-zinc-300 flex items-center gap-2">
                       <MessageSquare className="w-3 h-3 text-indigo-400" />
                       Custom Prompt Style
                     </label>
                   </div>
                   <textarea
                     value={promptStyle}
                     onChange={(e) => setPromptStyle(e.target.value)}
                     placeholder="e.g., Use a professional tone, bullet points for lists, summarize key points..."
                     className="w-full h-24 bg-black/20 border border-white/10 rounded-sm p-3 text-sm text-zinc-200 outline-none focus:border-indigo-500 transition-colors resize-none placeholder:text-zinc-600"
                   />
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-300">Persist Style</span>
                    <span className="text-[10px] text-zinc-500">
                      {isPromptStylePersistent
                        ? "Style will be saved for future sessions"
                        : "Style applies to current session only"}
                    </span>
                  </div>
                  <button
                    onClick={() => setIsPromptStylePersistent(!isPromptStylePersistent)}
                    className={cn(
                      "w-5 h-5 border rounded flex items-center justify-center transition-all",
                      isPromptStylePersistent
                        ? "bg-indigo-500 border-indigo-500 text-white"
                        : "border-zinc-600 bg-transparent hover:border-zinc-400"
                    )}
                  >
                    {isPromptStylePersistent && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><polyline points="20 6 9 17 4 12" /></svg>}
                  </button>
                </div>
              </div>
            </section>

            {/* Theme & Appearance */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Theme & Appearance</h3>
              <div className="bg-white/5 border border-white/10 rounded-md p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300">Accent Color</span>
                  <div className="flex gap-2">
                    {['#4f46e5', '#ef4444', '#facc15', '#34d399'].map(color => (
                      <button
                        key={color}
                        className="w-5 h-5 rounded-full ring-1 ring-white/20 hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] text-zinc-500">Font Family</label>
                   <select className="w-full bg-black/20 border border-white/10 rounded-sm py-2 px-3 text-xs text-zinc-300 outline-none">
                     <option>Inter</option>
                     <option>Roboto</option>
                     <option>System</option>
                   </select>
                </div>
              </div>
            </section>

            {/* Danger Zone */}
            <section className="space-y-4 pt-4 border-t border-white/5">
              <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider">Danger Zone</h3>
              <div className="flex gap-4">
                <button className="flex-1 py-2 border border-white/10 rounded-sm text-xs text-zinc-400 hover:bg-white/5 transition-colors">
                  Reset to Factory
                </button>
                <button className="flex-1 py-2 border border-red-500/20 bg-red-500/5 rounded-sm text-xs text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2">
                  <Trash2 className="w-3 h-3" /> Clear All Data
                </button>
              </div>
            </section>

          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const Switch = () => {
  const [isOn, setIsOn] = useState(true);
  return (
    <button
      onClick={() => setIsOn(!isOn)}
      className={cn(
        "w-8 h-4 rounded-full relative transition-colors",
        isOn ? "bg-indigo-600" : "bg-zinc-700"
      )}
    >
      <div className={cn(
        "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
        isOn ? "left-4.5" : "left-0.5"
      )} />
    </button>
  );
};
