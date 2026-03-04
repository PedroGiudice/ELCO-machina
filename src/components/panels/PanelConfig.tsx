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

    // STT Backend
    sttBackend: "vm" | "modal";
    onSttBackendChange: (backend: "vm" | "modal") => void;
}

const aiModels = [
    { id: "haiku", label: "Haiku", desc: "Mais rapido" },
    { id: "sonnet", label: "Sonnet", desc: "Equilibrado" },
    { id: "opus", label: "Opus", desc: "Qualidade maxima" },
];

const sttBackends = [
    { id: "vm" as const, label: "VM", desc: "whisper.cpp small (CPU, ~80s/min)" },
    { id: "modal" as const, label: "Modal", desc: "large-v3-turbo (GPU, ~8s/min)" },
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
    sttBackend,
    onSttBackendChange,
}: PanelConfigProps) {
    return (
        <div className="p-5 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-[var(--accent)]" />
                    <h2 className="text-sm font-semibold">Configuracoes</h2>
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
                        Claude API Key
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
                    Obtenha em: console.anthropic.com/settings/keys
                </p>
            </section>

            <div className="w-full h-px bg-[var(--border-subtle)]" />

            {/* Audio Engine */}
            <section className="space-y-4">
                <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                    <Mic className="w-3 h-3" />
                    Motor de Audio
                </label>

                {/* Mic Selection */}
                <div>
                    <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                        Dispositivo de Entrada
                    </label>
                    <div className="relative">
                        <select
                            value={selectedMicId}
                            onChange={(e) => onMicChange(e.target.value)}
                            className="w-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] py-2 px-3 text-xs focus:outline-none appearance-none text-[var(--text-primary)]"
                        >
                            <option value="default">Padrao do sistema</option>
                            {availableMics.map((mic) => (
                                <option key={mic.deviceId} value={mic.deviceId}>
                                    {mic.label ||
                                        `Microfone ${mic.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                        <ChevronRight className="absolute right-3 top-2.5 w-3 h-3 text-[var(--text-secondary)] pointer-events-none rotate-90" />
                    </div>
                </div>

                {/* Audio Toggles */}
                <div className="space-y-2">
                    <ToggleOption
                        label="Reducao de Ruido"
                        description="Filtra ruido de fundo"
                        checked={noiseSuppression}
                        onChange={onNoiseSuppressionChange}
                    />
                    <ToggleOption
                        label="Cancelamento de Eco"
                        description="Evita retorno de audio"
                        checked={echoCancellation}
                        onChange={onEchoCancellationChange}
                    />
                    <ToggleOption
                        label="Ganho Automatico"
                        description="Normaliza nivel de volume"
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
                    Modelo de IA
                </label>

                {/* Claude Version */}
                <div>
                    <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                        Versao Claude
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

                {/* STT Backend */}
                <div>
                    <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
                        STT Backend
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {sttBackends.map((backend) => (
                            <motion.button
                                key={backend.id}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onSttBackendChange(backend.id)}
                                className={`
                  flex flex-col items-start p-3 rounded-[var(--radius-sm)] border transition-all text-left
                  ${
                      sttBackend === backend.id
                          ? "bg-[var(--accent-dim)] border-[var(--accent)]"
                          : "bg-[var(--bg-overlay)] border-[var(--border-subtle)] opacity-60 hover:opacity-100"
                  }
                `}
                            >
                                <span className="text-xs font-bold">
                                    {backend.label}
                                </span>
                                <span className="text-[9px] text-[var(--text-secondary)]">
                                    {backend.desc}
                                </span>
                            </motion.button>
                        ))}
                    </div>
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
