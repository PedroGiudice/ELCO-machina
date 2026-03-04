import { useState, useEffect, useCallback, useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

import type { OutputStyle, TranscriptionMode, FontStyle, OutputLanguage } from '../types';
export type { OutputStyle, TranscriptionMode, FontStyle, OutputLanguage };
export type SttBackend = 'vm' | 'modal';

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

  // STT Backend
  sttBackend: SttBackend;
  setSttBackend: (v: SttBackend) => void;

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
    return localStorage.getItem('claude_refiner_model') || 'sonnet';
  });

  // Transcription mode
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>(() => {
    return (localStorage.getItem('voice_ai_mode') as TranscriptionMode) || 'auto';
  });

  // STT Backend
  const [sttBackend, setSttBackend] = useState<SttBackend>(() => {
    return (localStorage.getItem('stt_backend') as SttBackend) || 'vm';
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
  useEffect(() => localStorage.setItem('claude_refiner_model', aiModel), [aiModel]);
  useEffect(() => localStorage.setItem('voice_ai_mode', transcriptionMode), [transcriptionMode]);
  useEffect(() => localStorage.setItem('stt_backend', sttBackend), [sttBackend]);

  // Fetch app version
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    if (isTauri) {
      import('@tauri-apps/api/app').then(({ getVersion }) => {
        getVersion().then((v) => setAppVersion(v)).catch(() => {});
      });
    }
  }, []);

  return useMemo(() => ({
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
    sttBackend,
    setSttBackend,
    isSettingsOpen,
    setIsSettingsOpen,
    isResetConfirmOpen,
    setIsResetConfirmOpen,
    appVersion,
  }), [
    themeColor, bgColor, textColor, fontFamily, fontSize,
    outputLanguage, outputStyle, customStylePrompt, aiModel,
    transcriptionMode, sttBackend, isSettingsOpen, isResetConfirmOpen, appVersion,
  ]);
}

export default useSettings;
