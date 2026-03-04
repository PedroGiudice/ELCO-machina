import { useState, useRef, useEffect, useCallback } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { XTTSParams, TTSSynthesizeRequest } from "../types";

/**
 * Wrapper que tenta tauriFetch e faz fallback para fetch nativo.
 * Resolve "url not allowed on the configured scope" no AppImage.
 */
async function safeFetch(
    url: string,
    init?: RequestInit & { signal?: AbortSignal },
): Promise<Response> {
    try {
        return await tauriFetch(url, init);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("url not allowed") || msg.includes("scope")) {
            console.warn(
                `[safeFetch] tauriFetch bloqueado, usando fetch nativo: ${msg}`,
            );
            return await fetch(url, init);
        }
        throw err;
    }
}

// ============================================================================
// TYPES
// ============================================================================

export type { XTTSParams, TTSSynthesizeRequest };

export type TTSStatus = "idle" | "cold_start" | "synthesizing" | "playing" | "error";

interface TTSSettings {
    xttsParams: XTTSParams;
    voiceRefAudioBase64: string | null;
    modalEndpointUrl: string;
}

export interface UseTTSReturn {
    // State
    isSpeaking: boolean;
    ttsStatus: TTSStatus;
    statusMessage: string | null;

    // Config
    xttsParams: XTTSParams;
    setXttsParams: (params: XTTSParams) => void;
    voiceRefAudio: File | null;
    setVoiceRefAudio: (file: File | null) => void;
    voiceRefAudioBase64: string | null;
    modalEndpointUrl: string;
    setModalEndpointUrl: (url: string) => void;

