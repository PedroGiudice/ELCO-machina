import React, { useEffect, useState } from 'react';
import { useGlobal } from '../context/GlobalContext';
import { getVoiceAIClient, VoiceAIClient, type OutputStyle } from '@/services/VoiceAIClient';
import { IconWorkspace, IconAudio, IconStats, IconHistory, IconSettings, IconUpload, IconMagic } from './icons';
import { Mic, FolderOpen, Plus, Users, Play, Square, Activity, FileAudio, Trash2, Check, Copy, Pause, Settings2, Server, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { Spinner } from './ui/Spinner';
import { AudioVisualizer } from './AudioVisualizer';
import { FileUploader } from './FileUploader';

// --- Components ---

const PanelSection = ({ title, icon: Icon, children, className, action }: any) => (
  <div className={cn("space-y-3", className)}>
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2 text-zinc-400 group">
        <div className="p-1 rounded-md bg-white/5 group-hover:bg-white/10 transition-colors">
            <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 group-hover:text-zinc-300 transition-colors">{title}</span>
      </div>
      {action}
    </div>
    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-1 overflow-hidden backdrop-blur-sm transition-colors hover:border-white/10">
        {children}
    </div>
  </div>
);

const ContextScope = () => (
  <PanelSection title="Context Scope" icon={FolderOpen} action={<button className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">Manage Memory</button>}>
    <div className="p-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none mask-linear-fade">
        {['General', 'Coding', 'Meeting', 'Medical'].map((pill, i) => (
            <button
            key={pill}
            className={cn(
                "shrink-0 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all shadow-sm",
                i === 0
                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
                : "bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:border-white/10 hover:text-zinc-200"
            )}
            >
            {pill}
            </button>
        ))}
        <button className="shrink-0 w-8 h-8 flex items-center justify-center bg-white/5 border border-white/5 rounded-lg hover:bg-white/10 hover:border-white/10 text-zinc-400 transition-all">
            <Plus className="w-4 h-4" />
        </button>
        </div>
    </div>
  </PanelSection>
);

const AudioInput = ({ micStream }: { micStream: MediaStream | null }) => {
  const { isRecording, toggleRecording } = useGlobal();
  const [style, setStyle] = useState<'dictation' | 'interview'>('dictation');

  return (
    <PanelSection title="Audio Input" icon={Mic}>
        <div className="flex flex-col gap-1">
            {/* Visualizer Screen */}
            <div className="relative bg-black/40 h-24 rounded-lg overflow-hidden border border-white/5 m-1">
                <AudioVisualizer
                    stream={micStream}
                    className="h-full w-full opacity-80"
                    barColor={isRecording ? '#ef4444' : '#6366f1'}
                    barWidth={3}
                    gap={2}
                />

                {/* Status Overlay */}
                <div className="absolute top-2 right-2 flex items-center gap-2">
                    {isRecording && (
                        <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full backdrop-blur-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[9px] font-bold text-red-500">REC</span>
                        </div>
                    )}
                </div>

                <div className="absolute bottom-2 left-2 flex gap-2">
                    <span className="text-[9px] font-mono text-zinc-500 bg-black/50 px-1.5 rounded-xs">
                        {isRecording ? "00:12:43" : "READY"}
                    </span>
                </div>
            </div>

            {/* Controls */}
            <div className="p-2 grid grid-cols-2 gap-2">
                <div className="flex bg-zinc-950/50 p-0.5 rounded-lg border border-white/5">
                    <button
                        onClick={() => setStyle('dictation')}
                        className={cn(
                        "flex-1 flex items-center justify-center rounded-md text-[10px] font-medium transition-all",
                        style === 'dictation' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        Dictation
                    </button>
                    <button
                        onClick={() => setStyle('interview')}
                        className={cn(
                        "flex-1 flex items-center justify-center rounded-md text-[10px] font-medium transition-all",
                        style === 'interview' ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        Interview
                    </button>
                </div>

                <button
                onClick={toggleRecording}
                className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border text-xs font-bold transition-all shadow-lg active:scale-95",
                    isRecording
                    ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 shadow-red-900/10"
                    : "bg-white/10 border-white/10 text-white hover:bg-white/15 shadow-black/20"
                )}
                >
                {isRecording ? (
                    <>
                    <Square className="w-3 h-3 fill-current" /> Stop
                    </>
                ) : (
                    <>
                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" /> Record
                    </>
                )}
                </button>
            </div>
      </div>
    </PanelSection>
  );
};

const ImportFile = ({ onFileSelected }: { onFileSelected: (file: File) => void }) => {
    return (
        <PanelSection title="Import File" icon={IconUpload}>
            <div className="p-2">
                <FileUploader onFileSelect={onFileSelected} className="h-28" />
            </div>
        </PanelSection>
    )
};

const OutputSettings = () => {
  const { promptStyle, setPromptStyle, isPromptStylePersistent, setIsPromptStylePersistent } = useGlobal();
  const [stylePreset, setStylePreset] = useState('Custom');

  const styles = ['Verbatim', 'Elegant Prose', 'Ana Suy', 'Poetic', 'Normal', 'Verbose', 'Concise', 'Formal', 'Custom'];

  return (
    <PanelSection title="Refinement" icon={Settings2}>
        <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 font-medium ml-1">Language</label>
                    <select className="w-full bg-zinc-950/50 border border-white/5 rounded-lg py-1.5 px-2 text-xs text-zinc-300 outline-hidden focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 appearance-none transition-all">
                        <option>English</option>
                        <option>Portuguese</option>
                        <option>Spanish</option>
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 font-medium ml-1">Style</label>
                    <select
                        value={stylePreset}
                        onChange={(e) => setStylePreset(e.target.value)}
                        className="w-full bg-zinc-950/50 border border-white/5 rounded-lg py-1.5 px-2 text-xs text-zinc-300 outline-hidden focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 appearance-none transition-all"
                    >
                        {styles.map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            {stylePreset === 'Custom' && (
                <div className="space-y-2 pt-2 border-t border-white/5">
                    <textarea
                        value={promptStyle}
                        onChange={(e) => setPromptStyle(e.target.value)}
                        className="w-full h-24 bg-zinc-950/50 border border-white/5 rounded-lg p-2.5 text-xs text-zinc-300 resize-none outline-hidden focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 placeholder:text-zinc-700 transition-all"
                        placeholder="Enter custom instructions..."
                    />
                    <label className="flex items-center gap-2 cursor-pointer group select-none">
                        <div className={cn(
                            "w-3.5 h-3.5 border rounded flex items-center justify-center transition-all duration-200",
                            isPromptStylePersistent ? "bg-indigo-500 border-indigo-500 scale-100" : "border-zinc-700 bg-zinc-800 group-hover:border-zinc-500"
                        )}>
                            {isPromptStylePersistent && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={isPromptStylePersistent}
                            onChange={(e) => setIsPromptStylePersistent(e.target.checked)}
                        />
                        <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors">Persist preferences</span>
                    </label>
                </div>
            )}
        </div>
    </PanelSection>
  );
};

// Mapeia estilo de UI para OutputStyle do sidecar
const mapStyleToOutputStyle = (style: string): OutputStyle => {
  const styleMap: Record<string, OutputStyle> = {
    'Verbatim': 'verbatim',
    'Elegant Prose': 'elegant_prose',
    'Formal': 'formal',
    'Casual': 'casual',
    'Normal': 'verbatim',
    'Concise': 'summary',
    'Verbose': 'elegant_prose',
  };
  return styleMap[style] || 'verbatim';
};

const GenerateButton = () => {
  const {
    isProcessing,
    setIsProcessing,
    setTranscriptionText,
    addLog,
    addToHistory,
    geminiKey,
    selectedModel,
    promptStyle,
    transcriptionMode,
    sidecarAvailable,
    checkSidecarHealth
  } = useGlobal();

  const [usedMethod, setUsedMethod] = useState<'local' | 'cloud' | 'idle'>('idle');

  // Determina qual metodo usar baseado no modo e disponibilidade
  const getTranscriptionMethod = async (): Promise<'local' | 'cloud'> => {
    if (transcriptionMode === 'local') {
      return 'local';
    }
    if (transcriptionMode === 'cloud') {
      return 'cloud';
    }
    // Modo auto: verifica sidecar
    const isAvailable = await checkSidecarHealth();
    return isAvailable ? 'local' : 'cloud';
  };

  const handleGenerate = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setUsedMethod('idle');
    addLog('Starting generation...', 'info');

    try {
      const method = await getTranscriptionMethod();
      setUsedMethod(method);

      if (method === 'local') {
        // Usar sidecar local
        if (!sidecarAvailable && transcriptionMode === 'local') {
          throw new Error('Sidecar local nao disponivel. Verifique se o servidor esta rodando.');
        }

        addLog('Using local sidecar (Whisper)', 'info');
        const client = getVoiceAIClient();

        // TODO: Integrar com audio real capturado
        // Por enquanto, simula uma transcricao de demonstracao
        const mockAudioBase64 = ''; // Seria o audio real em base64

        if (!mockAudioBase64) {
          // Demonstracao sem audio real
          addLog('Demo mode: no audio captured yet', 'warning');
          const mockText = `# Transcription Result (Local Sidecar)

Local transcription via Faster-Whisper.

## Status
- Sidecar: Connected
- Model: Whisper Large-v3
- Mode: ${transcriptionMode}

> Audio capture integration pending. Record audio first to transcribe.
`;
          setTranscriptionText(mockText);
          addToHistory(mockText);
          addLog('Demo transcription complete', 'success');
        } else {
          // Transcricao real
          const response = await client.transcribe({
            audio: mockAudioBase64,
            format: 'webm',
            language: 'pt',
            refine: !!promptStyle,
            style: mapStyleToOutputStyle(promptStyle || 'Normal'),
          });

          const resultText = response.refined_text || response.text;
          setTranscriptionText(resultText);
          addToHistory(resultText);
          addLog(`Transcription complete (${response.language}, ${response.confidence.toFixed(1)}% confidence)`, 'success');
        }
      } else {
        // Fallback: usar Gemini Cloud
        addLog('Using Gemini Cloud API', 'info');

        if (!geminiKey) {
          throw new Error('Gemini API key not configured. Add key in Settings.');
        }

        // Simula chamada ao Gemini (mantido como antes)
        await new Promise(resolve => setTimeout(resolve, 2000));

        const mockText = `# Transcription Result (Cloud)

Gemini AI processed transcription with style: **${promptStyle || 'Normal'}**.

## Key Points
- Audio processed via cloud API
- Model: ${selectedModel}
- Mode: ${transcriptionMode}

> Cloud-based processing complete.
`;
        setTranscriptionText(mockText);
        addToHistory(mockText);
        addLog('Cloud transcription complete', 'success');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Error: ${errorMsg}`, 'error');
      setUsedMethod('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  // Status indicator baseado no metodo usado e modo configurado
  const getStatusInfo = () => {
    if (isProcessing) {
      return {
        color: 'bg-yellow-500 animate-pulse',
        text: usedMethod === 'local' ? 'Processing (Local)' : usedMethod === 'cloud' ? 'Processing (Cloud)' : 'Processing...',
        icon: usedMethod === 'local' ? Server : Cloud,
      };
    }

    if (transcriptionMode === 'local' && !sidecarAvailable) {
      return {
        color: 'bg-red-500',
        text: 'Sidecar Offline',
        icon: Server,
      };
    }

    if (transcriptionMode === 'auto') {
      return {
        color: sidecarAvailable ? 'bg-emerald-500' : 'bg-amber-500',
        text: sidecarAvailable ? 'Ready (Local)' : 'Ready (Cloud)',
        icon: sidecarAvailable ? Server : Cloud,
      };
    }

    return {
      color: 'bg-emerald-500',
      text: transcriptionMode === 'local' ? 'Ready (Local)' : 'Ready (Cloud)',
      icon: transcriptionMode === 'local' ? Server : Cloud,
    };
  };

  const status = getStatusInfo();
  const StatusIcon = status.icon;

  return (
    <div className="p-4 border-t border-white/5 bg-zinc-950/80 backdrop-blur-xl absolute bottom-0 left-0 right-0 z-20">
      <button
        onClick={handleGenerate}
        disabled={isProcessing}
        className={cn(
          "w-full h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2.5 transition-all shadow-lg active:scale-[0.98]",
          isProcessing
            ? "bg-zinc-800 cursor-wait text-zinc-400"
            : "bg-linear-to-r from-indigo-600 to-indigo-500 hover:brightness-110 shadow-indigo-500/25"
        )}
      >
        {isProcessing ? (
          <>
            <Spinner size="sm" className="w-4 h-4 text-zinc-400" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <IconMagic className="w-4 h-4" />
            <span>Generate Transcription</span>
          </>
        )}
      </button>
      <div className="flex items-center justify-center gap-1.5 mt-2.5">
        <div className={cn("w-1.5 h-1.5 rounded-full", status.color)} />
        <StatusIcon className="w-3 h-3 text-zinc-500" />
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
            {status.text}
        </span>
      </div>
    </div>
  );
};

// --- Other Tabs ---

const SignalAnalysis = ({ micStream }: { micStream: MediaStream | null }) => (
  <div className="space-y-4 p-1">
    <PanelSection title="Real-time Scope" icon={Activity}>
        <div className="p-1">
            <AudioVisualizer
                stream={micStream}
                className="h-32 w-full rounded-lg"
                barColor="#818cf8"
                barWidth={2}
                gap={1}
            />
        </div>
    </PanelSection>

    <PanelSection title="Export Format" icon={FileAudio}>
        <div className="grid grid-cols-2 gap-2 p-2">
            <button className="bg-zinc-950/50 hover:bg-white/5 border border-white/5 rounded-lg p-3 text-left transition-all group hover:border-indigo-500/30">
                <div className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">WAV (PCM)</div>
                <div className="text-[10px] text-zinc-600 mt-1">Lossless - 48kHz</div>
            </button>
            <button className="bg-zinc-950/50 hover:bg-white/5 border border-white/5 rounded-lg p-3 text-left transition-all group hover:border-indigo-500/30">
                <div className="text-xs font-bold text-zinc-200 group-hover:text-indigo-300">MP3 (VBR)</div>
                <div className="text-[10px] text-zinc-600 mt-1">Compressed - 192kbps</div>
            </button>
        </div>
    </PanelSection>
  </div>
);

const SystemMetrics = () => {
    const { metrics, logs } = useGlobal();
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Word Count</span>
                    <span className="text-2xl font-mono text-zinc-200">{metrics.words}</span>
                </div>
                <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Time</span>
                    <span className="text-2xl font-mono text-zinc-200">{metrics.readingTime}m</span>
                </div>
            </div>

            <PanelSection title="Activity Log" icon={Activity}>
                <div className="h-[400px] overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700">
                    {logs.map(log => (
                        <div key={log.id} className="flex gap-3 text-[10px] font-mono border-b border-white/5 last:border-0 pb-1.5 mb-1.5">
                            <span className="text-zinc-600 shrink-0">{log.timestamp}</span>
                            <span className={cn(
                                log.type === 'error' ? "text-red-400" :
                                log.type === 'success' ? "text-emerald-400" :
                                "text-zinc-400"
                            )}>{log.message}</span>
                        </div>
                    ))}
                </div>
            </PanelSection>
        </div>
    )
}

const HistoryList = () => {
    const { history, setTranscriptionText, deleteFromHistory } = useGlobal();
    return (
        <div className="space-y-3 pb-20">
            {history.map(item => (
                <div key={item.id} onClick={() => setTranscriptionText(item.text)} className="group bg-zinc-900/40 border border-white/5 hover:border-indigo-500/30 hover:bg-zinc-900/60 rounded-xl p-4 transition-all cursor-pointer relative overflow-hidden">
                     <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-mono text-indigo-400/80 bg-indigo-500/10 px-1.5 py-0.5 rounded-sm">
                            {new Date(item.date).toLocaleDateString()}
                        </span>
                        <button onClick={(e) => {e.stopPropagation(); deleteFromHistory(item.id)}} className="text-zinc-600 hover:text-red-400 transition-colors p-1">
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed group-hover:text-zinc-200 transition-colors">
                        {item.text}
                    </p>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            ))}
            {history.length === 0 && (
                <div className="text-center py-10 opacity-50">
                    <IconHistory className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                    <p className="text-xs text-zinc-500">No transcription history</p>
                </div>
            )}
        </div>
    )
}

// --- Main Panel Layout ---

export const ActionPanel = () => {
  const { activeTab, setIsSettingsOpen, isRecording } = useGlobal();
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [isPlayingFile, setIsPlayingFile] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  // Mic logic...
  useEffect(() => {
    if (isRecording) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(setMicStream).catch(console.error);
    } else if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      setMicStream(null);
    }
  }, [isRecording]);

  const handleFileSelected = (file: File) => {
      if (uploadedFileUrl) URL.revokeObjectURL(uploadedFileUrl);
      setUploadedFileUrl(URL.createObjectURL(file));
      setIsPlayingFile(false);
  };

  const getHeader = () => {
    switch (activeTab) {
      case 'workspace': return { icon: IconWorkspace, label: 'Workspace' };
      case 'audio': return { icon: IconAudio, label: 'Analysis' };
      case 'stats': return { icon: IconStats, label: 'Metrics' };
      case 'history': return { icon: IconHistory, label: 'History' };
      default: return { icon: IconWorkspace, label: 'Workspace' };
    }
  };

  const header = getHeader();
  const contentTab = activeTab === 'editor' ? 'workspace' : activeTab;

  return (
    <aside className="w-full md:w-[360px] h-full md:h-screen bg-[#09090b] flex flex-col shrink-0 relative z-20 shadow-[5px_0_30px_-5px_rgba(0,0,0,0.5)]">
      {/* Background Texture */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none" />

      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-400">
                 <header.icon className="w-4 h-4" />
            </div>
            <div>
                <h2 className="text-sm font-bold text-zinc-100 tracking-tight">{header.label}</h2>
                <p className="text-[10px] text-zinc-500 font-medium">Pro ATT Machine v2.0</p>
            </div>
        </div>
        <button className="md:hidden text-zinc-400 p-2" onClick={() => setIsSettingsOpen(true)}>
          <IconSettings className="w-5 h-5" />
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent mask-fade-bottom">
        <AnimatePresence mode="wait">
          {contentTab === 'workspace' && (
            <motion.div
              key="workspace"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="space-y-6 pt-2"
            >
              <ContextScope />
              <AudioInput micStream={micStream} />

              <div className="space-y-3">
                  <ImportFile onFileSelected={handleFileSelected} />
                  {uploadedFileUrl && (
                      <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 flex items-center gap-3 relative overflow-hidden group">
                          <button
                            onClick={() => setIsPlayingFile(!isPlayingFile)}
                            className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all shrink-0 z-10"
                          >
                              {isPlayingFile ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 pl-0.5" />}
                          </button>
                          <div className="flex-1 z-10">
                              <div className="text-[10px] font-bold text-zinc-300">Audio Preview</div>
                              <div className="text-[9px] text-zinc-500 font-mono">00:00 / 04:23</div>
                          </div>
                          <div className="h-8 w-24 opacity-50">
                             <AudioVisualizer audioUrl={uploadedFileUrl} isPlaying={isPlayingFile} className="h-full w-full bg-transparent border-0" barColor="#a5b4fc" gap={1} />
                          </div>
                      </div>
                  )}
              </div>

              <OutputSettings />
            </motion.div>
          )}

          {contentTab === 'audio' && <motion.div key="audio" initial={{opacity:0}} animate={{opacity:1}}><SignalAnalysis micStream={micStream} /></motion.div>}
          {contentTab === 'stats' && <motion.div key="stats" initial={{opacity:0}} animate={{opacity:1}}><SystemMetrics /></motion.div>}
          {contentTab === 'history' && <motion.div key="history" initial={{opacity:0}} animate={{opacity:1}}><HistoryList /></motion.div>}
        </AnimatePresence>
      </div>

      {/* Sticky Footer Action */}
      <GenerateButton />
    </aside>
  );
};
