import React, { useState, useRef, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { GoogleGenAI } from "@google/genai";
import { VoiceAIClient, type TranscribeResponse, type OutputStyle as SidecarOutputStyle, ensureSidecarRunning, setVoiceAIUrl, getVoiceAIUrl, getVoiceAIClient, isRemoteServer } from './src/services/VoiceAIClient';
import {
  Loader2,
  Trash2,
  Copy,
  ChevronRight,
  Check,
  Plus,
  Terminal,
  FolderOpen,
  X,
  FileAudio,
  Brain,
  Zap,
  Save,
  Feather,
  Activity,
  Mic,
  Settings,
  Minus,
  Users,
  Cpu,
  Monitor,
  LogOut,
  AlertTriangle,
  Key,
  Eye,
  EyeOff
} from 'lucide-react';

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


// --- CUSTOM ICONS (Technical / Hard Surface Design) ---

// Redesigned: Input/Creation Terminal
const IconWorkspace = ({ className, active }: { className?: string, active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <rect x="3" y="4" width="18" height="16" rx="2" stroke={active ? "currentColor" : "currentColor"} className="opacity-90"/>
    <path d="M7 12h2" strokeLinecap="round" strokeWidth="2" className={active ? "text-indigo-400" : "text-zinc-500"} />
    <path d="M7 8l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 8h18" className="opacity-20" />
  </svg>
);

const IconAudio = ({ className, active }: { className?: string, active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M2 12C2 12 5 8 8 8C11 8 11 16 14 16C17 16 22 10 22 10" strokeLinecap="round" strokeLinejoin="round"/>
    {active && <circle cx="2" cy="12" r="2" className="fill-current opacity-20 animate-ping" />}
  </svg>
);

const IconStats = ({ className, active }: { className?: string, active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <circle cx="12" cy="12" r="9" className="opacity-20" />
    <path d="M12 12L16 8M12 12L8 8M12 12L12 17" strokeLinecap="round" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

const IconHistory = ({ className, active }: { className?: string, active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M12 4V12L16 14" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3" strokeLinecap="round" strokeLinejoin="round" className="opacity-60"/>
    <path d="M3 12H5" strokeLinecap="round"/>
  </svg>
);

const IconEditor = ({ className, active }: { className?: string, active?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M14.5 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V7.5L14.5 2Z" className="opacity-50"/>
    <path d="M14 2V8H20" strokeLinejoin="round"/>
    <path d="M8 13H16" strokeLinecap="round"/>
    <path d="M8 17H12" strokeLinecap="round"/>
    {active && <path d="M16 17H16.01" strokeWidth="3" className="text-indigo-400"/>}
  </svg>
);

const IconUpload = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M4 16V17C4 19.2091 5.79086 21 8 21H16C18.2091 21 20 19.2091 20 17V16" strokeLinecap="round"/>
    <path d="M12 15V3M12 3L8 7M12 3L16 7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconSettings = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M10 8H20M4 8H6" strokeLinecap="round"/>
    <path d="M14 16H20M4 16H10" strokeLinecap="round"/>
    <circle cx="8" cy="8" r="2" />
    <circle cx="12" cy="16" r="2" />
  </svg>
);

const IconMagic = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M12 3V5M12 19V21M3 12H5M19 12H21" strokeLinecap="round"/>
    <path d="M5.63604 5.63604L7.05025 7.05025M16.9497 16.9497L18.364 18.364" strokeLinecap="round"/>
    <path d="M5.63604 18.364L7.05025 16.9497M16.9497 7.05025L18.364 5.63604" strokeLinecap="round"/>
    <path d="M12 8L12 16" strokeLinecap="round"/>
  </svg>
);

const IconDownload = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M21 15V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V15" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 10L12 15L17 10" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconMarkdown = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" strokeLinejoin="round"/>
    <path d="M14 2V8H20" strokeLinejoin="round"/>
    <path d="M12 18V12" strokeLinecap="round"/>
    <path d="M9 15L12 12L15 15" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 9H16" className="opacity-0" /> 
  </svg>
);

// --- TYPES ---
type SidebarTab = 'workspace' | 'audio' | 'stats' | 'history';
type MobileView = 'tools' | 'editor';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('workspace');
  const [mobileView, setMobileView] = useState<MobileView>('tools'); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

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

  // Persist Effects
  useEffect(() => localStorage.setItem('gemini_outputLanguage', outputLanguage), [outputLanguage]);
  useEffect(() => localStorage.setItem('gemini_outputStyle', outputStyle), [outputStyle]);
  useEffect(() => localStorage.setItem('gemini_customStylePrompt', customStylePrompt), [customStylePrompt]);
  useEffect(() => localStorage.setItem('gemini_current_work', transcription), [transcription]);
  useEffect(() => localStorage.setItem('gemini_ai_model', aiModel), [aiModel]);

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
    const url = whisperServerUrl || 'http://localhost:8765';
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
          console.log(`Update available: ${update.version}`);

          // Auto-download
          setUpdateStatus('downloading');
          await update.downloadAndInstall((event) => {
            if (event.event === 'Progress') {
              const data = event.data as { chunkLength: number; contentLength?: number };
              if (data.contentLength && data.contentLength > 0) {
                setUpdateProgress(prev => {
                  const newProgress = prev + (data.chunkLength / data.contentLength!) * 100;
                  return Math.min(newProgress, 100);
                });
              }
            }
          });
          setUpdateStatus('ready');

          // Prompt user to restart
          if (confirm(`Nova versao ${update.version} instalada! Reiniciar agora?`)) {
            await relaunch();
          }
        } else {
          setUpdateStatus('idle');
        }
      } catch (e) {
        console.log('Update check failed (normal in dev):', e);
        setUpdateStatus('idle');
      }
    };

    // Check after 3 seconds to not block startup
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
      setWhisperTestMessage('URL vazia - usando sidecar local');
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
    setActiveTab('stats');

    // On Mobile, switch to editor view to see results coming in
    if (window.innerWidth < 768) {
      setMobileView('editor');
    }

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

  // --- COMPONENT: Icon Sidebar Item ---
  const SidebarIcon = ({ id, icon: Icon, tooltip, onClick }: { id: string, icon: any, tooltip: string, onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`relative group w-10 h-10 flex items-center justify-center rounded-md transition-all ${
        activeTab === id 
          ? 'bg-zinc-800 text-zinc-100 shadow-md border border-zinc-700' 
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
      }`}
    >
      <Icon className="w-6 h-6" active={activeTab === id} />
      {/* Tooltip - Desktop Only */}
      <div className="hidden md:block absolute left-14 bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-zinc-700 shadow-xl">
        {tooltip}
      </div>
      {activeTab === id && (
        <div className="hidden md:block absolute -left-[18px] top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full" style={{ backgroundColor: themeColor }} />
      )}
    </button>
  );

  return (
    <div
        className="flex w-full overflow-hidden select-none flex-col md:flex-row relative transition-colors duration-300"
        style={{
          backgroundColor: bgColor,
          color: textColor,
          fontFamily: fontFamily,
          height: '100%',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          boxSizing: 'border-box'
        }}
    >
      
      {/* 1. DESKTOP SIDEBAR (Hidden on Mobile) */}
      <aside className="hidden md:flex w-[68px] flex-col items-center py-4 bg-black/20 border-r border-white/5 z-30 gap-4 justify-between">
        <div className="flex flex-col items-center gap-4 w-full">
            <div className="mb-2">
                <div 
                    className="w-9 h-9 rounded-lg flex items-center justify-center shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}aa)` }}
                >
                    <IconMagic className="w-5 h-5 text-white" />
                </div>
            </div>
            
            <div className="flex-1 w-full flex flex-col items-center gap-4">
                <SidebarIcon id="workspace" icon={IconWorkspace} tooltip="Workspace" onClick={() => { setActiveTab('workspace'); setMobileView('tools'); }} />
                <div className="w-6 h-px bg-white/10 my-1"></div>
                <SidebarIcon id="audio" icon={IconAudio} tooltip="Signal Analysis" onClick={() => { setActiveTab('audio'); setMobileView('tools'); }} />
                <SidebarIcon id="stats" icon={IconStats} tooltip="Process Metrics" onClick={() => { setActiveTab('stats'); setMobileView('tools'); }} />
                <SidebarIcon id="history" icon={IconHistory} tooltip="History" onClick={() => { setActiveTab('history'); setMobileView('tools'); }} />
            </div>
        </div>

        <div className="mb-2">
             <button
                onClick={() => setIsSettingsOpen(true)}
                className="relative group w-10 h-10 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
            >
                <Settings className="w-6 h-6" />
                <div className="hidden md:block absolute left-14 bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-zinc-700 shadow-xl">
                    Settings
                </div>
            </button>
        </div>
      </aside>

      {/* 2. ACTION PANEL (The Tool View) */}
      {/* On Mobile: Visible only if mobileView === 'tools' */}
      <div className={`${mobileView === 'tools' ? 'flex' : 'hidden'} md:flex w-full md:w-[320px] bg-black/10 border-r border-white/5 flex-col z-20 h-full`}>
        
        {/* Header */}
        <div className="h-12 border-b border-white/5 flex items-center px-5 justify-between bg-black/20 shrink-0">
            <span className="text-xs font-semibold opacity-60 uppercase tracking-wider flex items-center gap-2">
                {activeTab === 'workspace' && <><IconWorkspace className="w-4 h-4"/> Action Center</>}
                {activeTab === 'audio' && <><IconAudio className="w-4 h-4"/> Signal Analysis</>}
                {activeTab === 'stats' && <><IconStats className="w-4 h-4"/> System Metrics</>}
                {activeTab === 'history' && <><IconHistory className="w-4 h-4"/> History</>}
            </span>
            
            {/* Mobile Settings Trigger */}
            <button onClick={() => setIsSettingsOpen(true)} className="md:hidden opacity-50 hover:opacity-100">
                <Settings className="w-4 h-4" />
            </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* WORKSPACE (Merged Input + Settings) */}
            {activeTab === 'workspace' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200 pb-20 md:pb-0">
                    
                    {/* CONTEXT POOL SELECTOR */}
                    <section className="space-y-3">
                         <div className="flex items-center justify-between">
                             <label className="text-[11px] font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
                                <span className="flex items-center gap-2"><FolderOpen className="w-3 h-3" /> Context Scope</span>
                            </label>
                            <button onClick={openMemoryEditor} className="text-[9px] flex items-center gap-1 hover:opacity-80 transition-colors" style={{color: themeColor}}>
                                <Brain className="w-3 h-3" />
                                Memory
                            </button>
                         </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                          {contextPools.map(ctx => (
                            <button
                              key={ctx}
                              onClick={() => setActiveContext(ctx)}
                              className={`flex-shrink-0 px-3 py-1.5 rounded-sm text-[10px] font-medium transition-all border ${
                                activeContext === ctx 
                                ? 'bg-opacity-10 border-opacity-100' 
                                : 'bg-white/5 border-white/10 opacity-50 hover:opacity-100'
                              }`}
                              style={activeContext === ctx ? { borderColor: themeColor, color: themeColor, backgroundColor: `${themeColor}20` } : {}}
                            >
                              {ctx}
                            </button>
                          ))}
                          <button
                            onClick={handleAddContext}
                            className="flex-shrink-0 w-7 flex items-center justify-center rounded-sm bg-white/5 border border-white/10 opacity-50 hover:opacity-100"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                    </section>

                    <div className="w-full h-px bg-white/10"></div>
                    
                    {/* Capture Section */}
                    <section className="space-y-3">
                        <label className="text-[11px] font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
                            <Mic className="w-3 h-3" /> Audio Input
                        </label>
                        
                         {/* Recording Style */}
                        <div className="flex gap-2 bg-white/5 p-1 rounded-sm border border-white/10">
                            {['Dictation', 'Interview'].map((style) => (
                                <button
                                    key={style}
                                    onClick={() => setRecordingStyle(style as RecordingStyle)}
                                    className={`flex-1 py-1.5 text-[10px] rounded-sm transition-all flex items-center justify-center gap-1.5 ${
                                        recordingStyle === style 
                                        ? 'bg-white/10 text-white font-medium' 
                                        : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                   {style === 'Dictation' ? <Mic className="w-3 h-3"/> : <Users className="w-3 h-3"/>}
                                   {style}
                                </button>
                            ))}
                        </div>
                        
                        <div className="bg-white/5 rounded-md border border-white/10 p-3 shadow-sm mt-2">
                            <div className="flex items-center gap-2 mb-3">
                                {!isRecording ? (
                                    <button 
                                        onClick={startRecording}
                                        className="flex-1 h-10 md:h-9 bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 rounded-sm text-xs font-medium flex items-center justify-center gap-2 transition-all hover:shadow-lg active:scale-95"
                                    >
                                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                        Record
                                    </button>
                                ) : (
                                    <button 
                                        onClick={stopRecording}
                                        className="flex-1 h-10 md:h-9 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-sm text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-95"
                                    >
                                        <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                                        Stop
                                    </button>
                                )}
                            </div>

                            {/* Integrated Visualizer */}
                            <div className="h-12 bg-black/40 rounded-sm border border-white/5 flex items-center justify-center overflow-hidden relative">
                                <AudioVisualizer stream={audioStream} />
                                {isRecording && (
                                     <div className="absolute top-1 right-2 flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                        <span className="text-[9px] text-red-400 font-mono tracking-tighter">LIVE</span>
                                     </div>
                                )}
                            </div>
                            
                            <div className="mt-2 text-[9px] text-zinc-500 flex justify-between">
                                <span>Using: {selectedMicId === 'default' ? 'Default Mic' : availableMics.find(m => m.deviceId === selectedMicId)?.label.slice(0, 15) + '...'}</span>
                                <span className="opacity-50">AGC {autoGainControl ? 'ON' : 'OFF'}</span>
                            </div>
                        </div>
                    </section>

                    {/* Upload Section */}
                    <section className="space-y-3">
                        <label className="text-[11px] font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
                            <IconUpload className="w-3 h-3" /> Import File
                        </label>
                         <label className="flex items-center justify-between w-full h-11 md:h-10 px-3 bg-white/5 border border-white/10 border-dashed rounded-sm cursor-pointer hover:bg-white/10 transition-colors group">
                            <span className="text-xs opacity-50 group-hover:opacity-80 truncate max-w-[180px]">
                                {audioBlob && 'name' in audioBlob ? (audioBlob as File).name : "Select MP3, WAV..."}
                            </span>
                            <ChevronRight className="w-3 h-3 opacity-50" />
                            <input type="file" className="hidden" accept="audio/*" onChange={handleFileUpload} />
                        </label>
                        {uploadError && <p className="text-[10px] text-red-400 pl-1">{uploadError}</p>}
                    </section>

                    <div className="w-full h-px bg-white/10"></div>

                    {/* Configuration Section */}
                    <section className="space-y-4">
                        <label className="text-[11px] font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
                            <IconSettings className="w-3 h-3" /> Output Settings
                        </label>
                        
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] opacity-40 mb-1.5 block">Target Language</label>
                                <div className="relative">
                                    <select 
                                        value={outputLanguage}
                                        onChange={(e) => setOutputLanguage(e.target.value as any)}
                                        className="w-full bg-white/5 border border-white/10 rounded-sm py-3 md:py-2 px-3 text-xs focus:outline-none transition-colors appearance-none"
                                    >
                                        <option value="English">English</option>
                                        <option value="Portuguese">Portuguese</option>
                                        <option value="Spanish">Spanish</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] opacity-40 mb-1.5 block">Prompt Style</label>
                                <div className="relative">
                                    <select 
                                        value={outputStyle}
                                        onChange={(e) => setOutputStyle(e.target.value as OutputStyle)}
                                        className="w-full bg-white/5 border border-white/10 rounded-sm py-3 md:py-2 px-3 text-xs focus:outline-none transition-colors appearance-none"
                                    >
                                        <option value="Whisper Only">Whisper Only (No Gemini)</option>
                                        <option value="Verbatim">Verbatim (Exact Transcription)</option>
                                        <option value="Elegant Prose">Elegant Prose</option>
                                        <option value="Ana Suy">Ana Suy (Poetic/Psychoanalytic)</option>
                                        <option value="Poetic / Verses">Poetic / Verses</option>
                                        <option value="Normal">Normal</option>
                                        <option value="Verbose">Verbose</option>
                                        <option value="Concise">Concise</option>
                                        <option value="Formal">Formal</option>
                                        <option value="Prompt (Claude)">Prompt (Claude)</option>
                                        <option value="Prompt (Gemini)">Prompt (Gemini)</option>
                                        <option value="Bullet Points">Bullet Points</option>
                                        <option value="Summary">Summary</option>
                                        <option value="Tech Docs">Tech Docs</option>
                                        <option value="Email">Email</option>
                                        <option value="Tweet Thread">Tweet Thread</option>
                                        <option value="Code Generator">Code Generator</option>
                                        <option value="Custom">Custom Instruction</option>
                                    </select>
                                </div>
                            </div>

                            {/* Custom Style Input */}
                            {outputStyle === 'Custom' && (
                                <div className="animate-in fade-in zoom-in-95 duration-200">
                                    <label className="text-[10px] opacity-40 mb-1.5 block flex justify-between">
                                        <span>Instructions</span>
                                        <span className={`${customStylePrompt.length > 150 ? 'text-red-400' : 'opacity-50'}`}>{customStylePrompt.length}/150</span>
                                    </label>
                                    <textarea
                                        value={customStylePrompt}
                                        onChange={(e) => setCustomStylePrompt(e.target.value.slice(0, 150))}
                                        placeholder="E.g. Explain like I'm five, prioritize verbs..."
                                        className="w-full h-20 bg-white/5 border border-white/10 rounded-sm p-3 text-xs focus:outline-none resize-none placeholder:opacity-30"
                                    />
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Action */}
                    <button
                        onClick={processAudio}
                        disabled={!audioBlob || isProcessing}
                        className={`w-full h-12 md:h-10 mt-2 rounded-sm font-medium text-xs flex items-center justify-center gap-2 transition-all active:scale-95 text-white shadow-lg`}
                        style={{
                            backgroundColor: !audioBlob || isProcessing ? '#3f3f46' : themeColor,
                            opacity: !audioBlob || isProcessing ? 0.5 : 1
                        }}
                    >
                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Zap className="w-3.5 h-3.5 fill-current"/>}
                        {isProcessing ? "Processing..." : (outputStyle === 'Verbatim' || outputStyle === 'Whisper Only') ? "Transcribe" : outputStyle === 'Code Generator' ? "Generate Code" : "Refine Text"}
                    </button>

                     {audioBlob && !isProcessing && (
                         <div className="flex items-center gap-2 justify-center text-[10px] opacity-50 mt-2">
                            <Check className="w-3 h-3 text-emerald-500" />
                            Ready: {(audioBlob.size / 1024).toFixed(1)} KB
                         </div>
                    )}
                </div>
            )}

            {/* AUDIO ANALYSIS PANEL */}
            {activeTab === 'audio' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-200">
                    {!audioMetrics ? (
                         <div className="h-full flex flex-col items-center justify-center opacity-40 min-h-[300px]">
                            <IconAudio className="w-8 h-8 mb-2" />
                            <p className="text-xs">No audio analyzed.</p>
                        </div>
                    ) : (
                        <>
                             {/* Audio Export Section */}
                            <div className="bg-white/5 p-4 rounded-sm border border-white/10 flex flex-col gap-3">
                                 <h3 className="text-[10px] uppercase opacity-50 font-bold tracking-wider flex items-center gap-2">
                                    <FileAudio className="w-3 h-3"/> Export Recording
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => handleAudioExport('wav')}
                                        className="flex flex-col items-center justify-center p-3 bg-black/20 border border-white/5 rounded-sm hover:bg-white/5 transition-all group"
                                    >
                                        <span className="text-xs font-bold opacity-80">WAV</span>
                                        <span className="text-[9px] opacity-50">High Quality</span>
                                    </button>
                                     <button 
                                        onClick={() => handleAudioExport('webm')}
                                        className="flex flex-col items-center justify-center p-3 bg-black/20 border border-white/5 rounded-sm hover:bg-white/5 transition-all group"
                                    >
                                        <span className="text-xs font-bold opacity-80">WEBM</span>
                                        <span className="text-[9px] opacity-50">Compressed</span>
                                    </button>
                                </div>
                            </div>

                            {/* Clarity Score - NEW FEATURE */}
                            <div className="bg-white/5 p-4 rounded-sm border border-white/10">
                                <h3 className="text-[10px] uppercase opacity-50 font-bold mb-3 tracking-wider flex items-center gap-2">
                                    <Activity className="w-3 h-3 text-emerald-400"/> Clarity & Intelligibility
                                </h3>
                                <div className="space-y-2">
                                    <div className="flex items-end justify-between">
                                        <span className="text-xs opacity-50">Speech Clarity Score</span>
                                        <span className={`text-xl font-mono font-bold ${audioMetrics.clarityScore > 75 ? 'text-emerald-400' : audioMetrics.clarityScore > 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                                            {audioMetrics.clarityScore.toFixed(0)}<span className="text-sm opacity-50">%</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-1000 ${audioMetrics.clarityScore > 75 ? 'bg-emerald-500' : audioMetrics.clarityScore > 40 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                                            style={{ width: `${audioMetrics.clarityScore}%` }}
                                        />
                                    </div>
                                    <p className="text-[9px] opacity-50 pt-1">
                                        {audioMetrics.clarityScore > 80 ? "Crystal clear audio. High accuracy expected." : 
                                         audioMetrics.clarityScore > 50 ? "Good quality. Minor background noise detected." : 
                                         "Low clarity. Transcription accuracy may be reduced."}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white/5 p-4 rounded-sm border border-white/10">
                                <h3 className="text-[10px] uppercase opacity-50 font-bold mb-3 tracking-wider flex items-center gap-2">
                                    Signal
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs opacity-50 mb-1">Silence</p>
                                        <p className="text-base font-mono opacity-90">{audioMetrics.silenceRatio.toFixed(1)}%</p>
                                    </div>
                                    <div>
                                        <p className="text-xs opacity-50 mb-1">Est. Pitch</p>
                                        <p className="text-base font-mono opacity-90 flex items-center gap-1">
                                           {audioMetrics.avgPitchHz > 0 ? audioMetrics.avgPitchHz.toFixed(0) : '--'} <span className="text-[10px] opacity-50">Hz</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                             <div className="bg-white/5 p-4 rounded-sm border border-white/10">
                                <h3 className="text-[10px] uppercase opacity-50 font-bold mb-3 tracking-wider flex items-center gap-2">
                                    Format
                                </h3>
                                <div className="space-y-2 font-mono text-xs">
                                    <div className="flex justify-between"><span className="opacity-50">Rate</span> <span>{audioMetrics.sampleRate} Hz</span></div>
                                    <div className="flex justify-between"><span className="opacity-50">Ch</span> <span>{audioMetrics.channels}</span></div>
                                    <div className="flex justify-between"><span className="opacity-50">Dur</span> <span>{audioMetrics.duration.toFixed(2)}s</span></div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* STATS PANEL */}
            {activeTab === 'stats' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-200">
                    {!lastStats ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-40 min-h-[300px]">
                            <IconStats className="w-8 h-8 mb-2" />
                            <p className="text-xs">No process data.</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white/5 p-4 rounded-sm border border-white/10">
                                <h3 className="text-[10px] uppercase opacity-50 font-bold mb-3 tracking-wider">Metrics</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs opacity-50 mb-1">Words</p>
                                        <p className="text-base font-mono">{lastStats.wordCount}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs opacity-50 mb-1">Characters</p>
                                        <p className="text-base font-mono">{lastStats.charCount}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs opacity-50 mb-1">Reading Time</p>
                                        <p className="text-base font-mono">{lastStats.readingTime}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs opacity-50 mb-1">Latency</p>
                                        <p className="text-base font-mono">{(lastStats.processingTime / 1000).toFixed(2)}s</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white/5 p-4 rounded-sm border border-white/10">
                                <h3 className="text-[10px] uppercase opacity-50 font-bold mb-3 tracking-wider">Applied Configuration</h3>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="opacity-50">Style Applied</span>
                                        <span className="font-medium text-emerald-400">{lastStats.appliedStyle}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="opacity-50">Input Size</span>
                                        <span className="font-mono opacity-80">{(lastStats.inputSize / 1024).toFixed(1)} KB</span>
                                    </div>
                                </div>
                            </div>

                             <div className="bg-black/20 p-3 rounded-sm border border-white/10 mt-4">
                                <div className="flex items-center gap-2 mb-2 border-b border-white/10 pb-2">
                                    <span className="text-[10px] font-mono opacity-50">LIVE LOGS</span>
                                </div>
                                <div className="font-mono text-[10px] space-y-1.5 max-h-48 overflow-y-auto">
                                    {logs.map((log, i) => (
                                        <div key={i} className={`truncate ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'opacity-40'}`}>
                                            <span className="opacity-30 mr-2">[{new Date().toLocaleTimeString().split(' ')[0]}]</span>
                                            {log.msg}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
            
            {/* HISTORY PANEL */}
            {activeTab === 'history' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-left-2 duration-200">
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono opacity-40">{history.length} item{history.length !== 1 ? 's' : ''}</span>
                        {isTauri() && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">Synced</span>}
                     </div>
                     {history.map((item) => (
                        <div
                            key={item.id}
                            className="group bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 p-3 rounded-sm transition-all relative"
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] opacity-50 font-mono">
                                    {new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString()}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setHistory(prev => prev.filter(h => h.id !== item.id));
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-opacity p-1 -m-1"
                                    title="Delete this item"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                            <p
                                onClick={() => { setTranscription(item.text); setMobileView('editor'); }}
                                className="text-xs line-clamp-3 font-sans opacity-80 group-hover:opacity-100 cursor-pointer"
                            >
                                {item.text}
                            </p>
                            <div className="flex gap-2 mt-2 pt-2 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => { setTranscription(item.text); setMobileView('editor'); }}
                                    className="text-[9px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded transition-colors"
                                >
                                    Load
                                </button>
                                <button
                                    onClick={() => { navigator.clipboard.writeText(item.text); addLog('Copied to clipboard', 'success'); }}
                                    className="text-[9px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded transition-colors flex items-center gap-1"
                                >
                                    <Copy className="w-2.5 h-2.5" /> Copy
                                </button>
                            </div>
                        </div>
                    ))}
                    {history.length === 0 && (
                        <div className="text-center py-10">
                            <IconHistory className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-xs opacity-40">No history yet.</p>
                            <p className="text-[10px] opacity-30 mt-1">Transcriptions will appear here.</p>
                        </div>
                    )}
                    {history.length > 0 && (
                        <button
                            onClick={async () => {
                                await clearAllHistory();
                                setHistory([]);
                                addLog('History cleared', 'info');
                            }}
                            className="w-full text-[10px] opacity-50 hover:text-red-400 py-2 border-t border-white/10 mt-4 flex items-center justify-center gap-1"
                        >
                            <Trash2 className="w-3 h-3" /> Clear All History
                        </button>
                    )}
                </div>
            )}

        </div>
      </div>

      {/* 3. MAIN EDITOR STAGE */}
      {/* On Mobile: Visible only if mobileView === 'editor' */}
      <main className={`${mobileView === 'editor' ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0 h-full`}>
        {/* Toolbar */}
        <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 md:px-6 bg-black/10 backdrop-blur shrink-0">
            <div className="flex items-center gap-3">
                 <h1 className="text-xs font-semibold opacity-80 uppercase tracking-wider flex items-center gap-2">
                    {outputStyle === 'Code Generator' ? <Terminal className="w-4 h-4 text-indigo-400"/> : <Feather className="w-4 h-4 text-emerald-400"/>}
                    Output
                 </h1>
                 
                 {/* HEADER STATUS INDICATOR (For Cloud/Mobile visibility) */}
                 {isProcessing && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-yellow-500/10 rounded-full border border-yellow-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                        <span className="text-[9px] text-yellow-500 font-mono font-bold uppercase">Processing</span>
                    </div>
                 )}

                 {transcription && !isProcessing && (
                    <span 
                        className="text-[9px] px-1.5 py-px rounded-sm font-mono opacity-80"
                        style={{ backgroundColor: `${themeColor}20`, color: themeColor, borderColor: `${themeColor}40`, borderWidth: 1 }}
                    >
                        {activeContext.toUpperCase()}
                    </span>
                 )}
            </div>
            
            <div className="flex items-center gap-1 md:gap-2">
                <div className="hidden md:flex items-center bg-white/5 rounded-sm mr-2">
                    <button onClick={() => setFontSize(Math.max(10, fontSize - 1))} className="p-1.5 hover:bg-white/10 text-xs"><Minus className="w-3 h-3"/></button>
                    <span className="text-[10px] px-2 font-mono w-8 text-center">{fontSize}</span>
                    <button onClick={() => setFontSize(Math.min(32, fontSize + 1))} className="p-1.5 hover:bg-white/10 text-xs"><Plus className="w-3 h-3"/></button>
                </div>

                <button
                    onClick={() => setTranscription('')}
                    className="p-1.5 hover:bg-white/10 rounded-sm opacity-50 hover:opacity-100 hover:text-red-400 transition-colors"
                    title="Clear"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-white/10 mx-1"></div>
                <button
                    onClick={() => handleDownloadText('txt')}
                    className="flex items-center gap-1 px-2 md:px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-sm transition-colors border border-white/5"
                    title="Export TXT"
                >
                    <IconDownload className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    <span className="text-[10px] md:text-xs">TXT</span>
                </button>
                <button
                    onClick={() => handleDownloadText('md')}
                    className="flex items-center gap-1 px-2 md:px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-sm transition-colors border border-white/5"
                    title="Export Markdown"
                >
                    <IconMarkdown className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    <span className="text-[10px] md:text-xs">MD</span>
                </button>
                <button
                    onClick={() => {navigator.clipboard.writeText(transcription); addLog('Copied to clipboard', 'success')}}
                    className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-sm transition-colors hover:bg-gray-200"
                    title="Copy to clipboard"
                >
                    <Copy className="w-3 h-3" /> <span className="hidden md:inline">Copy</span>
                </button>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 relative overflow-hidden">
            {transcription || isProcessing ? (
                <textarea
                    value={transcription}
                    onChange={(e) => setTranscription(e.target.value)}
                    spellCheck={false}
                    style={{ fontSize: `${fontSize}px` }}
                    className="w-full h-full bg-transparent border-0 p-4 md:p-8 resize-none focus:ring-0 focus:outline-none font-mono leading-relaxed placeholder:opacity-30"
                    placeholder={isProcessing ? "Refining text..." : ""}
                />
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-10 gap-4 select-none">
                    {outputStyle === 'Code Generator' ? <Terminal className="w-24 h-24" /> : <Feather className="w-24 h-24" />}
                </div>
            )}
        </div>
        
        {/* Status Footer */}
        <div className="h-7 border-t border-white/5 flex items-center px-4 justify-between bg-black/20 text-[9px] opacity-60 font-mono shrink-0 mb-[60px] md:mb-0">
             <div className="flex items-center gap-4">
                <span>Ln {transcription.split('\n').length}, Col {transcription.length}</span>
                <span>UTF-8</span>
                <span className="hidden md:inline">{fontFamily}</span>
                <span className="hidden md:inline ml-2 opacity-50">Model: {aiModel.replace('gemini-', '')}</span>
             </div>
             <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-700'}`}></div>
                <span>{isProcessing ? 'REFINING' : 'READY'}</span>
             </div>
        </div>
      </main>

      {/* 4. MOBILE BOTTOM NAVIGATION (Hidden on Desktop) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 w-full bg-black border-t border-white/10 flex items-center justify-around z-50"
        style={{
          height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
          <button onClick={() => { setActiveTab('workspace'); setMobileView('tools'); }} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'workspace' && mobileView === 'tools' ? 'opacity-100' : 'opacity-40'}`} style={activeTab === 'workspace' && mobileView === 'tools' ? { color: themeColor } : {}}>
              <IconWorkspace className="w-6 h-6" active={activeTab === 'workspace' && mobileView === 'tools'}/>
              <span className="text-[9px]">Input</span>
          </button>
          
          <button onClick={() => { setActiveTab('audio'); setMobileView('tools'); }} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'audio' && mobileView === 'tools' ? 'opacity-100' : 'opacity-40'}`} style={activeTab === 'audio' && mobileView === 'tools' ? { color: themeColor } : {}}>
              <IconAudio className="w-6 h-6" active={activeTab === 'audio' && mobileView === 'tools'}/>
              <span className="text-[9px]">Audio</span>
          </button>

          <div className="w-px h-8 bg-white/10 mx-1"></div>

          {/* Special Toggle for Editor View */}
          <button onClick={() => setMobileView('editor')} className={`flex flex-col items-center gap-1 p-2 ${mobileView === 'editor' ? 'opacity-100' : 'opacity-40'}`} style={mobileView === 'editor' ? { color: themeColor } : {}}>
              <IconEditor className="w-6 h-6" active={mobileView === 'editor'}/>
              <span className="text-[9px]">Editor</span>
          </button>
          
          <button onClick={() => { setActiveTab('stats'); setMobileView('tools'); }} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'stats' && mobileView === 'tools' ? 'opacity-100' : 'opacity-40'}`} style={activeTab === 'stats' && mobileView === 'tools' ? { color: themeColor } : {}}>
              <IconStats className="w-6 h-6" active={activeTab === 'stats' && mobileView === 'tools'}/>
              <span className="text-[9px]">Stats</span>
          </button>
      </nav>

       {/* SETTINGS MODAL */}
       {isSettingsOpen && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                        <Settings className="w-4 h-4" style={{color: themeColor}} />
                        System Configuration
                    </h2>
                    <button onClick={() => setIsSettingsOpen(false)} className="opacity-50 hover:opacity-100">
                        <X className="w-5 h-5" />
                    </button>
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
                                    ? 'Deixe vazio para usar sidecar local'
                                    : whisperTestMessage}
                            </p>
                        </div>
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