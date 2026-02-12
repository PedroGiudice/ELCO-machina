/**
 * App.tsx - Componente principal (refatorado)
 *
 * Toda a logica de negocio esta em hooks:
 * - useAudioRecording: captura de audio
 * - useAudioProcessing: transcricao + refinamento via sidecar
 * - useTTS: sintese de voz
 * - usePromptStore: templates de prompts
 *
 * Este componente conecta hooks aos componentes via props.
 * O frontend NAO chama Gemini diretamente - tudo via sidecar.
 */

import React, { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
    Loader2,
    X,
    Brain,
    Zap,
    Save,
} from "lucide-react";

// Context
import { useAppContext } from "./src/context/GlobalAppContext";

// Hooks
import { useAudioProcessing } from "./src/hooks/useAudioProcessing";
import { useTTS } from "./src/hooks/useTTS";
import { usePromptStore } from "./src/hooks/usePromptStore";

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

// ============================================================================
// APP COMPONENT
// ============================================================================

export default function App() {
    const { auth, settings, persistence, panel, updater, sidecar } = useAppContext();

    // --- PromptStore ---
    const promptStore = usePromptStore();
    const selectedTemplate = promptStore.getByName(settings.outputStyle);

    // --- Recording state (usa Tauri invoke para gravacao nativa) ---
    const [isRecording, setIsRecording] = useState(false);
    const [isNativeRecording, setIsNativeRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
    const chunksRef = React.useRef<Blob[]>([]);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
    const [recordingStyle, setRecordingStyle] = useState<"Dictation" | "Interview">("Dictation");

    // Hardware
    const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
    const [selectedMicId, setSelectedMicId] = useState<string>("default");

    // Audio config
    const [noiseSuppression, setNoiseSuppression] = useState(true);
    const [echoCancellation, setEchoCancellation] = useState(true);
    const [autoGainControl, setAutoGainControl] = useState(true);

    // --- Audio Processing (via sidecar - sem Gemini direto) ---
    const processing = useAudioProcessing({
        audioBlob,
        sidecarAvailable: sidecar.sidecarAvailable,
        voiceAIClient: sidecar.voiceAIClient,
        outputLanguage: settings.outputLanguage,
        aiModel: settings.aiModel,
        recordingStyle,
        customStylePrompt: settings.customStylePrompt,
        activeContext: persistence.activeContext,
        contextMemory: persistence.contextMemory,
        selectedTemplate,
        addLog: persistence.addLog,
        addToHistory: persistence.addToHistory,
        updateContextMemory: persistence.updateContextMemory,
        saveContextToDB: persistence.saveContextToDB,
    });

    // --- TTS ---
    const tts = useTTS(sidecar.whisperServerUrl, persistence.addLog);

    // --- Load mics ---
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

    // Persist audio state
    useEffect(() => {
        if (audioBlob && !isRecording) {
            persistence.saveAudioToDB(audioBlob);
        } else if (audioBlob === null && !isRecording) {
            persistence.saveAudioToDB(null);
        }
    }, [audioBlob, isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Recording ---
    const startRecording = useCallback(async () => {
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
    }, [selectedMicId, echoCancellation, noiseSuppression, autoGainControl, persistence]);

    const stopRecording = useCallback(async () => {
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
    }, [isNativeRecording, mediaRecorder, audioStream, persistence]);

    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
    }, [persistence]);

    // --- File Export ---
    const handleDownloadText = useCallback(async (format: "txt" | "md") => {
        if (isTauri()) {
            try {
                const { save } = await import("@tauri-apps/plugin-dialog");
                const { writeTextFile } = await import("@tauri-apps/plugin-fs");

                let filename = `transcription-${Date.now()}`;
                if (processing.transcription) {
                    const lines = processing.transcription.split("\n");
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
                    await writeTextFile(filePath, processing.transcription);
                    persistence.addLog(`Arquivo exportado: ${filePath}`, "success");
                }
                return;
            } catch (e) {
                console.error("Tauri export failed:", e);
            }
        }

        // Fallback browser
        const element = document.createElement("a");
        const file = new Blob([processing.transcription], { type: "text/plain" });
        element.href = URL.createObjectURL(file);

        let filename = `transcription-${Date.now()}`;
        if (processing.transcription) {
            const lines = processing.transcription.split("\n");
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
    }, [processing.transcription, persistence]);

    // --- TTS Handlers ---
    const handleReadText = useCallback(() => {
        tts.readText(processing.transcription);
    }, [tts, processing.transcription]);

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
                isProcessing={processing.isProcessing}
                editor={
                    <Editor
                        value={processing.transcription}
                        onChange={processing.setTranscription}
                        isProcessing={processing.isProcessing}
                        isSpeaking={tts.isSpeaking}
                        fontSize={settings.fontSize}
                        onFontSizeChange={settings.setFontSize}
                        onClear={() => {
                            processing.setTranscription("");
                            persistence.saveAudioToDB(null);
                            setAudioBlob(null);
                        }}
                        onCopy={() => {
                            navigator.clipboard.writeText(processing.transcription);
                            persistence.addLog("Copied", "success");
                        }}
                        onExportTxt={() => handleDownloadText("txt")}
                        onExportMd={() => handleDownloadText("md")}
                        onReadText={handleReadText}
                        onStopReading={tts.stopReading}
                        canRead={!!processing.transcription}
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
                        isProcessing={processing.isProcessing}
                        onProcess={processing.processAudio}
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
                        isSpeaking={tts.isSpeaking}
                        canSpeak={sidecar.sidecarAvailable}
                        hasText={!!processing.transcription}
                        onReadText={handleReadText}
                        onStopReading={tts.stopReading}
                        ttsEngine={tts.ttsEngine}
                        onEngineChange={tts.setTtsEngine}
                        ttsProfile={tts.ttsProfile}
                        onProfileChange={tts.setTtsProfile}
                        ttsCustomParams={tts.ttsCustomParams}
                        onCustomParamsChange={tts.setTtsCustomParams}
                        voiceRefAudio={tts.voiceRefAudio}
                        onVoiceRefChange={tts.setVoiceRefAudio}
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
                        ttsEngine={tts.ttsEngine}
                        ttsProfile={tts.ttsProfile}
                        isSpeaking={tts.isSpeaking}
                        aiModel={settings.aiModel}
                        hasApiKey={!!persistence.apiKey}
                        audioMetrics={null}
                        isRecording={isRecording}
                        isProcessing={processing.isProcessing}
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
