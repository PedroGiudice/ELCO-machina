/**
 * useAudioProcessing - Hook para processamento de audio (transcricao + refinamento)
 *
 * Pipeline unificado via sidecar:
 * 1. Whisper STT (transcricao bruta)
 * 2. Claude REST refinement (via sidecar, nao via SDK direto)
 *
 * O frontend NAO chama Claude diretamente.
 * Tudo passa pelo sidecar via POST /transcribe.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
    VoiceAIClient,
} from "../services/VoiceAIClient";

// ============================================================================
// Wake Lock - impede suspensao da tela durante processamento
// ============================================================================

async function acquireWakeLock(): Promise<WakeLockSentinel | null> {
    try {
        if ("wakeLock" in navigator) {
            const sentinel = await navigator.wakeLock.request("screen");
            console.log("[WakeLock] acquired");
            return sentinel;
        }
    } catch (err) {
        console.warn("[WakeLock] failed to acquire:", err);
    }
    return null;
}

async function releaseWakeLock(sentinel: WakeLockSentinel | null): Promise<void> {
    if (sentinel && !sentinel.released) {
        await sentinel.release();
        console.log("[WakeLock] released");
    }
}
import {
    type PromptTemplate,
    buildSystemInstruction,
} from "../services/PromptStore";

// ============================================================================
// Types
// ============================================================================

export type ProcessingStats = {
    processingTime: number; // ms
    audioDuration: number; // seconds
    inputSize: number; // bytes
    wordCount: number;
    charCount: number;
    readingTime: string;
    appliedStyle: string;
};

export interface UseAudioProcessingConfig {
    audioBlob: Blob | null;
    sidecarAvailable: boolean;
    voiceAIClient: VoiceAIClient | null;
    outputLanguage: string;
    aiModel: string;
    recordingStyle: string;
    customStylePrompt: string;
    activeContext: string;
    contextMemory: Record<string, string>;
    sttBackend: string;
    selectedTemplate: PromptTemplate | undefined;
    addLog: (
        msg: string,
        type: "info" | "success" | "error" | "warning",
    ) => void;
    addToHistory: (text: string, date: string, id: string) => void;
    updateContextMemory: (ctx: string, memory: string) => void;
    saveContextToDB: (item: {
        name: string;
        memory: string;
        lastUpdated: number;
    }) => Promise<void>;
}

export interface UseAudioProcessingReturn {
    isProcessing: boolean;
    isRefining: boolean;
    transcription: string;
    setTranscription: (text: string) => void;
    lastStats: ProcessingStats | null;
    processAudio: () => Promise<void>;
    refineText: () => Promise<void>;
}

// ============================================================================
// Helpers
// ============================================================================

const generateHistoryId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// ============================================================================
// Hook
// ============================================================================

export function useAudioProcessing(
    config: UseAudioProcessingConfig,
): UseAudioProcessingReturn {
    const {
        audioBlob,
        sidecarAvailable,
        voiceAIClient,
        outputLanguage,
        aiModel,
        recordingStyle,
        customStylePrompt,
        activeContext,
        contextMemory,
        selectedTemplate,
        addLog,
        addToHistory,
        updateContextMemory,
        saveContextToDB,
        sttBackend,
    } = config;

    // Estados
    const [isProcessing, setIsProcessing] = useState(false);
    const [isRefining, setIsRefining] = useState(false);
    const [transcription, setTranscription] = useState<string>(() => {
        return localStorage.getItem("elco_current_work") || "";
    });
    const [lastStats, setLastStats] = useState<ProcessingStats | null>(null);

    // Persistir transcricao em localStorage
    useEffect(() => {
        localStorage.setItem("elco_current_work", transcription);
    }, [transcription]);

    /**
     * Processa audio via sidecar (Whisper STT + Claude REST refinement)
     */
    const processAudio = useCallback(async () => {
        if (!audioBlob) return;

        if (!sidecarAvailable || !voiceAIClient) {
            addLog(
                "Whisper indisponivel (Tailscale desconectado ou sidecar offline).",
                "error",
                "stt",
            );
            addLog("Conecte o Tailscale para transcrever audio.", "info", "stt");
            return;
        }

        setIsProcessing(true);
        const startTime = performance.now();
        const wakeLock = await acquireWakeLock();

        try {
            // Converte blob para base64
            const base64Audio = await VoiceAIClient.blobToBase64(audioBlob);
            const format = VoiceAIClient.getFormatFromMimeType(audioBlob.type);

            // Determina se deve refinar e qual system instruction usar
            const isWhisperOnly = !selectedTemplate || selectedTemplate.name === 'Whisper Only';
            const shouldRefine = !isWhisperOnly && !!selectedTemplate;

            let systemInstruction: string | null = null;
            let temperature: number | undefined;

            if (shouldRefine && selectedTemplate) {
                const currentMemory = contextMemory[activeContext] || "No previous context.";
                systemInstruction = buildSystemInstruction(
                    selectedTemplate,
                    currentMemory,
                    outputLanguage,
                    recordingStyle,
                    customStylePrompt,
                );
                temperature = selectedTemplate.temperature;
            }

            // === Etapa 1: Transcricao (STT) ===
            addLog(
                `[1/2] Transcrevendo com Whisper (${sttBackend})...`,
                "info",
                "stt",
            );
            const sttStart = performance.now();

            const result = await voiceAIClient.transcribe({
                audio: base64Audio,
                format,
                language:
                    outputLanguage === "Portuguese" ? "pt" :
                    outputLanguage === "Spanish" ? "es" : "en",
                refine: false,
                stt_backend: sttBackend as "vm" | "modal",
            });

            const sttTime = ((performance.now() - sttStart) / 1000).toFixed(1);
            addLog(
                `[1/2] Transcricao concluida (${sttTime}s)`,
                "success",
                "stt",
            );

            let finalText = result.text;

            // === Etapa 2: Refinamento (Claude) ===
            if (shouldRefine && result.text && systemInstruction) {
                addLog(
                    `[2/2] Refinando com Claude (${aiModel})...`,
                    "info",
                    "refiner",
                );
                const refineStart = performance.now();

                const refineResult = await voiceAIClient.refine({
                    text: result.text,
                    system_instruction: systemInstruction,
                    model: aiModel,
                    temperature,
                });

                const refineTime = ((performance.now() - refineStart) / 1000).toFixed(1);

                if (refineResult.success) {
                    finalText = refineResult.refined_text;
                    addLog(
                        `[2/2] Refinado com Claude/${refineResult.model_used} (${refineTime}s)`,
                        "success",
                        "refiner",
                    );
                } else {
                    addLog(
                        `[2/2] Refinamento falhou: ${refineResult.error}. Usando texto bruto.`,
                        "warning",
                        "refiner",
                    );
                }
            } else if (!shouldRefine) {
                addLog("Whisper Only -- sem refinamento.", "info", "stt");
            }

            // Adiciona filename se nao presente
            if (finalText.trim() && !finalText.includes("\n\n")) {
                const firstWords = finalText
                    .split(/\s+/)
                    .slice(0, 5)
                    .join("-")
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "");
                if (firstWords) {
                    finalText = `${firstWords}\n\n${finalText}`;
                }
            }

            const cleanedText = finalText.trim();
            setTranscription(cleanedText);

            // Atualiza Context Memory
            const currentMemory = contextMemory[activeContext] || "No previous context.";
            const updatedMemory = (currentMemory + "\n" + cleanedText).slice(-5000);
            updateContextMemory(activeContext, updatedMemory);

            saveContextToDB({
                name: activeContext,
                memory: updatedMemory,
                lastUpdated: Date.now(),
            }).catch((e) => console.error("Auto-save failed", e));

            // Calcula Stats
            const endTime = performance.now();
            const wordCount = cleanedText.split(/\s+/).filter((w) => w.length > 0).length;
            const charCount = cleanedText.length;
            const readingTimeVal = Math.ceil(wordCount / 200);

            const newStats: ProcessingStats = {
                processingTime: endTime - startTime,
                audioDuration: result.duration,
                inputSize: audioBlob.size,
                wordCount,
                charCount,
                readingTime: `${readingTimeVal} min read`,
                appliedStyle: selectedTemplate?.name || 'Whisper Only',
            };

            setLastStats(newStats);

            // Adiciona ao historico
            addToHistory(
                cleanedText,
                new Date().toISOString(),
                generateHistoryId(),
            );

            const mode = shouldRefine
                ? `Whisper + Claude (${aiModel})`
                : "Whisper";
            addLog(`Processo finalizado via ${mode}.`, "success", "app");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(err);
            addLog(`Erro no processamento: ${message}`, "error", "app");
        } finally {
            await releaseWakeLock(wakeLock);
            setIsProcessing(false);
        }
    }, [
        audioBlob,
        sidecarAvailable,
        voiceAIClient,
        outputLanguage,
        aiModel,
        recordingStyle,
        customStylePrompt,
        activeContext,
        contextMemory,
        sttBackend,
        selectedTemplate,
        addLog,
        addToHistory,
        updateContextMemory,
        saveContextToDB,
    ]);

    /**
     * Refina o texto atual do editor usando Claude CLI (independente do STT)
     */
    const refineText = useCallback(async () => {
        if (!transcription.trim()) return;

        if (!sidecarAvailable || !voiceAIClient) {
            addLog("Sidecar indisponivel para refinamento.", "error", "ipc");
            return;
        }

        if (!selectedTemplate || selectedTemplate.name === 'Whisper Only') {
            addLog("Selecione um template de refinamento (nao Whisper Only).", "warning", "refiner");
            return;
        }

        const currentMemory = contextMemory[activeContext] || "No previous context.";
        const systemInstruction = buildSystemInstruction(
            selectedTemplate,
            currentMemory,
            outputLanguage,
            recordingStyle,
            customStylePrompt,
        );

        setIsRefining(true);
        addLog(`Refinando com Claude (${aiModel})...`, "info", "refiner");
        const refineStart = performance.now();

        try {
            const result = await voiceAIClient.refine({
                text: transcription,
                system_instruction: systemInstruction,
                model: aiModel,
                temperature: selectedTemplate.temperature,
            });

            const refineTime = ((performance.now() - refineStart) / 1000).toFixed(1);

            if (result.success) {
                setTranscription(result.refined_text);
                addLog(
                    `Refinado com Claude/${result.model_used} (${refineTime}s)`,
                    "success",
                    "refiner",
                );
            } else {
                addLog(
                    `Refinamento falhou: ${result.error}`,
                    "error",
                    "refiner",
                );
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            addLog(`Erro no refinamento: ${message}`, "error", "refiner");
        } finally {
            setIsRefining(false);
        }
    }, [
        transcription,
        sidecarAvailable,
        voiceAIClient,
        selectedTemplate,
        contextMemory,
        activeContext,
        outputLanguage,
        recordingStyle,
        customStylePrompt,
        aiModel,
        addLog,
    ]);

    return {
        isProcessing,
        isRefining,
        transcription,
        setTranscription,
        lastStats,
        processAudio,
        refineText,
    };
}

export default useAudioProcessing;
