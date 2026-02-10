import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type FontStyle = 'IBM Plex Sans' | 'JetBrains Mono' | 'Georgia';
export type TranscriptionMode = 'auto' | 'local' | 'cloud';
export type OutputLanguage = 'English' | 'Portuguese' | 'Spanish';

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

export interface UseSettingsReturn {
  // Theme
  themeColor: string;
  setThemeColor: (v: string) => void;
  bgColor: string;
  setBgColor: (v: string) => void;
  textColor: string;
  setTextColor: (v: string) => void;

  // Typography
  fontFamily: FontStyle;
  setFontFamily: (v: FontStyle) => void;
  fontSize: number;
  setFontSize: (v: number) => void;

  // Output
  outputLanguage: OutputLanguage;
  setOutputLanguage: (v: OutputLanguage) => void;
  outputStyle: OutputStyle;
  setOutputStyle: (v: OutputStyle) => void;
  customStylePrompt: string;
  setCustomStylePrompt: (v: string) => void;

  // AI
  aiModel: string;
  setAiModel: (v: string) => void;

  // Transcription
  transcriptionMode: TranscriptionMode;
  setTranscriptionMode: (v: TranscriptionMode) => void;

  // Modals
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  isResetConfirmOpen: boolean;
  setIsResetConfirmOpen: (v: boolean) => void;

  // App version
  appVersion: string;
}

// ============================================================================
// HOOK
// ============================================================================

export function useSettings(): UseSettingsReturn {
  // Theme & Appearance
  const [themeColor, setThemeColor] = useState<string>('#4f46e5');
  const [bgColor, setBgColor] = useState<string>('#09090b');
  const [textColor, setTextColor] = useState<string>('#e4e4e7');
  const [fontFamily, setFontFamily] = useState<FontStyle>('IBM Plex Sans');
  const [fontSize, setFontSize] = useState<number>(14);

  // Output settings
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>(() => {
    return (localStorage.getItem('gemini_outputLanguage') as OutputLanguage) || 'English';
  });
  const [outputStyle, setOutputStyle] = useState<OutputStyle>(() => {
    return (localStorage.getItem('gemini_outputStyle') as OutputStyle) || 'Verbatim';
  });
  const [customStylePrompt, setCustomStylePrompt] = useState<string>(() => {
    return localStorage.getItem('gemini_customStylePrompt') || '';
  });

  // AI config
  const [aiModel, setAiModel] = useState<string>(() => {
    return localStorage.getItem('gemini_ai_model') || 'gemini-2.5-pro';
  });

  // Transcription mode
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>(() => {
    return (localStorage.getItem('voice_ai_mode') as TranscriptionMode) || 'auto';
  });

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // App version
  const [appVersion, setAppVersion] = useState<string>('0.0.0');

  // --- Persist effects ---
  useEffect(() => localStorage.setItem('gemini_outputLanguage', outputLanguage), [outputLanguage]);
  useEffect(() => localStorage.setItem('gemini_outputStyle', outputStyle), [outputStyle]);
  useEffect(() => localStorage.setItem('gemini_customStylePrompt', customStylePrompt), [customStylePrompt]);
  useEffect(() => localStorage.setItem('gemini_ai_model', aiModel), [aiModel]);
  useEffect(() => localStorage.setItem('voice_ai_mode', transcriptionMode), [transcriptionMode]);

  // Fetch app version
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    if (isTauri) {
      import('@tauri-apps/api/app').then(({ getVersion }) => {
        getVersion().then((v) => setAppVersion(v)).catch(() => {});
      });
    }
  }, []);

  return {
    themeColor,
    setThemeColor,
    bgColor,
    setBgColor,
    textColor,
    setTextColor,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    outputLanguage,
    setOutputLanguage,
    outputStyle,
    setOutputStyle,
    customStylePrompt,
    setCustomStylePrompt,
    aiModel,
    setAiModel,
    transcriptionMode,
    setTranscriptionMode,
    isSettingsOpen,
    setIsSettingsOpen,
    isResetConfirmOpen,
    setIsResetConfirmOpen,
    appVersion,
  };
}

export default useSettings;
