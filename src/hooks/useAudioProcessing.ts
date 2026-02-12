/**
 * useAudioProcessing - Hook para processamento de audio (transcricao + refinamento)
 *
 * Pipeline unificado via sidecar:
 * 1. Whisper STT (transcricao bruta)
 * 2. Gemini REST refinement (via sidecar, nao via SDK direto)
 *
 * O frontend NAO chama Gemini diretamente.
 * Tudo passa pelo sidecar via POST /transcribe.
 */

import { useState, useCallback, useEffect } from "react";
import {
    VoiceAIClient,
} from "../services/VoiceAIClient";
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
    transcription: string;
    setTranscription: (text: string) => void;
    lastStats: ProcessingStats | null;
    processAudio: () => Promise<void>;
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
    } = config;

    // Estados
    const [isProcessing, setIsProcessing] = useState(false);
    const [transcription, setTranscription] = useState<string>(() => {
        return localStorage.getItem("gemini_current_work") || "";
    });
    const [lastStats, setLastStats] = useState<ProcessingStats | null>(null);

    // Persistir transcricao em localStorage
    useEffect(() => {
        localStorage.setItem("gemini_current_work", transcription);
    }, [transcription]);

    /**
     * Processa audio via sidecar (Whisper STT + Gemini REST refinement)
     */
    const processAudio = useCallback(async () => {
        if (!audioBlob) return;

        if (!sidecarAvailable || !voiceAIClient) {
            addLog(
                "Whisper indisponivel (Tailscale desconectado ou sidecar offline).",
                "error",
            );
            addLog("Conecte o Tailscale para transcrever audio.", "info");
            return;
        }

        setIsProcessing(true);
        const startTime = performance.now();

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

            // Log do estagio
            if (shouldRefine) {
                addLog(
                    `Processando: Whisper + ${selectedTemplate?.name || 'refinamento'}...`,
                    "info",
                );
            } else {
                addLog("Transcrevendo com Whisper...", "info");
            }

            // Chamada unica ao sidecar - ele faz Whisper + Gemini REST
            const result = await voiceAIClient.transcribe({
                audio: base64Audio,
                format,
                language:
                    outputLanguage === "Portuguese" ? "pt" :
                    outputLanguage === "Spanish" ? "es" : "en",
                refine: shouldRefine,
                system_instruction: systemInstruction,
                model: aiModel,
                temperature,
            });

            // Usa texto refinado se disponivel, senao o bruto
            let finalText = result.refined_text || result.text;

            // Log de resultado do refinamento
            if (shouldRefine) {
                if (result.refine_success) {
                    addLog(
                        `Refinado com ${result.model_used || aiModel}`,
                        "success",
                    );
                } else if (result.refine_error) {
                    addLog(
                        `Refinamento falhou: ${result.refine_error}. Usando texto bruto.`,
                        "warning",
                    );
                }
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
                ? `Whisper + Gemini (${result.model_used || aiModel})`
                : "Whisper";
            addLog(`Processo finalizado via ${mode}.`, "success");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(err);
            addLog(`Erro no processamento: ${message}`, "error");
        } finally {
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
        selectedTemplate,
        addLog,
        addToHistory,
        updateContextMemory,
        saveContextToDB,
    ]);

    return {
        isProcessing,
        transcription,
        setTranscription,
        lastStats,
        processAudio,
    };
}

export default useAudioProcessing;
