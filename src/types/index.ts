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
  | 'Prompt (Gemini)'
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

export type AppTheme = {
  bg: string;
  text: string;
  accent: string;
};

// ============================================================================
// TTS
// ============================================================================

export type TTSEngine = 'piper' | 'chatterbox';

export interface TTSCustomParams {
  exaggeration: number;
  speed: number;
  stability: number;
  steps: number;
  sentence_silence: number;
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

export type LogEntry = {
  msg: string;
  type: 'info' | 'success' | 'error';
  time?: Date;
};
