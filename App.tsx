import React, { useState, useRef, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask } from '@tauri-apps/plugin-dialog';
import { GoogleGenAI } from "@google/genai";
import { VoiceAIClient, type TranscribeResponse, type OutputStyle as SidecarOutputStyle, ensureSidecarRunning, setVoiceAIUrl, getVoiceAIUrl, getVoiceAIClient, isRemoteServer } from './src/services/VoiceAIClient';
import {
  Loader2,
  ChevronRight,
  X,
  Brain,
  Zap,
  Save,
  Mic,
  Settings,
  Cpu,
  Monitor,
  LogOut,
  AlertTriangle,
  Key,
  Eye,
  EyeOff,
  Volume2,
} from 'lucide-react';

// Novos componentes modulares
import { AppLayout } from './src/components/layout';
import { Editor } from './src/components/editor';
import { PanelATT, PanelTTS, PanelConfig } from './src/components/panels';
import { useActivePanel } from './src/hooks/useActivePanel';

// --- INDEXEDDB HELPER (For Audio & Context Persistence) ---
const DB_NAME = 'GeminiArchitectDB';
const DB_VERSION = 2; // Upgraded to v2 for Context Store
const STORE_NAME = 'workspace';
const CONTEXT_STORE = 'contexts';

type ContextItem = {
    name: string;
    memory: string;
    lastUpdated: number;
};

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Store 1: Audio Workspace (Blob persistence)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      
      // Store 2: Context Pools (Knowledge persistence)
      if (!db.objectStoreNames.contains(CONTEXT_STORE)) {
        db.createObjectStore(CONTEXT_STORE, { keyPath: 'name' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveAudioToDB = async (blob: Blob | null) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    if (blob) {
      store.put(blob, 'current_audio');
    } else {
      store.delete('current_audio');
    }
  } catch (e) {
    console.error("Failed to save audio state", e);
  }
};

const loadAudioFromDB = async (): Promise<Blob | undefined> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get('current_audio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    return undefined;
  }
};

// --- CONTEXT DB OPERATIONS ---
const saveContextToDB = async (item: ContextItem) => {
    try {
        const db = await initDB();
        const tx = db.transaction(CONTEXT_STORE, 'readwrite');
        tx.objectStore(CONTEXT_STORE).put(item);
        return new Promise<void>((resolve) => {
            tx.oncomplete = () => resolve();
        });
    } catch (e) {
        console.error("Failed to save context", e);
    }
};

const loadAllContextsFromDB = async (): Promise<ContextItem[]> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CONTEXT_STORE, 'readonly');
            const request = tx.objectStore(CONTEXT_STORE).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        return [];
    }
};

// --- INDEXEDDB PARA HISTORICO (Fallback robusto para Android) ---
const HISTORY_DB_NAME = 'ProATTHistoryDB';
const HISTORY_STORE_NAME = 'history';

const openHistoryDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(HISTORY_DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
                db.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'key' });
            }
        };
    });
};

const saveHistoryToIndexedDB = async (history: HistoryItem[]): Promise<void> => {
    try {
        const db = await openHistoryDB();
        const tx = db.transaction(HISTORY_STORE_NAME, 'readwrite');
        const store = tx.objectStore(HISTORY_STORE_NAME);
        store.put({ key: 'transcription_history', data: history });
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (e) {
        console.error('IndexedDB save failed:', e);
    }
};

const loadHistoryFromIndexedDB = async (): Promise<HistoryItem[] | null> => {
    try {
        const db = await openHistoryDB();
        const tx = db.transaction(HISTORY_STORE_NAME, 'readonly');
        const store = tx.objectStore(HISTORY_STORE_NAME);
        const request = store.get('transcription_history');
        const result = await new Promise<any>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return result?.data || null;
    } catch (e) {
        console.error('IndexedDB load failed:', e);
        return null;
    }
};

// --- TAURI STORE HELPER (Robust History Persistence) ---
type HistoryItem = { text: string; date: string; id: string };

// Detect Tauri environment
const isTauri = (): boolean => {
    return typeof window !== 'undefined' && '__TAURI__' in window;
};

// Dynamic import for Tauri Store (only loads in Tauri environment)
let storeInstance: any = null;
let storeInitPromise: Promise<any> | null = null;

const getStore = async () => {
    if (!isTauri()) return null;
    if (storeInstance) return storeInstance;

    // Prevent multiple concurrent initializations
    if (storeInitPromise) return storeInitPromise;

    storeInitPromise = (async () => {
        try {
            const { load } = await import('@tauri-apps/plugin-store');
            storeInstance = await load('history.json', { autoSave: 100 });
            console.log('Tauri Store initialized successfully');
            return storeInstance;
        } catch (e) {
            console.error('Failed to initialize Tauri Store:', e);
            storeInstance = null;
            return null;
        } finally {
            storeInitPromise = null;
        }
    })();

    return storeInitPromise;
};

// --- API KEY PERSISTENCE ---
const loadApiKey = async (): Promise<string> => {
    const store = await getStore();

    if (store) {
        try {
            const key = await store.get<string>('gemini_api_key');
            if (key) return key;
        } catch (e) {
            console.error('Failed to load API key from store:', e);
        }
    }

    // Fallback: variavel de ambiente
    if (process.env.API_KEY) {
        return process.env.API_KEY;
    }

    // Fallback: localStorage
    try {
        const saved = localStorage.getItem('gemini_api_key');
        if (saved) return saved;
    } catch (e) {
        console.error('Failed to load API key from localStorage:', e);
    }

    return '';
};

const saveApiKey = async (key: string): Promise<void> => {
    const store = await getStore();

    if (store) {
        try {
            await store.set('gemini_api_key', key);
            return;
        } catch (e) {
            console.error('Failed to save API key to store:', e);
        }
    }

    // Fallback: localStorage
    try {
        localStorage.setItem('gemini_api_key', key);
    } catch (e) {
        console.error('Failed to save API key to localStorage:', e);
    }
};

// Generate unique ID for history items
const generateHistoryId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Load history from Tauri Store, IndexedDB, or localStorage fallback
const loadHistory = async (): Promise<HistoryItem[]> => {
    const store = await getStore();

    if (store) {
        try {
            const history = await store.get<HistoryItem[]>('transcription_history');
            if (history && history.length > 0) {
                return history;
            }
        } catch (e) {
            console.error('Failed to load from Tauri Store:', e);
        }
    }

    // Fallback 1: IndexedDB (mais confiavel no Android)
    const indexedDBHistory = await loadHistoryFromIndexedDB();
    if (indexedDBHistory && indexedDBHistory.length > 0) {
        console.log('Loaded history from IndexedDB');
        return indexedDBHistory;
    }

    // Fallback 2: localStorage
    try {
        const saved = localStorage.getItem('gemini_history_v2');
        if (saved) {
            const parsed = JSON.parse(saved) as HistoryItem[];
            return parsed.map(item => ({
                ...item,
                id: item.id || generateHistoryId()
            }));
        }
    } catch (e) {
        console.error('Failed to load from localStorage:', e);
    }
    return [];
};

// Save history to Tauri Store, IndexedDB, or localStorage fallback
const saveHistory = async (history: HistoryItem[]): Promise<void> => {
    const store = await getStore();

    if (store) {
        try {
            await store.set('transcription_history', history);
            return;
        } catch (e) {
            console.error('Failed to save to Tauri Store:', e);
        }
    }

    // Fallback 1: IndexedDB (mais confiavel no Android)
    await saveHistoryToIndexedDB(history);

    // Fallback 2: localStorage
    try {
        localStorage.setItem('gemini_history_v2', JSON.stringify(history));
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
};

// Delete single history item
const deleteHistoryItem = async (history: HistoryItem[], id: string): Promise<HistoryItem[]> => {
    const updated = history.filter(item => item.id !== id);
    await saveHistory(updated);
    return updated;
};

// Clear all history
const clearAllHistory = async (): Promise<void> => {
    await saveHistory([]);
};

// Max history items (generous limit for Tauri Store - no localStorage size constraints)
const MAX_HISTORY_ITEMS = 500;


// Icones customizados removidos - agora usa lucide-react nos componentes modulares

// --- TYPES ---
type RecordingStyle = 'Dictation' | 'Interview';
type FontStyle = 'IBM Plex Sans' | 'JetBrains Mono' | 'Georgia';

type OutputStyle =
  | 'Whisper Only'
  | 'Verbatim'
  | 'Elegant Prose'
  | 'Ana Suy'
  | 'Poetic / Verses'
  | 'Normal'
  | 'Verbose'
  | 'Concise'
  | 'Formal'
  | 'Prompt (Claude)'
  | 'Prompt (Gemini)'
  | 'Bullet Points'
  | 'Summary'
  | 'Tech Docs'
  | 'Email'
  | 'Tweet Thread'
  | 'Code Generator'
  | 'Custom';

type ProcessingStats = {
  processingTime: number; // ms
  audioDuration: number; // seconds
  inputSize: number; // bytes
  wordCount: number;
  charCount: number;
  readingTime: string;
  appliedStyle: string;
};

type AudioMetrics = {
  duration: number;
  sampleRate: number;
  channels: number;
  rmsDB: number;      // Average loudness in dB
  peakDB: number;     // Peak loudness in dB
  silenceRatio: number; // % of audio below noise threshold
  zeroCrossingRate: number; // Proxy for clarity/frequency content
  avgPitchHz: number; // Est. fundamental frequency
  clarityScore: number; // 0-100 score based on SNR estimate
};

type AppTheme = {
  bg: string;
  text: string;
  accent: string;
}

// --- UTILS ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Simple WAV Encoder
const bufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"

  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // length = 16
  setUint16(1);                                  // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);  // avg. bytes/sec
  setUint16(numOfChan * 2);                      // block-align
  setUint16(16);                                 // 16-bit (hardcoded in this encoder)

  setUint32(0x61746164);                         // "data" - chunk
  setUint32(length - pos - 4);                   // chunk length

  // write interleaved data
  for(i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while(pos < buffer.length) {
    for(i = 0; i < numOfChan; i++) {             // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
      view.setInt16(offset, sample, true);       // write 16-bit sample
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArr], {type: "audio/wav"});

  function setUint16(data: any) {
    view.setUint16(offset, data, true);
    offset += 2;
  }
  function setUint32(data: any) {
    view.setUint32(offset, data, true);
    offset += 4;
  }
};

const analyzeAudioContent = async (blob: Blob): Promise<AudioMetrics> => {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0); // Analyze first channel
    
    let sumSquare = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let silenceSamples = 0;
    const silenceThreshold = 0.01; // ~ -40dB

    // Sort samples to find noise floor and peak signal for SNR estimation
    // Sampling for performance (every 100th sample)
    const sampledAmplitudes = [];
    for(let i = 0; i < rawData.length; i += 100) {
        sampledAmplitudes.push(Math.abs(rawData[i]));
    }
    sampledAmplitudes.sort((a, b) => a - b);
    
    // Bottom 10% is likely noise
    const noiseFloorIndex = Math.floor(sampledAmplitudes.length * 0.1);
    const noiseFloor = sampledAmplitudes.slice(0, noiseFloorIndex).reduce((a, b) => a + b, 0) / (noiseFloorIndex || 1);
    
    // Top 5% is signal
    const signalCeilingIndex = Math.floor(sampledAmplitudes.length * 0.95);
    const signalLevel = sampledAmplitudes.slice(signalCeilingIndex).reduce((a, b) => a + b, 0) / (sampledAmplitudes.length - signalCeilingIndex || 1);
    
    // Estimated SNR ratio
    const snrRatio = signalLevel / (noiseFloor + 0.000001);
    
    // Heuristic clarity score (0-100)
    // A high SNR (>10) suggests clear speech vs noise.
    // Also factor in "speechiness" (silence ratio shouldn't be 100% or 0%)
    let clarityScore = Math.min(100, Math.max(0, (Math.log10(snrRatio) * 40)));
    
    // Penalty for silence extremes
    const silenceRatio = (sampledAmplitudes.filter(s => s < 0.01).length / sampledAmplitudes.length);
    if (silenceRatio > 0.9) clarityScore *= 0.5; // Too quiet
    if (silenceRatio < 0.05) clarityScore *= 0.8; // Constant noise

    // Pitch detection (Autocorrelation method - simplified)
    const sampleRate = audioBuffer.sampleRate;
    let avgPitchHz = 0;
    
    // Only analyze a middle chunk for pitch to avoid startup transients
    const sliceStart = Math.floor(rawData.length / 2) - 1024;
    if (sliceStart > 0 && sliceStart + 2048 < rawData.length) {
        const slice = rawData.slice(sliceStart, sliceStart + 2048);
        let bestOffset = -1;
        let bestCorrelation = 0;
        let rms = 0;
        
        for (let i = 0; i < slice.length; i++) rms += slice[i] * slice[i];
        rms = Math.sqrt(rms / slice.length);

        if (rms > 0.01) { // Only calculate pitch if there's signal
            for (let offset = 20; offset < 1000; offset++) { // Check frequencies between ~44Hz and 2200Hz
                let correlation = 0;
                for (let i = 0; i < slice.length - offset; i++) {
                    correlation += slice[i] * slice[i + offset];
                }
                correlation /= (slice.length - offset);
                
                if (correlation > bestCorrelation) {
                    bestCorrelation = correlation;
                    bestOffset = offset;
                }
            }
            if (bestOffset > -1) {
                avgPitchHz = sampleRate / bestOffset;
            }
        }
    }

    for (let i = 0; i < rawData.length; i++) {
      const sample = rawData[i];
      const absSample = Math.abs(sample);
      
      sumSquare += sample * sample;
      if (absSample > peak) peak = absSample;
      if (absSample < silenceThreshold) silenceSamples++;
      
      if (i > 0 && rawData[i] * rawData[i - 1] < 0) {
        zeroCrossings++;
      }
    }

    const rms = Math.sqrt(sumSquare / rawData.length);
    const rmsDB = 20 * Math.log10(rms);
    const peakDB = 20 * Math.log10(peak);
    
    return {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      rmsDB: isFinite(rmsDB) ? rmsDB : -100,
      peakDB: isFinite(peakDB) ? peakDB : -100,
      silenceRatio: (silenceSamples / rawData.length) * 100,
      zeroCrossingRate: zeroCrossings / rawData.length,
      avgPitchHz: avgPitchHz,
      clarityScore: clarityScore
    };
  } finally {
    audioContext.close();
  }
};


