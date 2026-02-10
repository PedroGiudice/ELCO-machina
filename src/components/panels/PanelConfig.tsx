import * as React from "react";
import { motion } from "motion/react";
import {
    Settings,
    Mic,
    Cpu,
    Key,
    Eye,
    EyeOff,
    ChevronRight,
    Loader2,
    LogOut,
} from "lucide-react";
import { Button } from "../ui/Button";

interface PanelConfigProps {
    // Auth
    currentUser: string | null;
    onLogout: () => void;

    // API Key
    apiKey: string;
    apiKeyInput: string;
    onApiKeyInputChange: (value: string) => void;
    onSaveApiKey: () => void;
    isApiKeyVisible: boolean;
    onToggleApiKeyVisibility: () => void;

    // Microphone
    availableMics: MediaDeviceInfo[];
    selectedMicId: string;
    onMicChange: (id: string) => void;

    // Audio Config
    noiseSuppression: boolean;
    onNoiseSuppressionChange: (value: boolean) => void;
    echoCancellation: boolean;
    onEchoCancellationChange: (value: boolean) => void;
    autoGainControl: boolean;
    onAutoGainControlChange: (value: boolean) => void;

    // AI Model
    aiModel: string;
    onAiModelChange: (model: string) => void;

    // Transcription Mode
    transcriptionMode: "auto" | "local" | "cloud";
    onTranscriptionModeChange: (mode: "auto" | "local" | "cloud") => void;
    sidecarAvailable: boolean;
    sidecarStatus: string;

    // Whisper Server
    whisperServerUrl: string;
    onWhisperServerUrlChange: (url: string) => void;
    onTestWhisperServer: () => void;
    whisperTestStatus: "idle" | "testing" | "success" | "error";
    whisperTestMessage: string;
}

const aiModels = [
    { id: "gemini-2.5-flash", label: "2.5 Flash", desc: "Fastest" },
    { id: "gemini-2.5-pro", label: "2.5 Pro", desc: "Balanced" },
    { id: "gemini-3-flash-preview", label: "3.0 Flash", desc: "Next Gen" },
    { id: "gemini-3-pro-preview", label: "3.0 Pro", desc: "Max Quality" },
];

const transcriptionModes = [
    { id: "auto" as const, label: "Auto", desc: "Best available" },
    { id: "local" as const, label: "Local", desc: "Whisper" },
    { id: "cloud" as const, label: "Cloud", desc: "Gemini" },
];

