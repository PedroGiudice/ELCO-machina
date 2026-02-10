/**
 * App.tsx - Componente principal (refatorado)
 *
 * Toda a logica de negocio foi movida para hooks em src/hooks/.
 * Este componente e responsavel por:
 * - Login screen
 * - Layout principal (AppLayout)
 * - Modais (Memory Editor)
 * - Conectar hooks aos componentes via props
 *
 * Estado global: src/context/GlobalAppContext.tsx
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GoogleGenAI } from "@google/genai";
import {
    Loader2,
    X,
    Brain,
    Zap,
    Save,
} from "lucide-react";

import {
    VoiceAIClient,
} from "./src/services/VoiceAIClient";

// Context
import { useAppContext } from "./src/context/GlobalAppContext";

// Components
import { AppLayout } from "./src/components/layout";
import { Editor } from "./src/components/editor";
import { PanelATT, PanelTTS, PanelConfig, PanelStats } from "./src/components/panels";
import { AudioVisualizer } from "./src/components/ui/AudioVisualizer";

// ============================================================================
// UTILS
// ============================================================================

const isTauri = (): boolean => {
    return typeof window !== "undefined" && "__TAURI__" in window;
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === "string") {
                const base64 = reader.result.split(",")[1];
                resolve(base64);
            } else {
                reject(new Error("Failed to convert blob to base64"));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const bufferToWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels: Float32Array[] = [];
    let offset = 0;
    let pos = 0;

    const setUint16 = (data: number) => {
        view.setUint16(offset, data, true);
        offset += 2;
    };
    const setUint32 = (data: number) => {
        view.setUint32(offset, data, true);
        offset += 4;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1); // PCM
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++)
        channels.push(buffer.getChannelData(i));

    while (pos < buffer.length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][pos]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(offset, sample, true);
            offset += 2;
        }
        pos++;
    }

    return new Blob([bufferArr], { type: "audio/wav" });
};

const generateHistoryId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// ============================================================================
// APP COMPONENT
// ============================================================================

export default function App() {
    const { auth, settings, persistence, panel, updater, sidecar } = useAppContext();

    // --- Local recording state (usa Tauri invoke, especifico do App) ---
    const [isRecording, setIsRecording] = useState(false);
    const [isNativeRecording, setIsNativeRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [audioMetrics, setAudioMetrics] = useState<any>(null);
    const [recordingStartTime, setRecordingStartTime] = useState<number>(0);

    // Hardware
    const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
    const [selectedMicId, setSelectedMicId] = useState<string>("default");
    const [recordingStyle, setRecordingStyle] = useState<"Dictation" | "Interview">("Dictation");

    // Audio config
    const [noiseSuppression, setNoiseSuppression] = useState(true);
    const [echoCancellation, setEchoCancellation] = useState(true);
    const [autoGainControl, setAutoGainControl] = useState(true);

    // Processing
    const [isProcessing, setIsProcessing] = useState(false);
    const [transcription, setTranscription] = useState<string>(() => {
        return localStorage.getItem("gemini_current_work") || "";
    });
    const [lastStats, setLastStats] = useState<any>(null);

    // Persist transcription
    useEffect(() => {
        localStorage.setItem("gemini_current_work", transcription);
    }, [transcription]);

    // Load mics
    useEffect(() => {
        if (isTauri()) {
            invoke<{ id: string; label: string }[]>("enumerate_audio_devices")
                .then((devices) => {
                    const mics = devices.map((d) => ({
                        kind: "audioinput",
                        deviceId: d.id,
                        label: d.label,
                        groupId: "native",
                    }));
                    setAvailableMics(mics as unknown as MediaDeviceInfo[]);
                })
                .catch(console.error);
        } else {
            navigator.mediaDevices?.enumerateDevices().then((devices) => {
                setAvailableMics(devices.filter((d) => d.kind === "audioinput"));
            });
        }
    }, []);

    // Load audio from DB on mount
    useEffect(() => {
        persistence.loadAudioFromDB().then((blob) => {
            if (blob) {
                setAudioBlob(blob);
                persistence.addLog("Restored previous session audio.", "info");
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Analyze audio when blob changes
    useEffect(() => {
        if (audioBlob && !isRecording) {
            persistence.saveAudioToDB(audioBlob);
        } else if (audioBlob === null && !isRecording) {
            persistence.saveAudioToDB(null);
            setAudioMetrics(null);
        }
    }, [audioBlob, isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Recording ---
    const startRecording = async () => {
        if (isTauri()) {
            try {
                const deviceLabel = selectedMicId !== "default" ? selectedMicId : null;
                await invoke("start_audio_recording", { deviceLabel });

                setIsNativeRecording(true);
                setIsRecording(true);
                setRecordingStartTime(Date.now());
                setAudioBlob(null);
                persistence.addLog("Gravacao iniciada (nativo personalizado)", "info");

                try {
                    const vizStream = await navigator.mediaDevices.getUserMedia(
                        { audio: true, video: false },
                    );
                    setAudioStream(vizStream);
                } catch {
                    // Waveform nao aparece -- ok
                }
                return;
            } catch (e: unknown) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                console.warn("Native recording failed:", errorMsg);
                persistence.addLog(`Erro ao iniciar gravacao nativa: ${errorMsg}`, "error");

                if (
                    errorMsg.includes("NoDevice") ||
                    errorMsg.includes("no device") ||
                    errorMsg.includes("not available")
                ) {
                    return;
                }
                persistence.addLog("Tentando fallback Web API...", "info");
            }
        }

        // Fallback Web API
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                persistence.addLog("API de midia nao disponivel neste ambiente.", "error");
                return;
            }

            const constraints = {
                audio: {
                    deviceId: selectedMicId !== "default" ? { exact: selectedMicId } : undefined,
                    echoCancellation,
                    noiseSuppression,
                    autoGainControl,
                },
                video: false,
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const recorder = new MediaRecorder(stream);
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                stream.getTracks().forEach((track) => track.stop());
                setAudioStream(null);
                const blob = new Blob(chunksRef.current, { type: "audio/webm" });
                setAudioBlob(blob);
            };

            recorder.start();
            setMediaRecorder(recorder);
            setAudioStream(stream);
            setIsNativeRecording(false);
            setIsRecording(true);
            setRecordingStartTime(Date.now());
            setAudioBlob(null);
            persistence.addLog("Gravacao iniciada (Web API)", "info");
        } catch (err: unknown) {
            console.error("getUserMedia error:", err);
            const errorName = err instanceof Error ? err.name : "Unknown";
            const errorMsg = err instanceof Error ? err.message : String(err);

            if (errorName === "NotAllowedError") {
                persistence.addLog(
                    "Permissao de microfone negada. No Linux, use o botao de upload de arquivo como alternativa.",
                    "error",
                );
            } else if (errorName === "NotFoundError") {
                persistence.addLog("Nenhum microfone encontrado no sistema.", "error");
            } else {
                persistence.addLog(`Erro ao acessar microfone: ${errorMsg}`, "error");
            }
        }
    };

    const stopRecording = async () => {
        if (isNativeRecording) {
            try {
                const { readFile } = await import("@tauri-apps/plugin-fs");
                const filePath = await invoke<string>("stop_audio_recording");
                persistence.addLog(`Audio salvo em: ${filePath}`, "info");

                const audioData = await readFile(filePath);
                const blob = new Blob([audioData], { type: "audio/wav" });

                if (audioStream) {
                    audioStream.getTracks().forEach((track) => track.stop());
                    setAudioStream(null);
                }

                setAudioBlob(blob);
                setIsRecording(false);
                setIsNativeRecording(false);
                persistence.addLog("Gravacao capturada.", "success");
                return;
            } catch (e) {
                console.error("Native stop failed:", e);
                persistence.addLog("Erro ao parar gravacao nativa.", "error");
                setIsRecording(false);
                setIsNativeRecording(false);
                return;
            }
        }

        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
            setIsRecording(false);
            persistence.addLog("Recording captured.", "success");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                setUploadError("Max 10MB");
                return;
            }
            setUploadError(null);
            setAudioBlob(file);
            persistence.addLog(`Loaded: ${file.name}`, "success");
        }
    };

    // --- File Export ---
    const handleDownloadText = async (format: "txt" | "md") => {
        if (isTauri()) {
            try {
                const { save } = await import("@tauri-apps/plugin-dialog");
                const { writeTextFile } = await import("@tauri-apps/plugin-fs");

                let filename = `transcription-${Date.now()}`;
                if (transcription) {
                    const lines = transcription.split("\n");
                    if (lines.length > 0) {
                        const safeName = lines[0].trim()
                            .replace(/[^a-zA-Z0-9 \-_().\u00C0-\u00FF]/g, "")
                            .trim();
                        if (safeName.length > 0 && safeName.length < 255) {
                            filename = safeName;
                        }
                    }
                }

                const filePath = await save({
                    defaultPath: `${filename}.${format}`,
                    filters: [{ name: format.toUpperCase(), extensions: [format] }],
                });

                if (filePath) {
                    await writeTextFile(filePath, transcription);
                    persistence.addLog(`Arquivo exportado: ${filePath}`, "success");
                }
                return;
            } catch (e) {
                console.error("Tauri export failed:", e);
            }
        }

        // Fallback browser
        const element = document.createElement("a");
        const file = new Blob([transcription], { type: "text/plain" });
        element.href = URL.createObjectURL(file);

        let filename = `transcription-${Date.now()}`;
        if (transcription) {
            const lines = transcription.split("\n");
            if (lines.length > 0) {
                const safeName = lines[0].trim()
                    .replace(/[^a-zA-Z0-9 \-_().\u00C0-\u00FF]/g, "")
                    .trim();
                if (safeName.length > 0 && safeName.length < 255) {
                    filename = safeName;
                }
            }
        }

        element.download = `${filename}.${format}`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        persistence.addLog(`Arquivo exportado como .${format}`, "success");
    };

    // --- Audio Processing ---
    const processAudio = async () => {
        if (!audioBlob) return;

        const useLocalSTT =
            (settings.transcriptionMode === "local" ||
                (settings.transcriptionMode === "auto" && sidecar.sidecarAvailable)) &&
            sidecar.sidecarAvailable;

        if (settings.transcriptionMode === "local" && !sidecar.sidecarAvailable) {
            persistence.addLog(
                "Modo local selecionado mas sidecar offline. Usando Gemini (cloud) como fallback.",
                "error",
            );
        }

        const currentApiKey = persistence.apiKey || (typeof process !== "undefined" ? (process as any).env?.API_KEY : undefined);
        if (!useLocalSTT && !currentApiKey) {
            persistence.addLog(
                "API Key nao configurada. Va em Settings para adicionar.",
                "error",
            );
            return;
        }

        setIsProcessing(true);
        const startTime = performance.now();

        try {
            // --- Style prompt builder ---
            const buildStylePrompt = (rawText: string): string => {
                const currentMemory =
                    persistence.contextMemory[persistence.activeContext] || "No previous context.";

                const isPromptEngineeringMode = [
                    "Prompt (Claude)",
                    "Prompt (Gemini)",
                    "Code Generator",
                    "Tech Docs",
                    "Bullet Points",
                ].includes(settings.outputStyle);

                const isVerbatimMode =
                    settings.outputStyle === "Verbatim" ||
                    settings.outputStyle === "Whisper Only";
                const isPortuguese = settings.outputLanguage === "Portuguese";

                let systemPrompt = "";

                if (isPromptEngineeringMode) {
                    let formatInstruction = "";
                    if (settings.outputStyle === "Prompt (Claude)") {
                        formatInstruction = `CRITICAL OUTPUT FORMATTING:
- You MUST wrap the final prompt in XML tags: <prompt_configuration> ... </prompt_configuration>
- Use tags like <role>, <context>, <task>, <constraints>, <output_format> to structure the prompt.
- Do NOT use Markdown headers (##). Use XML delimiters.`;
                    } else if (settings.outputStyle === "Prompt (Gemini)") {
                        formatInstruction = `## Prompt Engineering Directives:
* **Minimize Interpretation:** Reduce subjective interpretation of the input.
* **Idea Refinement:** Prioritize clarification of the core idea.
* **Output Format Conjecturing:** Actively anticipate the optimal format.
* **Order Preservation:** Maintain original sequence.
* **No Merging:** Do not combine distinct requests.
* **Independent Delineation:** Distinct requests must be separated.
FORMAT: Use clear Markdown headers (## Role, ## Task, ## Constraints). Bullet points for clarity.`;
                    } else if (settings.outputStyle === "Code Generator") {
                        formatInstruction = `OUTPUT ONLY VALID CODE inside Markdown code blocks. No conversational filler.`;
                    } else {
                        formatInstruction = `Format as a structured technical document.`;
                    }

                    systemPrompt = `ROLE: You are a Senior Prompt Engineer and Technical Architect.
TASK: Reverse-engineer the user's transcribed text into a professional, high-fidelity LLM Prompt or Technical Document.
TONE & STYLE: Imperative, Direct, Incisive. No "Please" or "Would you kindly". Unambiguous instructions.
CONTEXT MEMORY: "${currentMemory.slice(-2000)}"
TARGET LANGUAGE: ${settings.outputLanguage}
${formatInstruction}
EXECUTION: Transform the transcribed text into the requested format immediately.`;
                } else if (isVerbatimMode) {
                    systemPrompt = `ROLE: You are a professional text cleanup engine.
TASK: Clean up the transcribed text with minimal changes.
RULES: 1. Preserve original meaning and structure. 2. Add standard punctuation. 3. Remove excessive filler words. 4. No meta-commentary.
TARGET LANGUAGE: ${settings.outputLanguage}
CONTEXT MEMORY: "${currentMemory.slice(-2000)}"`;
                } else {
                    let styleInstruction = "";
                    if (isPortuguese) {
                        const instructions: Record<string, string> = {
                            "Elegant Prose": `REGRAS: 1. Tom: Claro, sofisticado e preciso. 2. Formato: Prosa continua. 3. Voz: Refinada. 4. Objetivo: Texto bem escrito.`,
                            "Ana Suy": `REGRAS: 1. Tom: Intimo e psicanalitico. 2. Voz: Poetica e acessivel. 3. Foco: Experiencia subjetiva. 4. Estrutura: Fluida.`,
                            "Poetic / Verses": `REGRAS: 1. Estrutura: Quebras de linha e estrofes. 2. Tom: Lirico e evocativo. 3. Objetivo: Verso livre.`,
                            Normal: `Texto padrao, gramaticalmente correto e fluido.`,
                            Verbose: `Seja detalhista e expansivo. Explore cada ponto a fundo.`,
                            Concise: `Seja direto e economico. Remova qualquer redundancia.`,
                            Formal: `Use linguagem culta, profissional e impessoal.`,
                            Summary: `Forneca um resumo executivo de alto nivel em 1-2 paragrafos.`,
                            Email: `Formate como um e-mail profissional.`,
                            "Tweet Thread": `Formate como uma thread viral do Twitter/X.`,
                            Custom: `Siga estas instrucoes: "${settings.customStylePrompt}".`,
                        };
                        styleInstruction = instructions[settings.outputStyle] || `Adapte para o estilo ${settings.outputStyle}.`;
                    } else {
                        if (settings.outputStyle === "Elegant Prose") {
                            styleInstruction = `Tone: Clear, sophisticated, precise. Format: Continuous prose. Voice: Refined but accessible.`;
                        } else if (settings.outputStyle === "Ana Suy") {
                            styleInstruction = `Tone: Intimate, psychoanalytic. Voice: Poetic but accessible. Focus on subjective experience.`;
                        } else if (settings.outputStyle === "Poetic / Verses") {
                            styleInstruction = `Structure using line breaks and stanzas. Tone: Artistic, lyrical.`;
                        } else if (settings.outputStyle === "Custom") {
                            styleInstruction = `Follow these specific user instructions: "${settings.customStylePrompt}".`;
                        } else {
                            styleInstruction = `Adapt the output to be ${settings.outputStyle} in tone and length.`;
                        }
                    }

                    systemPrompt = `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: ${recordingStyle.toUpperCase()}
Context Memory: "${currentMemory.slice(-2000)}"
Target Language: ${settings.outputLanguage}
Style: ${styleInstruction}
Output: Return ONLY the refined text. No preambles.`;
                }

                systemPrompt += `
MANDATORY OUTPUT STRUCTURE:
Line 1: Suggested filename (concise, valid chars, no extension).
Line 2: [Empty]
Line 3+: The actual content.`;

                return systemPrompt;
            };

            // --- Gemini text-only refinement ---
            const refineWithGemini = async (rawText: string, key: string): Promise<string> => {
                const ai = new GoogleGenAI({ apiKey: key });
                const systemPrompt = buildStylePrompt(rawText);

                const isPromptEngineeringMode = [
                    "Prompt (Claude)", "Prompt (Gemini)", "Code Generator", "Tech Docs", "Bullet Points",
                ].includes(settings.outputStyle);
                const isVerbatimMode = settings.outputStyle === "Verbatim" || settings.outputStyle === "Whisper Only";

                const response = await ai.models.generateContent({
                    model: settings.aiModel,
                    config: {
                        temperature: isPromptEngineeringMode ? 0.2 : isVerbatimMode ? 0.1 : 0.4,
                    },
                    contents: {
                        parts: [
                            { text: `Texto transcrito para refinar:\n\n${rawText}` },
                            { text: systemPrompt },
                        ],
                    },
                });

                return response.text?.trim() || rawText;
            };

            // --- Finalize processing ---
            const finalizeProcessing = (finalText: string, audioDuration: number, inputSize: number) => {
                const currentMemory = persistence.contextMemory[persistence.activeContext] || "No previous context.";
                const cleanedText = finalText.trim();
                setTranscription(cleanedText);

                const updatedMemory = (currentMemory + "\n" + cleanedText).slice(-5000);
                persistence.updateContextMemory(persistence.activeContext, updatedMemory);

                persistence.saveContextToDB({
                    name: persistence.activeContext,
                    memory: updatedMemory,
                    lastUpdated: Date.now(),
                }).catch((e) => console.error("Auto-save failed", e));

                const endTime = performance.now();
                const wordCount = cleanedText.split(/\s+/).filter((w) => w.length > 0).length;
                const charCount = cleanedText.length;
                const readingTimeVal = Math.ceil(wordCount / 200);

                setLastStats({
                    processingTime: endTime - startTime,
                    audioDuration,
                    inputSize,
                    wordCount,
                    charCount,
                    readingTime: `${readingTimeVal} min read`,
                    appliedStyle: settings.outputStyle,
                });

                persistence.addToHistory(
                    cleanedText,
                    new Date().toISOString(),
                    generateHistoryId(),
                );
            };

            // --- LOCAL STT ---
            if (useLocalSTT && sidecar.voiceAIClient) {
                persistence.addLog("Transcrevendo localmente com Whisper...", "info");

                const base64Audio = await VoiceAIClient.blobToBase64(audioBlob);
                const format = VoiceAIClient.getFormatFromMimeType(audioBlob.type);

                try {
                    const result = await sidecar.voiceAIClient.transcribe({
                        audio: base64Audio,
                        format,
                        language:
                            settings.outputLanguage === "Portuguese" ? "pt" :
                            settings.outputLanguage === "Spanish" ? "es" : "en",
                        refine: false,
                        style: "verbatim",
                    });

                    let finalText = result.text;

                    if (settings.outputStyle !== "Whisper Only" && currentApiKey) {
                        persistence.addLog("Refinando com Gemini (text-only)...", "info");
                        try {
                            finalText = await refineWithGemini(finalText, currentApiKey);
                        } catch (geminiError: any) {
                            persistence.addLog(
                                `Gemini refinamento falhou: ${geminiError.message}. Usando texto bruto.`,
                                "error",
                            );
                        }
                    }

                    if (finalText.trim() && !finalText.includes("\n\n")) {
                        const firstWords = finalText
                            .split(/\s+/).slice(0, 5).join("-").toLowerCase()
                            .replace(/[^a-z0-9-]/g, "");
                        if (firstWords) {
                            finalText = `${firstWords}\n\n${finalText}`;
                        }
                    }

                    finalizeProcessing(finalText, result.duration, audioBlob.size);

                    const mode = settings.outputStyle !== "Whisper Only" && currentApiKey
                        ? "Whisper + Gemini (text-only)" : "Whisper";
                    persistence.addLog(`Transcricao completa via ${mode}`, "success");
                    setIsProcessing(false);
                    return;
                } catch (sidecarError: any) {
                    persistence.addLog(`Sidecar falhou: ${sidecarError.message}`, "error");
                    persistence.addLog(
                        "Whisper indisponivel. Conecte o Tailscale ou verifique o sidecar.",
                        "error",
                    );
                    setIsProcessing(false);
                    return;
                }
            }

            // --- SEM WHISPER ---
            persistence.addLog(
                "Whisper indisponivel (Tailscale desconectado ou sidecar offline).",
                "error",
            );
            persistence.addLog("Conecte o Tailscale para transcrever audio.", "info");
            setIsProcessing(false);
        } catch (err: any) {
            console.error(err);
            persistence.addLog(`Error: ${err.message}`, "error");
        } finally {
            setIsProcessing(false);
        }
    };

    // --- TTS ---
    const ttsRef = useRef<HTMLAudioElement | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);

    // TTS Settings
    const [ttsEngine, setTtsEngine] = useState<"piper" | "chatterbox">("chatterbox");
    const [ttsProfile, setTtsProfile] = useState<string>("standard");
    const [voiceRefAudio, setVoiceRefAudio] = useState<string | null>(null);
    const [ttsCustomParams, setTtsCustomParams] = useState({
        exaggeration: 0.5,
        speed: 1.0,
        stability: 0.5,
        steps: 10,
        sentence_silence: 0.2,
    });

    // Load/persist TTS settings
    useEffect(() => {
        const saved = localStorage.getItem("tts_settings");
        if (saved) {
            try {
                const s = JSON.parse(saved);
                if (s.engine) setTtsEngine(s.engine);
                if (s.profile) setTtsProfile(s.profile);
                if (s.customParams) setTtsCustomParams(s.customParams);
                if (s.voiceRef) setVoiceRefAudio(s.voiceRef);
            } catch (e) {
                console.warn("Failed to load TTS settings:", e);
            }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("tts_settings", JSON.stringify({
            engine: ttsEngine,
            profile: ttsProfile,
            customParams: ttsCustomParams,
            voiceRef: voiceRefAudio,
        }));
    }, [ttsEngine, ttsProfile, ttsCustomParams, voiceRefAudio]);

    const handleReadText = async () => {
        if (!transcription.trim()) {
            persistence.addLog("Nenhum texto para ler", "error");
            return;
        }

        if (ttsRef.current) {
            ttsRef.current.pause();
            ttsRef.current = null;
        }
        if (ttsAudioUrl) {
            URL.revokeObjectURL(ttsAudioUrl);
            setTtsAudioUrl(null);
        }

        setIsSpeaking(true);
        persistence.addLog("Sintetizando audio...", "info");

        try {
            const requestBody: Record<string, unknown> = {
                text: transcription,
                voice: ttsEngine === "chatterbox" ? "cloned" : "pt-br-faber-medium",
                preprocess: true,
            };

            if (ttsEngine === "chatterbox") {
                if (ttsProfile === "custom") {
                    requestBody.params = ttsCustomParams;
                } else {
                    requestBody.profile = ttsProfile;
                }
                if (voiceRefAudio) {
                    requestBody.voice_ref = voiceRefAudio;
                }
            }

            const response = await fetch(`${sidecar.whisperServerUrl}/synthesize`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: "Erro desconhecido" }));
                throw new Error(error.detail || `HTTP ${response.status}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setTtsAudioUrl(url);

            const audio = new Audio(url);
            ttsRef.current = audio;

            audio.onended = () => {
                setIsSpeaking(false);
                persistence.addLog("Leitura concluida", "success");
            };

            audio.onerror = () => {
                setIsSpeaking(false);
                persistence.addLog("Erro ao reproduzir audio", "error");
            };

            await audio.play();
            persistence.addLog("Reproduzindo...", "success");
        } catch (err: any) {
            console.error("TTS Error:", err);
            persistence.addLog(`Erro TTS: ${err.message}`, "error");
            setIsSpeaking(false);
        }
    };

    const stopReadText = () => {
        if (ttsRef.current) {
            ttsRef.current.pause();
            ttsRef.current.currentTime = 0;
            ttsRef.current = null;
        }
        setIsSpeaking(false);
        persistence.addLog("Leitura interrompida", "info");
    };

    // --- LOGIN SCREEN ---
    if (!auth.isAuthenticated) {
        return (
            <div
                className="flex items-center justify-center w-full h-screen"
                style={{
                    backgroundColor: settings.bgColor,
                    color: settings.textColor,
                    fontFamily: settings.fontFamily,
                }}
            >
                <div className="w-full max-w-sm p-8 bg-white/5 border border-white/10 rounded-lg">
                    <div className="text-center mb-8">
                        <div
                            className="w-16 h-16 mx-auto mb-4 rounded-xl flex items-center justify-center shadow-lg"
                            style={{
                                background: `linear-gradient(135deg, ${settings.themeColor}, ${settings.themeColor}aa)`,
                            }}
                        >
                            <Zap className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-xl font-bold">Pro ATT Machine</h1>
                        <p className="text-xs opacity-50 mt-1">v{settings.appVersion}</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] opacity-60 mb-1 block">Usuario</label>
                            <input
                                type="text"
                                value={auth.loginUsername}
                                onChange={(e) => auth.setLoginUsername(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && auth.handleLogin()}
                                placeholder="MCBS ou PGR"
                                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-sm focus:outline-none focus:border-white/30"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-[10px] opacity-60 mb-1 block">Senha</label>
                            <input
                                type="password"
                                value={auth.loginPassword}
                                onChange={(e) => auth.setLoginPassword(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && auth.handleLogin()}
                                placeholder="********"
                                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-sm focus:outline-none focus:border-white/30"
                            />
                        </div>

                        {auth.loginError && (
                            <p className="text-xs text-red-400 text-center">{auth.loginError}</p>
                        )}

                        <button
                            onClick={auth.handleLogin}
                            className="w-full py-2.5 rounded font-medium text-sm transition-colors"
                            style={{ backgroundColor: settings.themeColor, color: "white" }}
                        >
                            Entrar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- MAIN APP ---
    return (
        <div
            className="flex w-full overflow-hidden select-none flex-col relative transition-colors duration-300"
            style={{
                backgroundColor: settings.bgColor,
                color: settings.textColor,
                fontFamily: settings.fontFamily,
                height: "100%",
                ["--bg-base" as string]: settings.bgColor,
                ["--bg-elevated" as string]: "rgba(0,0,0,0.2)",
                ["--bg-overlay" as string]: "rgba(255,255,255,0.05)",
                ["--text-primary" as string]: settings.textColor,
                ["--text-secondary" as string]: "rgba(255,255,255,0.5)",
                ["--border-subtle" as string]: "rgba(255,255,255,0.1)",
                ["--accent" as string]: settings.themeColor,
                ["--accent-dim" as string]: `${settings.themeColor}20`,
                ["--radius-sm" as string]: "4px",
                ["--radius-md" as string]: "8px",
                ["--sat" as string]: "env(safe-area-inset-top, 0px)",
                ["--sal" as string]: "env(safe-area-inset-left, 0px)",
                ["--sar" as string]: "env(safe-area-inset-right, 0px)",
                ["--sab" as string]: "env(safe-area-inset-bottom, 0px)",
            } as React.CSSProperties}
        >
            {/* Update download bar */}
            {updater.updateStatus === "downloading" && (
                <div
                    style={{
                        position: "fixed",
                        top: 0, left: 0, right: 0,
                        zIndex: 9999,
                        backgroundColor: "rgba(0,0,0,0.85)",
                        padding: "8px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        fontSize: "13px",
                        color: "#fff",
                    }}
                >
                    <span>Baixando v{updater.updateVersion}...</span>
                    <div style={{ flex: 1, height: "4px", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${updater.updateProgress}%`, backgroundColor: settings.themeColor, borderRadius: "2px", transition: "width 0.3s ease" }} />
                    </div>
                    <span>{Math.round(updater.updateProgress)}%</span>
                </div>
            )}

            <AppLayout
                activePanel={panel.activePanel}
                onPanelChange={panel.setActivePanel}
                isProcessing={isProcessing}
                editor={
                    <Editor
                        value={transcription}
                        onChange={setTranscription}
                        isProcessing={isProcessing}
                        isSpeaking={isSpeaking}
                        fontSize={settings.fontSize}
                        onFontSizeChange={settings.setFontSize}
                        onClear={() => {
                            setTranscription("");
                            persistence.saveAudioToDB(null);
                            setAudioBlob(null);
                        }}
                        onCopy={() => {
                            navigator.clipboard.writeText(transcription);
                            persistence.addLog("Copied", "success");
                        }}
                        onExportTxt={() => handleDownloadText("txt")}
                        onExportMd={() => handleDownloadText("md")}
                        onReadText={handleReadText}
                        onStopReading={stopReadText}
                        canRead={!!transcription}
                        outputStyle={settings.outputStyle}
                        activeContext={persistence.activeContext}
                        aiModel={settings.aiModel}
                    />
                }
                panelATT={
                    <PanelATT
                        isRecording={isRecording}
                        onStartRecording={startRecording}
                        onStopRecording={stopRecording}
                        audioBlob={audioBlob}
                        onFileUpload={handleFileUpload}
                        uploadError={uploadError}
                        recordingStyle={recordingStyle}
                        onRecordingStyleChange={setRecordingStyle}
                        contextPools={persistence.contextPools}
                        activeContext={persistence.activeContext}
                        onContextChange={persistence.setActiveContext}
                        onAddContext={persistence.handleAddContext}
                        onOpenMemory={persistence.openMemoryEditor}
                        outputLanguage={settings.outputLanguage}
                        onLanguageChange={settings.setOutputLanguage as (lang: string) => void}
                        outputStyle={settings.outputStyle}
                        onStyleChange={settings.setOutputStyle as (style: string) => void}
                        customStylePrompt={settings.customStylePrompt}
                        onCustomStyleChange={settings.setCustomStylePrompt}
                        isProcessing={isProcessing}
                        onProcess={processAudio}
                        audioVisualizer={<AudioVisualizer stream={audioStream} />}
                        selectedMicLabel={
                            selectedMicId === "default"
                                ? "Default Mic"
                                : availableMics.find((m) => m.deviceId === selectedMicId)?.label?.slice(0, 15)
                        }
                        autoGainControl={autoGainControl}
                    />
                }
                panelTTS={
                    <PanelTTS
                        isSpeaking={isSpeaking}
                        canSpeak={sidecar.sidecarAvailable}
                        hasText={!!transcription}
                        onReadText={handleReadText}
                        onStopReading={stopReadText}
                        ttsEngine={ttsEngine}
                        onEngineChange={setTtsEngine}
                        ttsProfile={ttsProfile}
                        onProfileChange={setTtsProfile}
                        ttsCustomParams={ttsCustomParams}
                        onCustomParamsChange={setTtsCustomParams}
                        voiceRefAudio={voiceRefAudio}
                        onVoiceRefChange={setVoiceRefAudio}
                    />
                }
                panelConfig={
                    <PanelConfig
                        currentUser={auth.currentUser}
                        onLogout={auth.handleLogout}
                        apiKey={persistence.apiKey}
                        apiKeyInput={persistence.apiKeyInput}
                        onApiKeyInputChange={persistence.setApiKeyInput}
                        onSaveApiKey={async () => {
                            await persistence.saveApiKey(persistence.apiKeyInput.trim());
                            persistence.addLog("API Key saved", "success");
                        }}
                        isApiKeyVisible={persistence.isApiKeyVisible}
                        onToggleApiKeyVisibility={() =>
                            persistence.setIsApiKeyVisible(!persistence.isApiKeyVisible)
                        }
                        availableMics={availableMics}
                        selectedMicId={selectedMicId}
                        onMicChange={setSelectedMicId}
                        noiseSuppression={noiseSuppression}
                        onNoiseSuppressionChange={setNoiseSuppression}
                        echoCancellation={echoCancellation}
                        onEchoCancellationChange={setEchoCancellation}
                        autoGainControl={autoGainControl}
                        onAutoGainControlChange={setAutoGainControl}
                        aiModel={settings.aiModel}
                        onAiModelChange={settings.setAiModel}
                        transcriptionMode={settings.transcriptionMode}
                        onTranscriptionModeChange={settings.setTranscriptionMode}
                        sidecarAvailable={sidecar.sidecarAvailable}
                        sidecarStatus={sidecar.sidecarStatus}
                        whisperServerUrl={sidecar.whisperServerUrl}
                        onWhisperServerUrlChange={sidecar.setWhisperServerUrl}
                        onTestWhisperServer={sidecar.testWhisperServer}
                        whisperTestStatus={sidecar.whisperTestStatus}
                        whisperTestMessage={sidecar.whisperTestMessage}
                    />
                }
                panelStats={
                    <PanelStats
                        logs={persistence.logs}
                        sidecarAvailable={sidecar.sidecarAvailable}
                        sidecarStatus={sidecar.sidecarStatus}
                        whisperServerUrl={sidecar.whisperServerUrl}
                        transcriptionMode={settings.transcriptionMode}
                        ttsEngine={ttsEngine}
                        ttsProfile={ttsProfile}
                        isSpeaking={isSpeaking}
                        aiModel={settings.aiModel}
                        hasApiKey={!!persistence.apiKey}
                        audioMetrics={audioMetrics}
                        isRecording={isRecording}
                        isProcessing={isProcessing}
                        selectedMicLabel={
                            selectedMicId === "default"
                                ? "Default Mic"
                                : availableMics.find((m) => m.deviceId === selectedMicId)?.label?.slice(0, 20) || "Unknown"
                        }
                        appVersion={settings.appVersion}
                    />
                }
            />

            {/* MEMORY EDITOR MODAL */}
            {persistence.isMemoryModalOpen && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <h2 className="text-sm font-bold flex items-center gap-2">
                                <Brain className="w-4 h-4" style={{ color: settings.themeColor }} />
                                Memory: {persistence.activeContext}
                            </h2>
                            <button
                                onClick={() => persistence.setIsMemoryModalOpen(false)}
                                className="opacity-50 hover:opacity-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 flex-1 overflow-hidden flex flex-col gap-2">
                            <p className="text-[11px] opacity-50">
                                This text is stored in an encrypted browser database. It is injected into every prompt for this context pool.
                            </p>
                            <textarea
                                value={persistence.tempMemoryEdit}
                                onChange={(e) => persistence.setTempMemoryEdit(e.target.value)}
                                className="flex-1 w-full bg-black/20 border border-white/10 rounded-md p-3 text-xs font-mono focus:outline-none resize-none leading-relaxed"
                                placeholder="No memories yet. Start transcribing or add custom terms here..."
                            />
                        </div>
                        <div className="p-4 border-t border-white/10 flex justify-end gap-3">
                            <button
                                onClick={() => persistence.setTempMemoryEdit("")}
                                className="px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
                            >
                                Clear Memory
                            </button>
                            <button
                                onClick={persistence.saveMemory}
                                disabled={persistence.isSavingContext}
                                className="px-4 py-2 text-white text-xs font-medium rounded-sm transition-colors shadow-lg flex items-center gap-2"
                                style={{ backgroundColor: settings.themeColor }}
                            >
                                {persistence.isSavingContext ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Save className="w-3 h-3" />
                                )}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
