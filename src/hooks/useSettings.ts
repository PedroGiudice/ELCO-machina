import { useState, useEffect, useCallback, useMemo } from 'react';
import { migrateKey, storeSet } from '../services/TauriStore';

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

const STORE = 'settings.json' as const;

export function useSettings(): UseSettingsReturn {
  // Theme & Appearance
  const [themeColor, setThemeColor] = useState<string>('#4f46e5');
  const [bgColor, setBgColor] = useState<string>('#09090b');
  const [textColor, setTextColor] = useState<string>('#e4e4e7');
  const [fontFamily, setFontFamily] = useState<FontStyle>('IBM Plex Sans');
  const [fontSize, setFontSize] = useState<number>(14);

  // Output settings (defaults ate carregar do store)
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('English');
  const [outputStyle, setOutputStyle] = useState<OutputStyle>('Verbatim');
  const [customStylePrompt, setCustomStylePrompt] = useState<string>('');

  // AI config
  const [aiModel, setAiModel] = useState<string>('sonnet');

  // Transcription mode
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('auto');

  // STT Backend
  const [sttBackend, setSttBackend] = useState<SttBackend>('vm');

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // App version
  const [appVersion, setAppVersion] = useState<string>('0.0.0');

  // --- Carregar do store no mount (com migracao automatica de localStorage) ---
  useEffect(() => {
    const loadAll = async () => {
      const [lang, style, custom, model, mode, backend] = await Promise.all([
        migrateKey<string>(STORE, 'gemini_outputLanguage', 'English'),
        migrateKey<string>(STORE, 'gemini_outputStyle', 'Verbatim'),
        migrateKey<string>(STORE, 'gemini_customStylePrompt', ''),
        migrateKey<string>(STORE, 'claude_refiner_model', 'sonnet'),
        migrateKey<string>(STORE, 'voice_ai_mode', 'auto'),
        migrateKey<string>(STORE, 'stt_backend', 'vm'),
      ]);
      setOutputLanguage(lang as OutputLanguage);
      setOutputStyle(style as OutputStyle);
      setCustomStylePrompt(custom);
      setAiModel(model);
      setTranscriptionMode(mode as TranscriptionMode);
      setSttBackend(backend as SttBackend);
    };
    loadAll();
  }, []);

  // --- Persistir mudancas ---
  useEffect(() => { storeSet(STORE, 'gemini_outputLanguage', outputLanguage); }, [outputLanguage]);
  useEffect(() => { storeSet(STORE, 'gemini_outputStyle', outputStyle); }, [outputStyle]);
  useEffect(() => { storeSet(STORE, 'gemini_customStylePrompt', customStylePrompt); }, [customStylePrompt]);
  useEffect(() => { storeSet(STORE, 'claude_refiner_model', aiModel); }, [aiModel]);
  useEffect(() => { storeSet(STORE, 'voice_ai_mode', transcriptionMode); }, [transcriptionMode]);
  useEffect(() => { storeSet(STORE, 'stt_backend', sttBackend); }, [sttBackend]);

  // Fetch app version
  useEffect(() => {
    const isTauriEnv = typeof window !== 'undefined' && '__TAURI__' in window;
    if (isTauriEnv) {
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