export function PanelConfig({
    currentUser,
    onLogout,
    apiKey,
    apiKeyInput,
    onApiKeyInputChange,
    onSaveApiKey,
    isApiKeyVisible,
    onToggleApiKeyVisibility,
    availableMics,
    selectedMicId,
    onMicChange,
    noiseSuppression,
    onNoiseSuppressionChange,
    echoCancellation,
    onEchoCancellationChange,
    autoGainControl,
    onAutoGainControlChange,
    aiModel,
    onAiModelChange,
    transcriptionMode,
    onTranscriptionModeChange,
    sidecarAvailable,
    sidecarStatus,
    whisperServerUrl,
    onWhisperServerUrlChange,
    onTestWhisperServer,
    whisperTestStatus,
    whisperTestMessage,
}: PanelConfigProps) {
    return (
        <div className="p-5 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-[var(--accent)]" />
                    <h2 className="text-sm font-semibold">Settings</h2>
                </div>
                {currentUser && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--text-secondary)]">
                            {currentUser}
                        </span>
                        <button
                            onClick={onLogout}
                            className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 bg-red-500/10 rounded"
                        >
                            <LogOut className="w-3 h-3" />
                            Sair
                        </button>
                    </div>
                )}
            </div>

            {/* API Key */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                        <Key className="w-3 h-3" />
                        Gemini API Key
                    </label>
                    <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${apiKey ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                    >
                        {apiKey ? "CONFIGURADA" : "NÃO CONFIGURADA"}
                    </span>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type={isApiKeyVisible ? "text" : "password"}
                            value={apiKeyInput}
                            onChange={(e) =>
                                onApiKeyInputChange(e.target.value)
                            }
                            placeholder="Cole sua API Key..."
                            className="w-full px-3 py-2 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                        />
                        <button
                            onClick={onToggleApiKeyVisibility}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                            {isApiKeyVisible ? (
                                <EyeOff className="w-4 h-4" />
                            ) : (
                                <Eye className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onSaveApiKey}
                        disabled={!apiKeyInput.trim() || apiKeyInput === apiKey}
                    >
                        Salvar
                    </Button>
                </div>
                <p className="text-[9px] text-[var(--text-secondary)]">
                    Obtenha em: aistudio.google.com/apikey
                </p>
            </section>

            <div className="w-full h-px bg-[var(--border-subtle)]" />

            {/* Audio Engine */}
            <section className="space-y-4">
                <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                    <Mic className="w-3 h-3" />
                    Audio Engine
                </label>

                {/* Mic Selection */}
                <div>
                    <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                        Input Device
                    </label>
                    <div className="relative">
                        <select
                            value={selectedMicId}
                            onChange={(e) => onMicChange(e.target.value)}
                            className="w-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] py-2 px-3 text-xs focus:outline-none appearance-none text-[var(--text-primary)]"
                        >
                            <option value="default">System Default</option>
                            {availableMics.map((mic) => (
                                <option key={mic.deviceId} value={mic.deviceId}>
                                    {mic.label ||
                                        `Microphone ${mic.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                        <ChevronRight className="absolute right-3 top-2.5 w-3 h-3 text-[var(--text-secondary)] pointer-events-none rotate-90" />
                    </div>
                </div>

                {/* Audio Toggles */}
                <div className="space-y-2">
                    <ToggleOption
                        label="Noise Suppression"
                        description="Filter background static"
                        checked={noiseSuppression}
                        onChange={onNoiseSuppressionChange}
                    />
                    <ToggleOption
                        label="Echo Cancellation"
                        description="Prevent audio feedback"
                        checked={echoCancellation}
                        onChange={onEchoCancellationChange}
                    />
                    <ToggleOption
                        label="Auto Gain Control"
                        description="Normalize volume levels"
                        checked={autoGainControl}
                        onChange={onAutoGainControlChange}
                    />
                </div>
            </section>

            <div className="w-full h-px bg-[var(--border-subtle)]" />

            {/* Intelligence Model */}
            <section className="space-y-4">
                <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                    <Cpu className="w-3 h-3" />
                    Intelligence Model
                </label>

                {/* Gemini Version */}
                <div>
                    <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                        Gemini Version
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {aiModels.map((model) => (
                            <motion.button
                                key={model.id}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onAiModelChange(model.id)}
                                className={`
                  flex flex-col items-start p-3 rounded-[var(--radius-sm)] border transition-all text-left
                  ${
                      aiModel === model.id
                          ? "bg-[var(--accent-dim)] border-[var(--accent)]"
                          : "bg-[var(--bg-overlay)] border-[var(--border-subtle)] opacity-60 hover:opacity-100"
                  }
                `}
                            >
                                <span className="text-xs font-bold">
                                    {model.label}
                                </span>
                                <span className="text-[9px] text-[var(--text-secondary)]">
                                    {model.desc}
                                </span>
                            </motion.button>
                        ))}
                    </div>
                </div>

                {/* Transcription Engine */}
                <div>
                    <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                        Transcription Engine
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {transcriptionModes.map((mode) => (
                            <motion.button
                                key={mode.id}
                                whileTap={{ scale: 0.98 }}
                                onClick={() =>
                                    onTranscriptionModeChange(mode.id)
                                }
                                disabled={
                                    mode.id === "local" && !sidecarAvailable
                                }
                                className={`
                  flex flex-col items-start p-3 rounded-[var(--radius-sm)] border transition-all text-left
                  ${
                      transcriptionMode === mode.id
                          ? "bg-[var(--accent-dim)] border-[var(--accent)]"
                          : "bg-[var(--bg-overlay)] border-[var(--border-subtle)] opacity-60 hover:opacity-100"
                  }
                  ${mode.id === "local" && !sidecarAvailable ? "cursor-not-allowed opacity-30" : ""}
                `}
                            >
                                <span className="text-xs font-bold">
                                    {mode.label}
                                </span>
                                <span className="text-[9px] text-[var(--text-secondary)]">
                                    {mode.desc}
                                </span>
                            </motion.button>
                        ))}
                    </div>
                    <p className="text-[9px] text-[var(--text-secondary)] mt-2">
                        Status: {sidecarStatus}
                    </p>
                </div>

                {/* Whisper Server URL */}
                <div>
                    <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                        Whisper Server
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={whisperServerUrl}
                            onChange={(e) =>
                                onWhisperServerUrlChange(e.target.value)
                            }
                            placeholder="http://100.114.203.28:8765"
                            className="flex-1 px-3 py-2 text-xs bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onTestWhisperServer}
                            disabled={whisperTestStatus === "testing"}
                        >
                            {whisperTestStatus === "testing" ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                "Testar"
                            )}
                        </Button>
                    </div>
                    <p
                        className={`text-[9px] mt-1.5 ${
                            whisperTestStatus === "success"
                                ? "text-green-400"
                                : whisperTestStatus === "error"
                                  ? "text-red-400"
                                  : "text-[var(--text-secondary)]"
                        }`}
                    >
                        {whisperTestStatus === "idle"
                            ? "Deixe vazio para usar sidecar local"
                            : whisperTestMessage}
                    </p>
                </div>
            </section>
        </div>
    );
}

// Helper Component
function ToggleOption({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between p-3 bg-[var(--bg-overlay)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
            <div>
                <p className="text-xs font-medium text-[var(--text-primary)]">
                    {label}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)]">
                    {description}
                </p>
            </div>
            <button
                onClick={() => onChange(!checked)}
                className={`w-10 h-5 rounded-full relative transition-colors ${
                    checked ? "bg-emerald-500" : "bg-[var(--border-subtle)]"
                }`}
            >
                <div
                    className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${
                        checked ? "left-6" : "left-1"
                    }`}
                />
            </button>
        </div>
    );
}
