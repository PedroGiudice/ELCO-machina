/**
 * Tipos centralizados do ELCO-machina
 *
 * Fonte unica de verdade para todos os tipos compartilhados
 * entre hooks, componentes e servicos.
 */

// ============================================================================
// Output & Processing
// ============================================================================

export type OutputStyle =
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
  | 'Prompt (LLM)'
  | 'Bullet Points'
  | 'Summary'
  | 'Tech Docs'
  | 'Email'
  | 'Tweet Thread'
  | 'Code Generator'
  | 'Custom';

export type RecordingStyle = 'Dictation' | 'Interview';

export type ProcessingStats = {
  processingTime: number; // ms
  audioDuration: number; // seconds
  inputSize: number; // bytes
  wordCount: number;
  charCount: number;
  readingTime: string;
  appliedStyle: string;
};

// ============================================================================
// Audio
// ============================================================================

export type AudioMetrics = {
  duration: number;
  sampleRate: number;
  channels: number;
  rmsDB: number;
  peakDB: number;
  silenceRatio: number;
  zeroCrossingRate: number;
  avgPitchHz: number;
  clarityScore: number;
};

// ============================================================================
// Persistence
// ============================================================================

export type HistoryItem = {
  text: string;
  date: string;
  id: string;
};

export type ContextItem = {
  name: string;
  memory: string;
  lastUpdated: number;
};

// ============================================================================
// Settings & Config
// ============================================================================

export type FontStyle = 'IBM Plex Sans' | 'JetBrains Mono' | 'Georgia';
export type TranscriptionMode = 'auto' | 'local' | 'cloud';
export type OutputLanguage = 'English' | 'Portuguese' | 'Spanish';

// ============================================================================
// TTS (XTTS v2)
// ============================================================================

export interface XTTSParams {
  speed: number;           // 0.5-2.0, default 1.0
  temperature: number;     // 0.1-0.8, default 0.75
  top_k: number;           // 1-100, default 20
  top_p: number;           // 0.1-1.0, default 0.75
  repetition_penalty: number; // 1.0-5.0, default 2.0
  length_penalty: number;     // 0.5-2.0, default 1.0
}

export interface TTSSynthesizeRequest {
  text: string;
  ref_audio_base64: string;
  language?: string;
  speed?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  repetition_penalty?: number;
  length_penalty?: number;
}

// ============================================================================
// Updater
// ============================================================================

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready';

// ============================================================================
// Sidecar
// ============================================================================

export type WhisperTestStatus = 'idle' | 'testing' | 'success' | 'error';

// ============================================================================
// Log
// ============================================================================

export type LogCategory = 'stt' | 'tts' | 'refiner' | 'audio' | 'app' | 'ipc';

export type LogEntry = {
  msg: string;
  type: 'info' | 'success' | 'error' | 'warning';
  category: LogCategory;
  time: Date;
};