    // Actions
    readText: (text: string) => Promise<void>;
    stopReading: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = "tts_settings";

const DEFAULT_MODAL_URL =
    "https://pedrogiudice--xtts-serve-xttsserver-synthesize.modal.run";

export const DEFAULT_XTTS_PARAMS: XTTSParams = {
    speed: 1.0,
    temperature: 0.75,
    top_k: 20,
    top_p: 0.75,
    repetition_penalty: 2.0,
    length_penalty: 1.0,
};

// ============================================================================
// HELPERS
// ============================================================================

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64Data = result.split(",")[1] || result;
            resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================================================================
// HOOK
// ============================================================================

export function useTTS(
    _whisperServerUrl: string,
    addLog?: (msg: string, type: "info" | "success" | "error") => void,
): UseTTSReturn {
    const log = useCallback(
        (msg: string, type: "info" | "success" | "error") => {
            if (addLog) {
                addLog(msg, type);
            } else {
                console.log(`[TTS ${type}]`, msg);
            }
        },
        [addLog],
    );

    // State
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [ttsStatus, setTtsStatus] = useState<TTSStatus>("idle");
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
    const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

    // Config
    const [xttsParams, setXttsParams] = useState<XTTSParams>(DEFAULT_XTTS_PARAMS);
    const [voiceRefAudio, setVoiceRefAudio] = useState<File | null>(null);
    const [voiceRefAudioBase64, setVoiceRefAudioBase64] = useState<string | null>(null);
    const [modalEndpointUrl, setModalEndpointUrl] = useState(DEFAULT_MODAL_URL);

    // Converter File para base64 quando muda
    useEffect(() => {
        if (!voiceRefAudio) {
            setVoiceRefAudioBase64(null);
            return;
        }
        let cancelled = false;
        fileToBase64(voiceRefAudio).then((b64) => {
            if (!cancelled) setVoiceRefAudioBase64(b64);
        });
        return () => { cancelled = true; };
    }, [voiceRefAudio]);

    // Load settings on mount
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const settings: TTSSettings = JSON.parse(saved);
                if (settings.xttsParams) setXttsParams(settings.xttsParams);
                if (settings.voiceRefAudioBase64) setVoiceRefAudioBase64(settings.voiceRefAudioBase64);
                if (settings.modalEndpointUrl) setModalEndpointUrl(settings.modalEndpointUrl);
            } catch (e) {
                console.warn("Falha ao carregar configuracoes TTS:", e);
            }
        }
    }, []);

    // Persist settings on change
    useEffect(() => {
        const settings: TTSSettings = {
            xttsParams,
            voiceRefAudioBase64,
            modalEndpointUrl,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }, [xttsParams, voiceRefAudioBase64, modalEndpointUrl]);

    // Cleanup audio URL on unmount
    useEffect(() => {
        return () => {
            if (ttsAudioUrl) {
                URL.revokeObjectURL(ttsAudioUrl);
            }
        };
    }, [ttsAudioUrl]);

    // Read text aloud via XTTS v2 Modal endpoint
    const readText = useCallback(
        async (text: string): Promise<void> => {
            if (!text.trim()) {
                log("Nenhum texto para ler", "error");
                return;
            }

            if (!voiceRefAudioBase64) {
                log("Audio de referencia necessario para clonagem de voz. Faca upload na aba TTS.", "error");
                return;
            }

            // Stop current playback
            if (ttsAudioRef.current) {
                ttsAudioRef.current.pause();
                ttsAudioRef.current = null;
            }
            if (ttsAudioUrl) {
                URL.revokeObjectURL(ttsAudioUrl);
                setTtsAudioUrl(null);
            }

            setIsSpeaking(true);
            setTtsStatus("cold_start");
            setStatusMessage("Sintetizando via XTTS v2 (GPU). Primeira chamada pode levar 40-70s (cold start)...");
            log("Sintetizando via XTTS v2 (GPU). Primeira chamada pode demorar...", "info");

            try {
                const requestBody: TTSSynthesizeRequest = {
                    text,
                    ref_audio_base64: voiceRefAudioBase64,
                    language: "pt",
                    speed: xttsParams.speed,
                    temperature: xttsParams.temperature,
                    top_k: xttsParams.top_k,
                    top_p: xttsParams.top_p,
                    repetition_penalty: xttsParams.repetition_penalty,
                    length_penalty: xttsParams.length_penalty,
                };

                const controller = new AbortController();
                // Timeout longo para cold start do Modal (~70s) + inferencia
                const timeoutMs = 180000;
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                const response = await safeFetch(modalEndpointUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                setTtsStatus("synthesizing");
                setStatusMessage("Processando audio...");

                if (!response.ok) {
                    const errorText = await response.text().catch(() => "Erro desconhecido");
                    let detail: string;
                    try {
                        const errorJson = JSON.parse(errorText);
                        detail = errorJson.detail || errorText;
                    } catch {
                        detail = errorText;
                    }

                    if (response.status === 503 || response.status === 502) {
                        throw new Error("Servidor XTTS indisponivel (cold start em andamento). Tente novamente em alguns segundos.");
                    }
                    throw new Error(`Erro TTS: ${detail}`);
                }

                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                setTtsAudioUrl(audioUrl);

                // Log inference metadata from headers
                const inferenceTime = response.headers.get("X-Inference-Time");
                const audioDuration = response.headers.get("X-Audio-Duration");
                if (inferenceTime && audioDuration) {
                    log(`Inferencia: ${inferenceTime}s, duracao audio: ${audioDuration}s`, "info");
                }

                // Play audio
                setTtsStatus("playing");
                setStatusMessage("Reproduzindo...");

                const audio = new Audio(audioUrl);
                ttsAudioRef.current = audio;

                audio.onended = () => {
                    setIsSpeaking(false);
                    setTtsStatus("idle");
                    setStatusMessage(null);
                    log("Leitura concluida", "success");
                };

                audio.onerror = () => {
                    setIsSpeaking(false);
                    setTtsStatus("error");
                    setStatusMessage("Erro ao reproduzir audio");
                    log("Erro ao reproduzir audio.", "error");
                };

                await audio.play();
                log("Reproduzindo...", "success");
            } catch (err: unknown) {
                let errorMessage = "Erro desconhecido";

                if (err instanceof Error) {
                    if (err.name === "AbortError") {
                        errorMessage = "Timeout: servidor XTTS demorou demais. Cold start pode levar ate 70s na primeira chamada.";
                    } else if (
                        err.message.includes("Failed to fetch") ||
                        err.message.includes("NetworkError")
                    ) {
                        errorMessage = "Servidor XTTS inacessivel. Verifique a URL do endpoint Modal.";
                    } else {
                        errorMessage = err.message;
                    }
                }

                console.error("TTS Error:", err);
                log(`Erro TTS: ${errorMessage}`, "error");
                setIsSpeaking(false);
                setTtsStatus("error");
                setStatusMessage(errorMessage);
            }
        },
        [
            modalEndpointUrl,
            xttsParams,
            voiceRefAudioBase64,
            ttsAudioUrl,
            log,
        ],
    );

    // Stop reading
    const stopReading = useCallback(() => {
        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current.currentTime = 0;
            ttsAudioRef.current = null;
        }
        setIsSpeaking(false);
        setTtsStatus("idle");
        setStatusMessage(null);
        log("Leitura interrompida", "info");
    }, [log]);

    return {
        // State
        isSpeaking,
        ttsStatus,
        statusMessage,

        // Config
        xttsParams,
        setXttsParams,
        voiceRefAudio,
        setVoiceRefAudio,
        voiceRefAudioBase64,
        modalEndpointUrl,
        setModalEndpointUrl,

        // Actions
        readText,
        stopReading,
    };
}

export default useTTS;