// --- VISUALIZER COMPONENT ---
const AudioVisualizer = ({ stream }: { stream: MediaStream | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    contextRef.current = audioContext;
    
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64; // Low resolution for chunky bars

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');

    const draw = () => {
      if (!canvasCtx) return;
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height;
        
        // Dynamic color based on volume (Emerald/Indigo)
        const hue = 160 + (dataArray[i] / 255) * 60; // Green to Blueish
        const saturation = 70;
        const lightness = 40 + (dataArray[i] / 255) * 20;
        
        canvasCtx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        
        // Sharper, technical look
        canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

        x += barWidth;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
      if (contextRef.current && contextRef.current.state !== 'closed') {
        contextRef.current.close();
      }
    };
  }, [stream]);

  return <canvas ref={canvasRef} width={270} height={48} className="w-full h-12 rounded-sm bg-zinc-950/50" />;
};


// --- REACT COMPONENT ---

// Auth credentials (hardcoded for simplicity)
const AUTH_USERS: Record<string, string> = {
  'MCBS': 'Chicago00@',
  'PGR': 'Chicago00@',
};

export default function App() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('auth_user') !== null;
  });
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem('auth_user');
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = () => {
    const expectedPassword = AUTH_USERS[loginUsername.toUpperCase()];
    if (expectedPassword && expectedPassword === loginPassword) {
      const user = loginUsername.toUpperCase();
      localStorage.setItem('auth_user', user);
      setCurrentUser(user);
      setIsAuthenticated(true);
      setLoginError(null);
    } else {
      setLoginError('Usuario ou senha invalidos');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_user');
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  // Estados antigos removidos - agora usa useActivePanel
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Novo hook de painel ativo para o layout modular
  const { activePanel, setActivePanel, isTransitioning } = useActivePanel('att');

  // Audio State
  const [isRecording, setIsRecording] = useState(false);
  const [isNativeRecording, setIsNativeRecording] = useState(false); // Tracking if using native plugin
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]); // Ref for memory efficiency
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics | null>(null);
  
  // Hardware State
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  const [recordingStyle, setRecordingStyle] = useState<RecordingStyle>('Dictation');
  
  // Audio Config Settings
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(true);
  const [echoCancellation, setEchoCancellation] = useState<boolean>(true);
  const [autoGainControl, setAutoGainControl] = useState<boolean>(true);

  // Process State
  const [isProcessing, setIsProcessing] = useState(false);
  
  // AI Config
  const [aiModel, setAiModel] = useState<string>(() => localStorage.getItem('gemini_ai_model') || 'gemini-2.5-flash');

  // Persisted Transcription State
  const [transcription, setTranscription] = useState<string>(() => {
    return localStorage.getItem('gemini_current_work') || "";
  });

  const [logs, setLogs] = useState<{ msg: string; type: 'info' | 'success' | 'error' }[]>([]);
  
  // Stats State
  const [lastStats, setLastStats] = useState<ProcessingStats | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);

  // Settings State with LocalStorage
  const [outputLanguage, setOutputLanguage] = useState<'English' | 'Portuguese' | 'Spanish'>(() => {
    return (localStorage.getItem('gemini_outputLanguage') as any) || 'English';
  });
  const [outputStyle, setOutputStyle] = useState<OutputStyle>(() => {
    // Default to 'Verbatim' if nothing is stored, to satisfy "simple audio to text" need
    return (localStorage.getItem('gemini_outputStyle') as any) || 'Verbatim';
  });
  const [customStylePrompt, setCustomStylePrompt] = useState<string>(() => {
    return localStorage.getItem('gemini_customStylePrompt') || "";
  });

  // Theme & Appearance
  const [themeColor, setThemeColor] = useState<string>('#4f46e5'); // Indigo-600
  const [bgColor, setBgColor] = useState<string>('#09090b'); // Zinc-950
  const [textColor, setTextColor] = useState<string>('#e4e4e7'); // Zinc-200
  const [fontFamily, setFontFamily] = useState<FontStyle>('IBM Plex Sans');
  const [fontSize, setFontSize] = useState<number>(14);

  // Context System State (Persistence Upgraded to IndexedDB)
  const [contextPools, setContextPools] = useState<string[]>(['General']);
  const [activeContext, setActiveContext] = useState<string>(() => {
    return localStorage.getItem('gemini_active_context') || 'General';
  });
  // This stores the "Knowledge" string for each context
  const [contextMemory, setContextMemory] = useState<Record<string, string>>({});

  // Editor Modal State
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [tempMemoryEdit, setTempMemoryEdit] = useState('');
  const [isSavingContext, setIsSavingContext] = useState(false);

  // History State (Robust Persistence via Tauri Store)
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Auto-Update State
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready'>('idle');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  // API Key State
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isApiKeyVisible, setIsApiKeyVisible] = useState<boolean>(false);

  // Voice AI Sidecar State
  type TranscriptionMode = 'auto' | 'local' | 'cloud';
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>(() => {
    return (localStorage.getItem('voice_ai_mode') as TranscriptionMode) || 'auto';
  });
  const [sidecarAvailable, setSidecarAvailable] = useState<boolean>(false);
  const [sidecarStatus, setSidecarStatus] = useState<string>('checking');
  const voiceAIClient = useRef<VoiceAIClient | null>(null);

  // Whisper Server URL (remoto ou vazio para local)
  const [whisperServerUrl, setWhisperServerUrl] = useState<string>(() => {
    return localStorage.getItem('whisper_server_url') || 'http://100.114.203.28:8765';
  });
  const [whisperTestStatus, setWhisperTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [whisperTestMessage, setWhisperTestMessage] = useState<string>('');

  // TTS State (Text-to-Speech)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // TTS Settings
  const [ttsEngine, setTtsEngine] = useState<'piper' | 'chatterbox'>('chatterbox');
  const [ttsProfile, setTtsProfile] = useState<string>('standard');
  const [voiceRefAudio, setVoiceRefAudio] = useState<string | null>(null);
  const [ttsCustomParams, setTtsCustomParams] = useState({
    exaggeration: 0.5,
    speed: 1.0,
    stability: 0.5,
    steps: 10,
    sentence_silence: 0.2,
  });

  // Persist Effects
  useEffect(() => localStorage.setItem('gemini_outputLanguage', outputLanguage), [outputLanguage]);
  useEffect(() => localStorage.setItem('gemini_outputStyle', outputStyle), [outputStyle]);
  useEffect(() => localStorage.setItem('gemini_customStylePrompt', customStylePrompt), [customStylePrompt]);
  useEffect(() => localStorage.setItem('gemini_current_work', transcription), [transcription]);
  useEffect(() => localStorage.setItem('gemini_ai_model', aiModel), [aiModel]);

  // Persist TTS Settings
  useEffect(() => {
    localStorage.setItem('tts_settings', JSON.stringify({
      engine: ttsEngine,
      profile: ttsProfile,
      customParams: ttsCustomParams,
      voiceRef: voiceRefAudio,
    }));
  }, [ttsEngine, ttsProfile, ttsCustomParams, voiceRefAudio]);

  // Load TTS Settings on mount
  useEffect(() => {
    const saved = localStorage.getItem('tts_settings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        if (settings.engine) setTtsEngine(settings.engine);
        if (settings.profile) setTtsProfile(settings.profile);
        if (settings.customParams) setTtsCustomParams(settings.customParams);
        if (settings.voiceRef) setVoiceRefAudio(settings.voiceRef);
      } catch (e) {
        console.warn('Failed to load TTS settings:', e);
      }
    }
  }, []);

  // Load API Key on mount
  useEffect(() => {
    loadApiKey().then(key => {
      setApiKey(key);
      setApiKeyInput(key);
    });
  }, []);

  // History Persistence: Load on mount, save on change
  useEffect(() => {
    loadHistory().then(loaded => {
      setHistory(loaded);
      setHistoryLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (historyLoaded && history.length >= 0) {
      saveHistory(history);
    }
  }, [history, historyLoaded]);
  
  // Context Active State Persistence
  useEffect(() => localStorage.setItem('gemini_active_context', activeContext), [activeContext]);

  // Voice AI Sidecar: Persist mode and check availability
  useEffect(() => localStorage.setItem('voice_ai_mode', transcriptionMode), [transcriptionMode]);

  // Whisper Server URL: Persist and apply on change
  useEffect(() => {
    localStorage.setItem('whisper_server_url', whisperServerUrl);
    setVoiceAIUrl(whisperServerUrl || null);
  }, [whisperServerUrl]);

  useEffect(() => {
    // Initialize Voice AI Client with configured URL
    const url = whisperServerUrl || 'http://100.114.203.28:8765';
    setVoiceAIUrl(whisperServerUrl || null);
    voiceAIClient.current = getVoiceAIClient();

    const checkSidecar = async () => {
      try {
        setSidecarStatus('checking');
        const health = await voiceAIClient.current?.health();
        if (health?.status === 'healthy') {
          setSidecarAvailable(true);
          setSidecarStatus(`Local STT (Whisper ${health.models.whisper.model || 'medium'})`);
          addLog('Voice AI Sidecar conectado - Transcricao local ativada', 'success');
        } else {
          setSidecarAvailable(false);
          setSidecarStatus('Sidecar offline - usando Gemini');
        }
      } catch {
        setSidecarAvailable(false);
        setSidecarStatus('Sidecar offline - usando Gemini');
      }
    };

    // Aguardar auto-start do Rust, depois verificar
    // Se falhar, tenta iniciar manualmente via fallback
    const initSidecar = async () => {
      setSidecarStatus('iniciando...');

      // Dar tempo para o auto-start do Rust
      await new Promise(r => setTimeout(r, 3000));

      // Verificar se esta disponivel
      const health = await voiceAIClient.current?.health();
      if (health?.status === 'healthy') {
        setSidecarAvailable(true);
        setSidecarStatus(`Local STT (Whisper ${health.models.whisper.model || 'medium'})`);
        addLog('Voice AI Sidecar iniciado automaticamente', 'success');
        return;
      }

      // Fallback: tentar iniciar via comando Tauri
      addLog('Auto-start falhou, tentando fallback...', 'info');
      const success = await ensureSidecarRunning();
      if (success) {
        const healthRetry = await voiceAIClient.current?.health();
        if (healthRetry?.status === 'healthy') {
          setSidecarAvailable(true);
          setSidecarStatus(`Local STT (Whisper ${healthRetry.models.whisper.model || 'medium'})`);
          addLog('Voice AI Sidecar iniciado via fallback', 'success');
          return;
        }
      }

      setSidecarAvailable(false);
      setSidecarStatus('Sidecar offline - usando Gemini');
      addLog('Sidecar indisponivel, transcricao via Gemini', 'info');
    };

    initSidecar();

    // Recheck periodically (every 30 seconds)
    const interval = setInterval(checkSidecar, 30000);
    return () => clearInterval(interval);
  }, []);

  // Check for updates on startup
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        setUpdateStatus('checking');
        const update = await check();
        if (update) {
          setUpdateStatus('available');
          setUpdateVersion(update.version);
          console.log(`[Updater] Nova versao disponivel: ${update.version}`);

          const shouldDownload = await ask(
            `Nova versao ${update.version} disponivel. Deseja baixar e instalar agora?`,
            { title: 'Atualizacao Disponivel', kind: 'info' }
          );

          if (!shouldDownload) {
            console.log('[Updater] Usuario recusou a atualizacao');
            setUpdateStatus('idle');
            return;
          }

          setUpdateStatus('downloading');
          setUpdateProgress(0);
          let downloaded = 0;
          console.log('[Updater] Iniciando download...');

          await update.downloadAndInstall((event) => {
            if (event.event === 'Progress') {
              const data = event.data as { chunkLength: number; contentLength?: number };
              downloaded += data.chunkLength;
              if (data.contentLength && data.contentLength > 0) {
                const pct = Math.min((downloaded / data.contentLength) * 100, 100);
                setUpdateProgress(pct);
              }
            }
          });

          console.log('[Updater] Download concluido. Pronto para reiniciar.');
          setUpdateStatus('ready');

          const shouldRestart = await ask(
            `Versao ${update.version} instalada com sucesso! Reiniciar agora?`,
            { title: 'Atualizacao Instalada', kind: 'info' }
          );

          if (shouldRestart) {
            await relaunch();
          }
        } else {
          console.log('[Updater] Nenhuma atualizacao disponivel');
          setUpdateStatus('idle');
        }
      } catch (e) {
        console.error('[Updater] Erro na atualizacao:', e);
        setUpdateStatus('idle');
      }
    };

    const timer = setTimeout(checkForUpdates, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Load Microphones on mount
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
        const mics = devices.filter(d => d.kind === 'audioinput');
        setAvailableMics(mics);
    });
  }, []);

  // --- MIGRATION & LOADING LOGIC ---
  useEffect(() => {
    const initializeData = async () => {
        // 1. Load data from IndexedDB
        const savedContexts = await loadAllContextsFromDB();
        
        let initialMemory: Record<string, string> = {};
        let initialPools: string[] = [];

        if (savedContexts.length > 0) {
            savedContexts.forEach(ctx => {
                initialMemory[ctx.name] = ctx.memory;
                initialPools.push(ctx.name);
            });
        } else {
            // 2. Migration: Check LocalStorage if DB is empty
            const lsPools = localStorage.getItem('gemini_context_pools');
            const lsMemory = localStorage.getItem('gemini_context_memory');

            if (lsPools && lsMemory) {
                try {
                    const pools = JSON.parse(lsPools) as string[];
                    const memory = JSON.parse(lsMemory) as Record<string, string>;
                    
                    addLog("Migrating data to secure storage...", 'info');
                    
                    // Save to DB
                    for (const name of pools) {
                        const mem = memory[name] || "";
                        await saveContextToDB({ name, memory: mem, lastUpdated: Date.now() });
                        initialMemory[name] = mem;
                        initialPools.push(name);
                    }
                    addLog("Data migration complete.", 'success');
                } catch (e) {
                    console.error("Migration failed", e);
                }
            }
        }

        // Fallback defaults
        if (initialPools.length === 0) {
            initialPools = ['General', 'Coding', 'Writing'];
            await saveContextToDB({ name: 'General', memory: '', lastUpdated: Date.now() });
            await saveContextToDB({ name: 'Coding', memory: '', lastUpdated: Date.now() });
            await saveContextToDB({ name: 'Writing', memory: '', lastUpdated: Date.now() });
        }

        setContextPools(initialPools);
        setContextMemory(initialMemory);
    };

    initializeData();

    // Load Audio
    loadAudioFromDB().then(blob => {
      if (blob) {
        setAudioBlob(blob);
        addLog("Restored previous session audio.", 'info');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const addLog = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-4), { msg, type }]);
  }, []);

  // Testar conexao com servidor Whisper remoto
  const testWhisperServer = async () => {
    const url = whisperServerUrl.trim();
    if (!url) {
      setWhisperTestStatus('error');
      setWhisperTestMessage('URL do servidor Whisper obrigatória');
      return;
    }

    setWhisperTestStatus('testing');
    setWhisperTestMessage('Testando conexao...');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'healthy') {
        setWhisperTestStatus('success');
        setWhisperTestMessage(`Conectado: Whisper ${data.models?.whisper?.model || 'medium'}`);
        // Aplicar nova URL e reconectar
        setVoiceAIUrl(url);
        voiceAIClient.current = getVoiceAIClient();
        setSidecarAvailable(true);
        setSidecarStatus(`Remoto (Whisper ${data.models?.whisper?.model || 'medium'})`);
      } else {
        throw new Error('Servidor degradado');
      }
    } catch (error) {
      setWhisperTestStatus('error');
      setWhisperTestMessage(error instanceof Error ? error.message : 'Erro de conexao');
    }
  };

  const handleAddContext = async () => {
    const name = prompt("Name your new Context Pool (e.g. 'Project Alpha', 'React Docs'):");
    if (name && !contextPools.includes(name)) {
      setContextPools(prev => [...prev, name]);
      setActiveContext(name);
      setContextMemory(prev => ({ ...prev, [name]: "" }));
      
      // Save to DB
      await saveContextToDB({ name, memory: "", lastUpdated: Date.now() });
      addLog(`Context '${name}' created & persisted.`, 'success');
    }
  };

  const openMemoryEditor = () => {
      setTempMemoryEdit(contextMemory[activeContext] || "");
      setIsMemoryModalOpen(true);
  };

  const saveMemory = async () => {
      setIsSavingContext(true);
      const updatedMemory = tempMemoryEdit;
      
      // Update State
      setContextMemory(prev => ({
          ...prev,
          [activeContext]: updatedMemory
      }));

      // Update DB
      await saveContextToDB({ 
          name: activeContext, 
          memory: updatedMemory, 
          lastUpdated: Date.now() 
      });

      setIsSavingContext(false);
      setIsMemoryModalOpen(false);
      addLog("Context memory saved to secure storage.", 'success');
  };

  const handleResetApiKey = async () => {
    // Attempt to clear from localStorage if stored there (custom persistence)
    try {
        localStorage.removeItem('API_KEY');
        localStorage.removeItem('GOOGLE_API_KEY');
    } catch (e) { console.error(e); }

    // Use platform specific reset if available
    if ((window as any).aistudio && (window as any).aistudio.openSelectKey) {
        await (window as any).aistudio.openSelectKey();
        window.location.reload();
    } else {
        addLog("Use environment controls to reset API Key.", 'error');
    }
    setIsResetConfirmOpen(false);
    setIsSettingsOpen(false);
  };

  // Run analysis when audioBlob changes
  useEffect(() => {
    if (audioBlob) {
      saveAudioToDB(audioBlob); // Persist audio
      
      // Only analyze if not already recording (avoids partial analysis spam)
      if (!isRecording) {
          addLog("Analyzing audio signal...", 'info');
          analyzeAudioContent(audioBlob).then(metrics => {
            setAudioMetrics(metrics);
            addLog("Audio analysis complete.", 'success');
          }).catch(err => {
            console.error("Analysis failed", err);
            addLog("Audio analysis failed.", 'error');
          });
      }
    } else if (audioBlob === null && !isRecording) {
      // If cleared
      saveAudioToDB(null);
      setAudioMetrics(null);
    }
  }, [audioBlob, isRecording, addLog]);

  const startRecording = async () => {
    // Tentar plugin nativo primeiro (funciona no Linux desktop onde WebKit2GTK nao tem permissoes)
    if (isTauri()) {
      try {
        const { startRecording: startNativeRecording } = await import('tauri-plugin-mic-recorder-api');
        await startNativeRecording();
        setIsNativeRecording(true);
        setIsRecording(true);
        setRecordingStartTime(Date.now());
        setAudioBlob(null);
        addLog("Gravacao iniciada (nativo)", 'info');
        return;
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.warn('Native recording failed:', errorMsg);

        // Se o erro indica ausencia de dispositivo de audio, mostrar mensagem especifica
        if (errorMsg.includes('NoDevice') || errorMsg.includes('no device') || errorMsg.includes('not available')) {
          addLog("Nenhum microfone detectado no sistema.", 'error');
          return;
        }

        // Tentar fallback Web API apenas se o erro nao foi de dispositivo
        addLog("Plugin nativo falhou, tentando Web API...", 'info');
      }
    }

    // Fallback: Web API (funciona no Android e navegador)
    // NOTA: No Linux desktop com WebKit2GTK, isso vai falhar com NotAllowedError
    // porque o WebKit2GTK nao tem handler de permissao configurado no Tauri
    try {
      // Verificar se mediaDevices esta disponivel
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        addLog("API de midia nao disponivel neste ambiente.", 'error');
        return;
      }

      const constraints = {
        audio: {
            deviceId: selectedMicId !== 'default' ? { exact: selectedMicId } : undefined,
            echoCancellation: echoCancellation,
            noiseSuppression: noiseSuppression,
            autoGainControl: autoGainControl
        },
        video: false  // Explicitamente desabilitar video para evitar prompt de camera
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const recorder = new MediaRecorder(stream);

      chunksRef.current = []; // Reset chunks

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null);
        // Create blob only on stop
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setAudioStream(stream);
      setIsNativeRecording(false);
      setIsRecording(true);
      setRecordingStartTime(Date.now());
      setAudioBlob(null);
      addLog("Gravacao iniciada (Web API)", 'info');
    } catch (err: unknown) {
      console.error('getUserMedia error:', err);
      const errorName = err instanceof Error ? err.name : 'Unknown';
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (errorName === 'NotAllowedError') {
        // Erro especifico do WebKit2GTK no Linux - permissao negada automaticamente
        addLog("Permissao de microfone negada. No Linux, use o botao de upload de arquivo como alternativa.", 'error');
      } else if (errorName === 'NotFoundError') {
        addLog("Nenhum microfone encontrado no sistema.", 'error');
      } else {
        addLog(`Erro ao acessar microfone: ${errorMsg}`, 'error');
      }
    }
  };

  const stopRecording = async () => {
    // Se usando gravacao nativa
    if (isNativeRecording) {
      try {
        const { stopRecording: stopNativeRecording } = await import('tauri-plugin-mic-recorder-api');
        const { readFile } = await import('@tauri-apps/plugin-fs');

        // stopRecording retorna o caminho do arquivo WAV
        const filePath = await stopNativeRecording();
        addLog(`Audio salvo em: ${filePath}`, 'info');

        // Ler o arquivo WAV e converter para Blob
        const audioData = await readFile(filePath);
        const blob = new Blob([audioData], { type: 'audio/wav' });
        setAudioBlob(blob);
        setIsRecording(false);
        setIsNativeRecording(false);
        addLog("Gravacao capturada.", 'success');
        return;
      } catch (e) {
        console.error('Native stop failed:', e);
        addLog("Erro ao parar gravacao nativa.", 'error');
        setIsRecording(false);
        setIsNativeRecording(false);
        return;
      }
    }

    // Fallback: parar MediaRecorder (Web API)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      addLog("Recording captured.", 'success');
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
      addLog(`Loaded: ${file.name}`, 'success');
    }
  };

  const handleDownloadText = async (format: 'txt' | 'md') => {
      // Detectar se esta no Tauri
      if (isTauri()) {
          try {
              const { save } = await import('@tauri-apps/plugin-dialog');
              const { writeTextFile } = await import('@tauri-apps/plugin-fs');

              let filename = `transcription-${Date.now()}`;
              if (transcription) {
                  const lines = transcription.split('\n');
                  if (lines.length > 0) {
                      const candidate = lines[0].trim();
                      const safeName = candidate.replace(/[^a-zA-Z0-9 \-_().\u00C0-\u00FF]/g, '').trim();
                      if (safeName.length > 0 && safeName.length < 255) {
                          filename = safeName;
                      }
                  }
              }

              const filePath = await save({
                  defaultPath: `${filename}.${format}`,
                  filters: [{ name: format.toUpperCase(), extensions: [format] }]
              });

              if (filePath) {
                  await writeTextFile(filePath, transcription);
                  addLog(`Arquivo exportado: ${filePath}`, 'success');
              }
              return;
          } catch (e) {
              console.error('Tauri export failed:', e);
              addLog('Exportacao nativa falhou, tentando fallback...', 'warning');
          }
      }

      // Fallback para navegador web
      const element = document.createElement("a");
      const file = new Blob([transcription], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);

      let filename = `transcription-${Date.now()}`;
      if (transcription) {
          const lines = transcription.split('\n');
          if (lines.length > 0) {
              const candidate = lines[0].trim();
              const safeName = candidate.replace(/[^a-zA-Z0-9 \-_().\u00C0-\u00FF]/g, '').trim();
              if (safeName.length > 0 && safeName.length < 255) {
                  filename = safeName;
              }
          }
      }

      element.download = `${filename}.${format}`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      addLog(`Arquivo exportado como .${format}`, 'success');
  };

  const handleAudioExport = async (format: 'webm' | 'wav') => {
      if (!audioBlob) return;

      let blobToExport = audioBlob;

      if (format === 'wav') {
          try {
              addLog("Convertendo para WAV...", 'info');
              const arrayBuffer = await audioBlob.arrayBuffer();
              const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
              const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
              blobToExport = bufferToWav(audioBuffer);
          } catch (e) {
              console.error(e);
              addLog("Conversao WAV falhou", 'error');
              return;
          }
      }

      // Detectar se esta no Tauri
      if (isTauri()) {
          try {
              const { save } = await import('@tauri-apps/plugin-dialog');
              const { writeFile } = await import('@tauri-apps/plugin-fs');

              const filePath = await save({
                  defaultPath: `recording-${Date.now()}.${format}`,
                  filters: [{ name: format.toUpperCase(), extensions: [format] }]
              });

              if (filePath) {
                  const bytes = new Uint8Array(await blobToExport.arrayBuffer());
                  await writeFile(filePath, bytes);
                  addLog(`Audio exportado: ${filePath}`, 'success');
              }
              return;
          } catch (e) {
              console.error('Tauri audio export failed:', e);
              addLog('Exportacao nativa falhou, tentando fallback...', 'warning');
          }
      }

      // Fallback para navegador web
      const element = document.createElement("a");
      element.href = URL.createObjectURL(blobToExport);
      element.download = `recording-${Date.now()}.${format}`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      addLog(`Audio exportado como .${format}`, 'success');
  };

  const processAudio = async () => {
    if (!audioBlob) return;

    // Determine if we should use local STT
    const useLocalSTT = (transcriptionMode === 'local' || (transcriptionMode === 'auto' && sidecarAvailable)) && sidecarAvailable;

    // Only require API key if using cloud mode or if refining with Gemini
    const currentApiKey = apiKey || process.env.API_KEY;
    if (!useLocalSTT && !currentApiKey) {
      addLog("API Key nao configurada. Va em Settings para adicionar.", 'error');
      setIsSettingsOpen(true);
      return;
    }

    setIsProcessing(true);
    // Layout modular - nao precisa trocar tabs manualmente

    const startTime = performance.now();

    try {
      // --- LOCAL STT MODE (Whisper via Sidecar) ---
      if (useLocalSTT && voiceAIClient.current) {
        addLog('Transcrevendo localmente com Whisper...', 'info');

        // Convert blob to base64
        const base64Audio = await VoiceAIClient.blobToBase64(audioBlob);
        const format = VoiceAIClient.getFormatFromMimeType(audioBlob.type);

        // Map OutputStyle to SidecarOutputStyle
        const sidecarStyleMap: Record<string, SidecarOutputStyle> = {
          'Whisper Only': 'verbatim',
          'Verbatim': 'verbatim',
          'Elegant Prose': 'elegant_prose',
          'Formal': 'formal',
          'Normal': 'verbatim',
          'Concise': 'summary',
          'Summary': 'summary',
          'Bullet Points': 'bullet_points',
        };
        const sidecarStyle = sidecarStyleMap[outputStyle] || 'verbatim';

        // Should we refine with Gemini?
        // Whisper Only, Verbatim, and Normal bypass Gemini completely
        const shouldRefine = currentApiKey && !['Whisper Only', 'Verbatim', 'Normal'].includes(outputStyle);

        try {
          const result = await voiceAIClient.current.transcribe({
            audio: base64Audio,
            format,
            language: outputLanguage === 'Portuguese' ? 'pt' : outputLanguage === 'Spanish' ? 'es' : 'en',
            refine: shouldRefine,
            style: sidecarStyle,
          });

          // Use refined text if available, otherwise raw
          let finalText = result.refined_text || result.text;

          // Apply filename rule
          const currentMemory = contextMemory[activeContext] || "No previous context.";
          if (currentApiKey && shouldRefine && result.refined_text) {
            // Text already refined by sidecar
            finalText = result.refined_text;
          }

          // Add filename suggestion if not present
          if (!finalText.includes('\n\n')) {
            // Generate a simple filename from first words
            const firstWords = finalText.split(/\s+/).slice(0, 5).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
            finalText = `${firstWords || 'transcription'}\n\n${finalText}`;
          }

          setTranscription(finalText);

          // Update Context Memory
          const updatedMemory = (currentMemory + "\n" + finalText).slice(-5000);
          setContextMemory(prev => ({
            ...prev,
            [activeContext]: updatedMemory
          }));

          saveContextToDB({
            name: activeContext,
            memory: updatedMemory,
            lastUpdated: Date.now()
          }).catch(e => console.error("Auto-save failed", e));

          // Calculate Stats
          const endTime = performance.now();
          const cleanedText = finalText.trim();
          const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
          const charCount = cleanedText.length;
          const wpm = 200;
          const readingTimeVal = Math.ceil(wordCount / wpm);

          const newStats: ProcessingStats = {
            processingTime: endTime - startTime,
            audioDuration: result.duration,
            inputSize: audioBlob.size,
            wordCount,
            charCount,
            readingTime: `${readingTimeVal} min read`,
            appliedStyle: outputStyle
          };

          setLastStats(newStats);

          // Add to history
          setHistory(prev => [{
            text: cleanedText,
            date: new Date().toISOString(),
            id: generateHistoryId()
          }, ...prev].slice(0, MAX_HISTORY_ITEMS));

          const mode = result.refine_success ? 'Local + Gemini refinement' : 'Local (Whisper)';
          addLog(`Transcricao completa via ${mode}`, 'success');
          setIsProcessing(false);
          return;

        } catch (sidecarError: any) {
          // Fallback to cloud if sidecar fails
          addLog(`Sidecar falhou: ${sidecarError.message}. Tentando Gemini...`, 'warning');
          if (!currentApiKey) {
            addLog("Fallback para Gemini requer API Key.", 'error');
            setIsProcessing(false);
            return;
          }
          // Continue to cloud mode below
        }
      }

      // --- CLOUD MODE (Gemini Direct) ---
      const base64Audio = await blobToBase64(audioBlob);
      const ai = new GoogleGenAI({ apiKey: currentApiKey! });

      // Get memory for current context
      const currentMemory = contextMemory[activeContext] || "No previous context.";

      // --- CRITICAL SPLIT: LITERARY VS. PROMPT ARCHITECT VS. VERBATIM ---
      // This ensures we do not break the "Literary" styles while fixing "Prompt" styles.
      const isPromptEngineeringMode = [
          'Prompt (Claude)', 
          'Prompt (Gemini)', 
          'Code Generator', 
          'Tech Docs', 
          'Bullet Points'
      ].includes(outputStyle);

      const isVerbatimMode = outputStyle === 'Verbatim' || outputStyle === 'Whisper Only';

      const isPortuguese = outputLanguage === 'Portuguese';

      let systemPrompt = "";

      if (isPromptEngineeringMode) {
          // --- MODE A: SENIOR PROMPT ARCHITECT (Strict, Technical, XML/Markdown) ---
          
          let formatInstruction = "";
          if (outputStyle === 'Prompt (Claude)') {
              formatInstruction = `
              CRITICAL OUTPUT FORMATTING:
              - You MUST wrap the final prompt in XML tags: <prompt_configuration> ... </prompt_configuration>
              - Use tags like <role>, <context>, <task>, <constraints>, <output_format> to structure the prompt.
              - Do NOT use Markdown headers (##). Use XML delimiters.
              `;
          } else if (outputStyle === 'Prompt (Gemini)') {
              formatInstruction = `
              ## Prompt Engineering Directives:
              * **Minimize Interpretation:** Reduce subjective interpretation of the input.
              * **Idea Refinement:** Prioritize clarification of the core idea.
              * **Output Format Conjecturing:** Actively anticipate the optimal format.
              * **Order Preservation:** Maintain original sequence.
              * **No Merging:** Do not combine distinct requests.
              * **Independent Delineation:** Distinct requests must be separated.

              FORMAT: Use clear Markdown headers (## Role, ## Task, ## Constraints). Bullet points for clarity.
              `;
          } else if (outputStyle === 'Code Generator') {
              formatInstruction = `OUTPUT ONLY VALID CODE inside Markdown code blocks. No conversational filler.`;
          } else {
             formatInstruction = `Format as a structured technical document.`;
          }

          systemPrompt = `
            ROLE: You are a Senior Prompt Engineer and Technical Architect.
            
            TASK: Reverse-engineer the user's spoken audio into a professional, high-fidelity LLM Prompt or Technical Document.
            
            INPUT ANALYSIS:
            - Listen to the user's intent, not just their words.
            - Filter out "thinking noises", hesitation, and non-technical filler.
            - Extract the core logic, business rules, or creative requirements.

            TONE & STYLE:
            - Imperative, Direct, Incisive.
            - No "Please" or "Would you kindly".
            - Unambiguous instructions.
            - High information density.

            CONTEXT MEMORY:
            "${currentMemory.slice(-2000)}"

            TARGET LANGUAGE: ${outputLanguage}
            
            ${formatInstruction}

            EXECUTION:
            - Transform the raw audio transcript into the requested format immediately.
            - Do not strictly transcribe; ARCHITECT the response.
          `;

      } else if (isVerbatimMode) {
          // --- MODE C: FL FLAWLESS TRANSCRIPTION (Verbatim) ---
          systemPrompt = `
            ROLE: You are a professional, high-fidelity transcription engine.
            
            TASK: Convert the spoken audio into text with absolute accuracy.
            
            RULES:
            1. **Verbatim Fidelity:** Transcribe exactly what is said. Do not paraphrase.
            2. **Punctuation:** Add standard punctuation for readability, but do not alter sentence structure.
            3. **Filler Words:** Remove excessive stuttering or non-lexical sounds (um, uh) ONLY if they distract significantly. Keep them if they add context/hesitation.
            4. **No Meta-Commentary:** Do NOT add "Here is the transcript:" or any intro. Just the text.
            
            TARGET LANGUAGE: ${outputLanguage}
            
            CONTEXT MEMORY (For terminology reference only):
            "${currentMemory.slice(-2000)}"
          `;
      } else {
          // --- MODE B: LITERARY EDITOR (Preserved Legacy Logic) ---
          // This path handles 'Elegant Prose', 'Ana Suy', 'Normal', etc.
          // It remains UNTOUCHED to preserve the quality you like.

          let styleInstruction = "";
          if (isPortuguese) {
              const instructions: Record<string, string> = {
                'Elegant Prose': `REGRAS: 1. Tom: Claro, sofisticado e preciso. Evite floreios. 2. Formato: Prosa contínua (parágrafos). 3. Voz: Refinada. 4. Objetivo: Texto bem escrito.`,
                'Ana Suy': `REGRAS - ANA SUY: 1. Tom: Íntimo e psicanalítico. Ouça os *silêncios*. 2. Voz: Poética e acessível. 3. Foco: Experiência subjetiva. 4. Estrutura: Fluida, parágrafos de prosa.`,
                'Poetic / Verses': `REGRAS - POÉTICO: 1. Estrutura: Quebras de linha e estrofes baseadas no ritmo. 2. Tom: Lírico e evocativo. 3. Objetivo: Verso livre.`,
                'Normal': `Texto padrão, gramaticalmente correto e fluído. Sem gírias excessivas.`,
                'Verbose': `Seja detalhista e expansivo. Explore cada ponto a fundo.`,
                'Concise': `Seja direto e econômico. Remova qualquer redundância.`,
                'Formal': `Use linguagem culta, profissional e impessoal.`,
                'Summary': `Forneça um resumo executivo de alto nível em 1-2 parágrafos.`,
                'Email': `Formate como um e-mail profissional.`,
                'Tweet Thread': `Formate como uma thread viral do Twitter/X.`,
                'Custom': `Siga estas instruções: "${customStylePrompt}".`
              };
              styleInstruction = instructions[outputStyle] || `Adapte para o estilo ${outputStyle}.`;
          } else {
              if (outputStyle === 'Elegant Prose') {
                styleInstruction = `
                TRANSFORMATION RULES:
                1. Tone: Clear, sophisticated, and precise. Avoid flowery or overwrought language.
                2. Format: Continuous prose (paragraphs). Do NOT use verse, stanzas, or line breaks for effect unless strictly necessary.
                3. Voice: Refined but accessible. Not stiff or overly formal. Avoid academic jargon.
                4. Goal: Make it sound like a well-written creative piece or essay. Focus on clarity and rhythm rather than ornamentation.
                `;
             } else if (outputStyle === 'Ana Suy') {
                styleInstruction = `
                TRANSFORMATION RULES - ANA SUY STYLE:
                1. Tone: Intimate and psychoanalytic. Pay close attention to the *silences* and what is left unsaid. 
                2. Voice: Poetic but accessible. Use simple words to describe complex feelings.
                3. Techniques: Use the speaker's pauses to structure the text (using ellipses or paragraph breaks). Focus on the *subjective experience*.
                4. Structure: Fluid, organic, and polished. Do NOT use poem/verse format. Use prose paragraphs.
                `;
             } else if (outputStyle === 'Poetic / Verses') {
                 styleInstruction = `TRANSFORMATION RULES - POETIC STYLE: Structure using line breaks and stanzas. Tone: Artistic, lyrical.`;
             } else if (outputStyle === 'Summary') {
                styleInstruction = `Provide a high-level executive summary of the content in 1-2 paragraphs.`;
             } else if (outputStyle === 'Email') {
                styleInstruction = `Format as a professional email draft based on the content. Subject line included.`;
             } else if (outputStyle === 'Tweet Thread') {
                styleInstruction = `Format as a viral Twitter/X thread. Short, punchy sentences. 280 chars per tweet limit simulation.`;
             } else if (outputStyle === 'Custom') {
                 styleInstruction = `Follow these specific user instructions: "${customStylePrompt}".`;
             } else {
                 styleInstruction = `Adapt the output to be ${outputStyle} in tone and length.`;
             }
          }

          systemPrompt = `
            Role: You are an expert literary editor and ghostwriter with a keen ear for vocal nuance.
            
            Goal: Transform the spoken audio into text that captures not just the words, but the *spirit* and *intent* of the speaker.
            
            CRITICAL TEXT REFINEMENT INSTRUCTIONS (ALL STYLES):
            1. **STRICTLY REMOVE FLUFF:** You MUST remove all verbal tics, hesitations, and filler words.
            2. **CLEAN SYNTAX:** Repair broken sentences and linguistic crutches.
            3. **RECORDING MODE: ${recordingStyle.toUpperCase()}**
            ${recordingStyle === 'Interview' ? '- IDENTIFY SPEAKERS: Differentiate between voices if possible.' : '- MONOLOGUE: Treat this as a single cohesive stream of thought.'}

            CRITICAL AUDIO ANALYSIS INSTRUCTIONS:
            1. Listen for Tone: Analyze the speaker's prosody.
            2. Respect Pauses: Use punctuation to reflect the natural breathing.
            3. "Show, Don't Tell": Choose words that convey emotion.
            
            ${outputStyle !== 'Poetic / Verses' ? '4. FORMAT CONSTRAINT: Output in standard PROSE paragraphs. Do NOT produce poetry or verse unless explicitly instructed.' : ''}

            Context / Memory:
            "${currentMemory.slice(-2000)}"

            Configuration:
            - Target Language: ${outputLanguage}
            - Style Requirement: ${styleInstruction}
            
            Output:
            Return ONLY the refined text. No preambles or conversational filler.
          `;
      }
      
      // --- FORCE FILENAME RULE ---
      systemPrompt += `
      
      MANDATORY OUTPUT STRUCTURE:
      Line 1: Suggested filename for this content (concise, valid chars, no extension, no "Filename:" prefix).
      Line 2: [Empty]
      Line 3+: The actual content.
      `;

      // FIX: Payload structure simplified to prevent 500 errors on multimodal requests
      const response = await ai.models.generateContent({
        model: aiModel,
        config: {
            temperature: isPromptEngineeringMode ? 0.2 : isVerbatimMode ? 0.1 : 0.4, 
        },
        contents: {
            parts: [
                { inlineData: { mimeType: audioBlob.type || 'audio/webm', data: base64Audio } },
                { text: systemPrompt }
            ]
        }
      });

      const text = response.text || "";
      const cleanedText = text.trim();
      setTranscription(cleanedText);
      
      // Update Context Memory (RAG-lite)
      const updatedMemory = (currentMemory + "\n" + cleanedText).slice(-5000); 
      setContextMemory(prev => ({
        ...prev,
        [activeContext]: updatedMemory
      }));

      // Async DB Update (Fire & Forget for better UI responsiveness, but logged)
      saveContextToDB({
          name: activeContext,
          memory: updatedMemory,
          lastUpdated: Date.now()
      }).then(() => {
          // Silent success
      }).catch(e => console.error("Auto-save failed", e));


      // Calculate Stats
      const endTime = performance.now();
      const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
      const charCount = cleanedText.length;
      const wpm = 200; // Average reading speed
      const readingTimeVal = Math.ceil(wordCount / wpm);
      
      const newStats: ProcessingStats = {
        processingTime: endTime - startTime,
        audioDuration: recordingStartTime > 0 ? (Date.now() - recordingStartTime) / 1000 : 0, // Approx for recording
        inputSize: audioBlob.size,
        wordCount: wordCount,
        charCount: charCount,
        readingTime: `${readingTimeVal} min read`,
        appliedStyle: outputStyle
      };
      
      setLastStats(newStats);

      // Add to history (robust persistence via Tauri Store)
      setHistory(prev => [{
        text: cleanedText,
        date: new Date().toISOString(),
        id: generateHistoryId()
      }, ...prev].slice(0, MAX_HISTORY_ITEMS));
      addLog("Processing complete & Memory secured.", 'success');

    } catch (err: any) {
      console.error(err);
      addLog(`Error: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- TTS: Read Text Aloud ---
  const handleReadText = async () => {
    if (!transcription.trim()) {
      addLog('Nenhum texto para ler', 'error');
      return;
    }

    // Stop current playback if any
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (ttsAudioUrl) {
      URL.revokeObjectURL(ttsAudioUrl);
      setTtsAudioUrl(null);
    }

    setIsSpeaking(true);
    addLog('Sintetizando audio...', 'info');

    try {
      // Build request body based on TTS settings
      const requestBody: Record<string, unknown> = {
        text: transcription,
        voice: ttsEngine === 'chatterbox' ? 'cloned' : 'pt-br-faber-medium',
        preprocess: true,
      };

      if (ttsEngine === 'chatterbox') {
        if (ttsProfile === 'custom') {
          requestBody.params = ttsCustomParams;
        } else {
          requestBody.profile = ttsProfile;
        }
        if (voiceRefAudio) {
          requestBody.voice_ref = voiceRefAudio;
        }
      }

      const response = await fetch(`${whisperServerUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Erro desconhecido' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      setTtsAudioUrl(audioUrl);

      // Create and play audio
      const audio = new Audio(audioUrl);
      ttsAudioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        addLog('Leitura concluida', 'success');
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        addLog('Erro ao reproduzir audio', 'error');
      };

      await audio.play();
      addLog('Reproduzindo...', 'success');

    } catch (err: any) {
      console.error('TTS Error:', err);
      addLog(`Erro TTS: ${err.message}`, 'error');
      setIsSpeaking(false);
    }
  };

  const stopReadText = () => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
      ttsAudioRef.current = null;
    }
    setIsSpeaking(false);
    addLog('Leitura interrompida', 'info');
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div
        className="flex items-center justify-center w-full h-screen"
        style={{ backgroundColor: bgColor, color: textColor, fontFamily: fontFamily }}
      >
        <div className="w-full max-w-sm p-8 bg-white/5 border border-white/10 rounded-lg">
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}aa)` }}
            >
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold">Pro ATT Machine</h1>
            <p className="text-xs opacity-50 mt-1">v0.2.0</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] opacity-60 mb-1 block">Usuario</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="MCBS ou PGR"
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-sm focus:outline-none focus:border-white/30"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] opacity-60 mb-1 block">Senha</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="********"
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-sm focus:outline-none focus:border-white/30"
              />
            </div>

            {loginError && (
              <p className="text-xs text-red-400 text-center">{loginError}</p>
            )}

            <button
              onClick={handleLogin}
              className="w-full py-2.5 rounded font-medium text-sm transition-colors"
              style={{ backgroundColor: themeColor, color: 'white' }}
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
        className="flex w-full overflow-hidden select-none flex-col relative transition-colors duration-300"
        style={{
          backgroundColor: bgColor,
          color: textColor,
          fontFamily: fontFamily,
          height: '100%',
          // CSS Variables para o design system
          ['--bg-base' as string]: bgColor,
          ['--bg-elevated' as string]: 'rgba(0,0,0,0.2)',
          ['--bg-overlay' as string]: 'rgba(255,255,255,0.05)',
          ['--text-primary' as string]: textColor,
          ['--text-secondary' as string]: 'rgba(255,255,255,0.5)',
          ['--border-subtle' as string]: 'rgba(255,255,255,0.1)',
          ['--accent' as string]: themeColor,
          ['--accent-dim' as string]: `${themeColor}20`,
          ['--radius-sm' as string]: '4px',
          ['--radius-md' as string]: '8px',
          ['--sat' as string]: 'env(safe-area-inset-top, 0px)',
          ['--sal' as string]: 'env(safe-area-inset-left, 0px)',
          ['--sar' as string]: 'env(safe-area-inset-right, 0px)',
          ['--sab' as string]: 'env(safe-area-inset-bottom, 0px)',
        } as React.CSSProperties}
    >
      {updateStatus === 'downloading' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.85)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: '#fff',
        }}>
          <span>Baixando v{updateVersion}...</span>
          <div style={{
            flex: 1,
            height: '4px',
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${updateProgress}%`,
              backgroundColor: themeColor,
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span>{Math.round(updateProgress)}%</span>
        </div>
      )}
      <AppLayout
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        isProcessing={isProcessing}
        editor={
          <Editor
            value={transcription}
            onChange={setTranscription}
            isProcessing={isProcessing}
            isSpeaking={isSpeaking}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            onClear={() => { setTranscription(''); saveAudioToDB(null); setAudioBlob(null); }}
            onCopy={() => { navigator.clipboard.writeText(transcription); addLog('Copied', 'success'); }}
            onExportTxt={() => handleDownloadText('txt')}
            onExportMd={() => handleDownloadText('md')}
            onReadText={handleReadText}
            onStopReading={stopReadText}
            canRead={sidecarAvailable && !!transcription}
            outputStyle={outputStyle}
            activeContext={activeContext}
            aiModel={aiModel}
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
            contextPools={contextPools}
            activeContext={activeContext}
            onContextChange={setActiveContext}
            onAddContext={handleAddContext}
            onOpenMemory={openMemoryEditor}
            outputLanguage={outputLanguage}
            onLanguageChange={setOutputLanguage}
            outputStyle={outputStyle}
            onStyleChange={setOutputStyle}
            customStylePrompt={customStylePrompt}
            onCustomStyleChange={setCustomStylePrompt}
            isProcessing={isProcessing}
            onProcess={processAudio}
            audioVisualizer={<AudioVisualizer stream={audioStream} />}
            selectedMicLabel={selectedMicId === 'default' ? 'Default Mic' : availableMics.find(m => m.deviceId === selectedMicId)?.label?.slice(0, 15)}
            autoGainControl={autoGainControl}
          />
        }
        panelTTS={
          <PanelTTS
            isSpeaking={isSpeaking}
            canSpeak={sidecarAvailable}
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
            currentUser={currentUser}
            onLogout={handleLogout}
            apiKey={apiKey}
            apiKeyInput={apiKeyInput}
            onApiKeyInputChange={setApiKeyInput}
            onSaveApiKey={async () => { await saveApiKey(apiKeyInput.trim()); setApiKey(apiKeyInput.trim()); addLog('API Key saved', 'success'); }}
            isApiKeyVisible={isApiKeyVisible}
            onToggleApiKeyVisibility={() => setIsApiKeyVisible(!isApiKeyVisible)}
            availableMics={availableMics}
            selectedMicId={selectedMicId}
            onMicChange={setSelectedMicId}
            noiseSuppression={noiseSuppression}
            onNoiseSuppressionChange={setNoiseSuppression}
            echoCancellation={echoCancellation}
            onEchoCancellationChange={setEchoCancellation}
            autoGainControl={autoGainControl}
            onAutoGainControlChange={setAutoGainControl}
            aiModel={aiModel}
            onAiModelChange={setAiModel}
            transcriptionMode={transcriptionMode}
            onTranscriptionModeChange={setTranscriptionMode}
            sidecarAvailable={sidecarAvailable}
            sidecarStatus={sidecarStatus}
            whisperServerUrl={whisperServerUrl}
            onWhisperServerUrlChange={setWhisperServerUrl}
            onTestWhisperServer={testWhisperServer}
            whisperTestStatus={whisperTestStatus}
            whisperTestMessage={whisperTestMessage}
          />
        }
      />

       {/* SETTINGS MODAL */}
       {isSettingsOpen && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                        <Settings className="w-4 h-4" style={{color: themeColor}} />
                        System Configuration
                    </h2>
                    <div className="flex items-center gap-3">
                        {currentUser && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] opacity-50">Logado como</span>
                                <span className="text-xs font-bold" style={{color: themeColor}}>{currentUser}</span>
                                <button
                                    onClick={handleLogout}
                                    className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 bg-red-500/10 rounded"
                                >
                                    <LogOut className="w-3 h-3" />
                                    Sair
                                </button>
                            </div>
                        )}
                        <button onClick={() => setIsSettingsOpen(false)} className="opacity-50 hover:opacity-100">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-8">

                    {/* SECTION 0: API KEY CONFIGURATION */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
                            <Key className="w-3 h-3" /> Gemini API Key
                        </h3>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type={isApiKeyVisible ? "text" : "password"}
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    placeholder="Cole sua API Key aqui..."
                                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                                />
                                <button
                                    onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
                                >
                                    {isApiKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <button
                                onClick={async () => {
                                    if (apiKeyInput.trim()) {
                                        await saveApiKey(apiKeyInput.trim());
                                        setApiKey(apiKeyInput.trim());
                                        addLog('API Key salva com sucesso', 'success');
                                    }
                                }}
                                disabled={!apiKeyInput.trim() || apiKeyInput === apiKey}
                                className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                Salvar
                            </button>
                        </div>
                        <p className="text-[10px] text-white/40">
                            Obtenha sua API Key em: aistudio.google.com/apikey
                        </p>
                    </div>

                    <div className="border-t border-white/10 my-3" />

                    {/* SECTION 1: AUDIO ENGINE */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
                            <Mic className="w-3 h-3" /> Audio Engine
                        </h3>
                        
                        <div className="grid md:grid-cols-2 gap-4">
                             <div className="md:col-span-2">
                                <label className="text-[10px] opacity-60 mb-1.5 block">Input Device</label>
                                <div className="relative">
                                    <select 
                                        value={selectedMicId}
                                        onChange={(e) => setSelectedMicId(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-sm py-2 px-3 text-xs focus:outline-none transition-colors appearance-none"
                                    >
                                        <option value="default">System Default</option>
                                        {availableMics.map(mic => (
                                            <option key={mic.deviceId} value={mic.deviceId}>
                                                {mic.label || `Microphone ${mic.deviceId.slice(0, 5)}...`}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronRight className="absolute right-3 top-2.5 w-3 h-3 opacity-50 pointer-events-none rotate-90" />
                                </div>
                             </div>

                             <div className="flex items-center justify-between p-3 bg-white/5 rounded-sm border border-white/5">
                                 <div>
                                     <p className="text-xs font-medium">Noise Suppression</p>
                                     <p className="text-[10px] opacity-50">Filter background static</p>
                                 </div>
                                 <button 
                                    onClick={() => setNoiseSuppression(!noiseSuppression)}
                                    className={`w-10 h-5 rounded-full relative transition-colors ${noiseSuppression ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                 >
                                     <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${noiseSuppression ? 'left-6' : 'left-1'}`} />
                                 </button>
                             </div>

                             <div className="flex items-center justify-between p-3 bg-white/5 rounded-sm border border-white/5">
                                 <div>
                                     <p className="text-xs font-medium">Echo Cancellation</p>
                                     <p className="text-[10px] opacity-50">Prevent audio feedback</p>
                                 </div>
                                 <button 
                                    onClick={() => setEchoCancellation(!echoCancellation)}
                                    className={`w-10 h-5 rounded-full relative transition-colors ${echoCancellation ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                 >
                                     <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${echoCancellation ? 'left-6' : 'left-1'}`} />
                                 </button>
                             </div>

                             <div className="flex items-center justify-between p-3 bg-white/5 rounded-sm border border-white/5">
                                 <div>
                                     <p className="text-xs font-medium">Auto Gain Control</p>
                                     <p className="text-[10px] opacity-50">Normalize volume levels</p>
                                 </div>
                                 <button 
                                    onClick={() => setAutoGainControl(!autoGainControl)}
                                    className={`w-10 h-5 rounded-full relative transition-colors ${autoGainControl ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                 >
                                     <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${autoGainControl ? 'left-6' : 'left-1'}`} />
                                 </button>
                             </div>
                        </div>
                    </div>

                    <div className="w-full h-px bg-white/5"></div>

                    {/* SECTION 2: INTELLIGENCE */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
                                <Cpu className="w-3 h-3" /> Intelligence Model
                            </h3>
                            <button
                                onClick={() => setIsResetConfirmOpen(true)}
                                className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                            >
                                <LogOut className="w-3 h-3" />
                                Reset API Key
                            </button>
                        </div>
                        
                        <div>
                             <label className="text-[10px] opacity-60 mb-1.5 block">Gemini Version</label>
                             <div className="grid grid-cols-2 gap-2">
                                 {[
                                     { id: 'gemini-2.5-flash', label: '2.5 Flash', desc: 'Fastest' },
                                     { id: 'gemini-2.5-pro', label: '2.5 Pro', desc: 'Balanced' },
                                     { id: 'gemini-3-flash-preview', label: '3.0 Flash', desc: 'Next Gen Speed' },
                                     { id: 'gemini-3-pro-preview', label: '3.0 Pro', desc: 'Max Reasoning' },
                                 ].map((model) => (
                                     <button
                                        key={model.id}
                                        onClick={() => setAiModel(model.id)}
                                        className={`flex flex-col items-start p-3 rounded-sm border transition-all text-left ${
                                            aiModel === model.id 
                                            ? 'bg-white/10 border-white/30' 
                                            : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
                                        }`}
                                        style={aiModel === model.id ? { borderColor: themeColor } : {}}
                                     >
                                         <span className="text-xs font-bold">{model.label}</span>
                                         <span className="text-[9px] opacity-50">{model.desc}</span>
                                     </button>
                                 ))}
                             </div>
                        </div>

                        <div>
                            <label className="text-[10px] opacity-60 mb-1.5 block">Transcription Engine</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'auto' as TranscriptionMode, label: 'Auto', desc: sidecarAvailable ? 'Local' : 'Cloud' },
                                    { id: 'local' as TranscriptionMode, label: 'Local', desc: 'Whisper' },
                                    { id: 'cloud' as TranscriptionMode, label: 'Cloud', desc: 'Gemini' },
                                ].map((mode) => (
                                    <button
                                       key={mode.id}
                                       onClick={() => setTranscriptionMode(mode.id)}
                                       disabled={mode.id === 'local' && !sidecarAvailable}
                                       className={`flex flex-col items-start p-3 rounded-sm border transition-all text-left ${
                                           transcriptionMode === mode.id
                                           ? 'bg-white/10 border-white/30'
                                           : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
                                       } ${mode.id === 'local' && !sidecarAvailable ? 'cursor-not-allowed opacity-30' : ''}`}
                                       style={transcriptionMode === mode.id ? { borderColor: themeColor } : {}}
                                    >
                                        <span className="text-xs font-bold">{mode.label}</span>
                                        <span className="text-[9px] opacity-50">{mode.desc}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="text-[9px] opacity-40 mt-2">
                                Status: {sidecarStatus}
                            </p>
                        </div>

                        {/* Whisper Server URL */}
                        <div>
                            <label className="text-[10px] opacity-60 mb-1.5 block">Whisper Server</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={whisperServerUrl}
                                    onChange={(e) => setWhisperServerUrl(e.target.value)}
                                    placeholder="http://100.114.203.28:8765"
                                    className="flex-1 px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-sm focus:outline-none focus:border-white/30"
                                />
                                <button
                                    onClick={testWhisperServer}
                                    disabled={whisperTestStatus === 'testing'}
                                    className="px-3 py-2 text-xs bg-white/10 border border-white/10 rounded-sm hover:bg-white/20 transition-colors disabled:opacity-50"
                                >
                                    {whisperTestStatus === 'testing' ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        'Testar'
                                    )}
                                </button>
                            </div>
                            <p className={`text-[9px] mt-1.5 ${
                                whisperTestStatus === 'success' ? 'text-green-400' :
                                whisperTestStatus === 'error' ? 'text-red-400' :
                                'opacity-40'
                            }`}>
                                {whisperTestStatus === 'idle'
                                    ? 'URL do servidor Whisper na VM'
                                    : whisperTestMessage}
                            </p>
                        </div>
                    </div>

                    <div className="w-full h-px bg-white/5"></div>

                    {/* SECTION 2.5: TTS SETTINGS */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
                            <Volume2 className="w-3 h-3" /> Text-to-Speech
                        </h3>

                        {/* Engine Selection */}
                        <div>
                            <label className="text-[10px] opacity-60 mb-1.5 block">TTS Engine</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setTtsEngine('chatterbox')}
                                    className={`flex flex-col items-start p-3 rounded-sm border transition-all text-left ${
                                        ttsEngine === 'chatterbox'
                                        ? 'bg-white/10 border-white/30'
                                        : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
                                    }`}
                                    style={ttsEngine === 'chatterbox' ? { borderColor: themeColor } : {}}
                                >
                                    <span className="text-xs font-bold">Chatterbox</span>
                                    <span className="text-[9px] opacity-50">Natural, clonagem de voz</span>
                                </button>
                                <button
                                    onClick={() => setTtsEngine('piper')}
                                    className={`flex flex-col items-start p-3 rounded-sm border transition-all text-left ${
                                        ttsEngine === 'piper'
                                        ? 'bg-white/10 border-white/30'
                                        : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
                                    }`}
                                    style={ttsEngine === 'piper' ? { borderColor: themeColor } : {}}
                                >
                                    <span className="text-xs font-bold">Piper</span>
                                    <span className="text-[9px] opacity-50">Local, rapido</span>
                                </button>
                            </div>
                        </div>

                        {/* Chatterbox-specific settings */}
                        {ttsEngine === 'chatterbox' && (
                            <>
                                {/* Profile Selection */}
                                <div>
                                    <label className="text-[10px] opacity-60 mb-1.5 block">Profile</label>
                                    <div className="relative">
                                        <select
                                            value={ttsProfile}
                                            onChange={(e) => setTtsProfile(e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-sm py-2 px-3 text-xs focus:outline-none transition-colors appearance-none"
                                        >
                                            <option value="standard">Standard</option>
                                            <option value="legal">Legal (Formal)</option>
                                            <option value="expressive">Expressive</option>
                                            <option value="fast_preview">Fast Preview</option>
                                            <option value="custom">Custom</option>
                                        </select>
                                        <ChevronRight className="absolute right-3 top-2.5 w-3 h-3 opacity-50 pointer-events-none rotate-90" />
                                    </div>
                                </div>

                                {/* Custom Parameters */}
                                {ttsProfile === 'custom' && (
                                    <div className="space-y-3 p-3 bg-black/20 rounded-sm border border-white/5">
                                        {/* Exaggeration */}
                                        <div>
                                            <div className="flex justify-between text-[10px] mb-1">
                                                <span className="opacity-60">Expressividade</span>
                                                <span className="opacity-40">{ttsCustomParams.exaggeration.toFixed(1)}</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="2" step="0.1"
                                                value={ttsCustomParams.exaggeration}
                                                onChange={(e) => setTtsCustomParams(p => ({...p, exaggeration: parseFloat(e.target.value)}))}
                                                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                                                style={{ accentColor: themeColor }}
                                            />
                                            <p className="text-[9px] opacity-30 mt-0.5">0=monotono, 2=dramatico</p>
                                        </div>

                                        {/* Speed */}
                                        <div>
                                            <div className="flex justify-between text-[10px] mb-1">
                                                <span className="opacity-60">Velocidade</span>
                                                <span className="opacity-40">{ttsCustomParams.speed.toFixed(1)}x</span>
                                            </div>
                                            <input
                                                type="range" min="0.5" max="2" step="0.1"
                                                value={ttsCustomParams.speed}
                                                onChange={(e) => setTtsCustomParams(p => ({...p, speed: parseFloat(e.target.value)}))}
                                                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                                                style={{ accentColor: themeColor }}
                                            />
                                        </div>

                                        {/* Stability */}
                                        <div>
                                            <div className="flex justify-between text-[10px] mb-1">
                                                <span className="opacity-60">Estabilidade</span>
                                                <span className="opacity-40">{ttsCustomParams.stability.toFixed(1)}</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="1" step="0.1"
                                                value={ttsCustomParams.stability}
                                                onChange={(e) => setTtsCustomParams(p => ({...p, stability: parseFloat(e.target.value)}))}
                                                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                                                style={{ accentColor: themeColor }}
                                            />
                                            <p className="text-[9px] opacity-30 mt-0.5">0=variavel, 1=uniforme</p>
                                        </div>

                                        {/* Steps */}
                                        <div>
                                            <div className="flex justify-between text-[10px] mb-1">
                                                <span className="opacity-60">Qualidade</span>
                                                <span className="opacity-40">{ttsCustomParams.steps} steps</span>
                                            </div>
                                            <input
                                                type="range" min="4" max="20" step="1"
                                                value={ttsCustomParams.steps}
                                                onChange={(e) => setTtsCustomParams(p => ({...p, steps: parseInt(e.target.value)}))}
                                                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                                                style={{ accentColor: themeColor }}
                                            />
                                            <p className="text-[9px] opacity-30 mt-0.5">4=rapido, 20=alta qualidade</p>
                                        </div>

                                        {/* Sentence Silence */}
                                        <div>
                                            <div className="flex justify-between text-[10px] mb-1">
                                                <span className="opacity-60">Pausa entre frases</span>
                                                <span className="opacity-40">{ttsCustomParams.sentence_silence.toFixed(1)}s</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="1" step="0.1"
                                                value={ttsCustomParams.sentence_silence}
                                                onChange={(e) => setTtsCustomParams(p => ({...p, sentence_silence: parseFloat(e.target.value)}))}
                                                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                                                style={{ accentColor: themeColor }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Voice Cloning */}
                                <div className="p-3 bg-black/20 rounded-sm border border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] opacity-60">Clonagem de Voz</span>
                                        {voiceRefAudio && (
                                            <button
                                                onClick={() => setVoiceRefAudio(null)}
                                                className="text-[9px] text-red-400 hover:text-red-300"
                                            >
                                                Remover
                                            </button>
                                        )}
                                    </div>
                                    {voiceRefAudio ? (
                                        <div className="flex items-center gap-2 text-xs text-green-400">
                                            <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                            Audio carregado
                                        </div>
                                    ) : (
                                        <div>
                                            <p className="text-[9px] opacity-40 mb-2">
                                                Importe audio de 5-15s da voz a clonar.
                                            </p>
                                            <input
                                                type="file"
                                                accept="audio/*"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const buffer = await file.arrayBuffer();
                                                        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                                                        setVoiceRefAudio(base64);
                                                    }
                                                }}
                                                className="text-[10px] file:mr-2 file:py-1 file:px-2 file:rounded-sm file:border-0 file:text-[10px] file:bg-white/10 file:text-white/60 hover:file:bg-white/20"
                                            />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="w-full h-px bg-white/5"></div>

                    {/* SECTION 3: APPEARANCE */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
                            <Monitor className="w-3 h-3" /> Interface Design
                        </h3>
                        
                         <div className="flex gap-4">
                            <div className="flex-1 space-y-1">
                                <label className="text-[10px] opacity-60 block">Accent Color</label>
                                <div className="h-9 w-full rounded-sm overflow-hidden relative border border-white/10">
                                    <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="absolute -top-2 -left-2 w-[150%] h-[150%] cursor-pointer bg-transparent"/>
                                </div>
                            </div>
                            <div className="flex-1 space-y-1">
                                <label className="text-[10px] opacity-60 block">Background</label>
                                <div className="h-9 w-full rounded-sm overflow-hidden relative border border-white/10">
                                    <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="absolute -top-2 -left-2 w-[150%] h-[150%] cursor-pointer bg-transparent"/>
                                </div>
                            </div>
                            <div className="flex-1 space-y-1">
                                <label className="text-[10px] opacity-60 block">Text Color</label>
                                <div className="h-9 w-full rounded-sm overflow-hidden relative border border-white/10">
                                    <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="absolute -top-2 -left-2 w-[150%] h-[150%] cursor-pointer bg-transparent"/>
                                </div>
                            </div>
                        </div>

                        <div>
                             <label className="text-[10px] opacity-60 mb-2 block">Typography</label>
                             <div className="flex gap-2">
                                {['IBM Plex Sans', 'JetBrains Mono', 'Georgia'].map((font) => (
                                    <button
                                        key={font}
                                        onClick={() => setFontFamily(font as FontStyle)}
                                        className={`flex-1 py-2 text-xs rounded-sm border transition-all ${
                                            fontFamily === font 
                                            ? 'bg-white/10 border-white/30 text-white' 
                                            : 'bg-white/5 border-white/5 text-zinc-500 hover:text-zinc-300'
                                        }`}
                                        style={{ fontFamily: font }}
                                    >
                                        {font.split(' ')[0]}
                                    </button>
                                ))}
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* API RESET CONFIRMATION MODAL */}
      {isResetConfirmOpen && (
          <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
              <div className="w-full max-w-sm bg-zinc-900 border border-red-500/30 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-red-500/10 p-4 border-b border-red-500/20 flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <h3 className="text-sm font-bold text-red-100">Reset API Key?</h3>
                  </div>
                  <div className="p-5 space-y-4">
                      <p className="text-xs opacity-70 leading-relaxed">
                          This action will clear any stored API credentials and force a re-authentication. 
                          The page will reload, and you will need to select or provide your API key again.
                      </p>
                      <div className="flex gap-3 pt-2">
                          <button 
                              onClick={() => setIsResetConfirmOpen(false)}
                              className="flex-1 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 rounded-sm transition-colors"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={handleResetApiKey}
                              className="flex-1 py-2 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-sm transition-colors shadow-lg"
                          >
                              Confirm Reset
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

       {/* MEMORY EDITOR MODAL */}
       {isMemoryModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                        <Brain className="w-4 h-4" style={{color: themeColor}} />
                        Memory: {activeContext}
                    </h2>
                    <button onClick={() => setIsMemoryModalOpen(false)} className="opacity-50 hover:opacity-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 flex-1 overflow-hidden flex flex-col gap-2">
                    <p className="text-[11px] opacity-50">
                        This text is stored in an encrypted browser database. It is injected into every prompt for this context pool.
                    </p>
                    <textarea 
                        value={tempMemoryEdit}
                        onChange={(e) => setTempMemoryEdit(e.target.value)}
                        className="flex-1 w-full bg-black/20 border border-white/10 rounded-md p-3 text-xs font-mono focus:outline-none resize-none leading-relaxed"
                        placeholder="No memories yet. Start transcribing or add custom terms here..."
                    />
                </div>
                <div className="p-4 border-t border-white/10 flex justify-end gap-3">
                     <button 
                        onClick={() => setTempMemoryEdit('')}
                        className="px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
                    >
                        Clear Memory
                    </button>
                    <button 
                        onClick={saveMemory}
                        disabled={isSavingContext}
                        className="px-4 py-2 text-white text-xs font-medium rounded-sm transition-colors shadow-lg flex items-center gap-2"
                        style={{ backgroundColor: themeColor }}
                    >
                        {isSavingContext ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}