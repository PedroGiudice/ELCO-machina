import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getVoiceAIClient, type ClientStatus } from '@/services/VoiceAIClient';

type Tab = 'workspace' | 'audio' | 'stats' | 'history' | 'editor';

// Modos de transcricao disponiveis
type TranscriptionMode = 'auto' | 'local' | 'cloud';

interface Log {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

interface Metrics {
  words: number;
  characters: number;
  readingTime: number;
  latency: number;
}

interface HistoryItem {
  id: string;
  date: string;
  text: string;
}

interface GlobalContextType {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  isRecording: boolean;
  toggleRecording: () => void;
  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;
  transcriptionText: string;
  setTranscriptionText: (text: string) => void;
  logs: Log[];
  addLog: (message: string, type?: Log['type']) => void;
  metrics: Metrics;
  history: HistoryItem[];
  addToHistory: (text: string) => void;
  deleteFromHistory: (id: string) => void;
  geminiKey: string;
  setGeminiKey: (key: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  promptStyle: string;
  setPromptStyle: (style: string) => void;
  isPromptStylePersistent: boolean;
  setIsPromptStylePersistent: (isPersistent: boolean) => void;
  // Voice AI Sidecar
  transcriptionMode: TranscriptionMode;
  setTranscriptionMode: (mode: TranscriptionMode) => void;
  sidecarAvailable: boolean;
  sidecarStatus: ClientStatus;
  checkSidecarHealth: () => Promise<boolean>;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export const GlobalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<Tab>('workspace');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState('');
  const [logs, setLogs] = useState<Log[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [geminiKey, setGeminiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');
  const [promptStyle, setPromptStyle] = useState('');
  const [isPromptStylePersistent, setIsPromptStylePersistent] = useState(false);

  // Voice AI Sidecar states
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('auto');
  const [sidecarAvailable, setSidecarAvailable] = useState(false);
  const [sidecarStatus, setSidecarStatus] = useState<ClientStatus>({
    sidecarAvailable: false,
    lastCheck: null,
    error: null,
  });

  // Verifica saude do sidecar
  const checkSidecarHealth = useCallback(async (): Promise<boolean> => {
    const client = getVoiceAIClient();
    const isAvailable = await client.isAvailable();
    const status = client.getStatus();

    setSidecarAvailable(isAvailable);
    setSidecarStatus(status);

    return isAvailable;
  }, []);

  // Load from local storage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_key');
    if (savedKey) setGeminiKey(savedKey);

    const savedHistory = localStorage.getItem('transcription_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const savedPromptStyle = localStorage.getItem('prompt_style');
    const savedPersistence = localStorage.getItem('prompt_style_persistence') === 'true';

    if (savedPersistence) {
      setIsPromptStylePersistent(true);
      if (savedPromptStyle) setPromptStyle(savedPromptStyle);
    }

    // Load transcription mode
    const savedMode = localStorage.getItem('transcription_mode') as TranscriptionMode | null;
    if (savedMode && ['auto', 'local', 'cloud'].includes(savedMode)) {
      setTranscriptionMode(savedMode);
    }
  }, []);

  // Verifica sidecar na inicializacao e periodicamente
  useEffect(() => {
    // Verifica imediatamente
    checkSidecarHealth();

    // Verifica a cada 30 segundos
    const interval = setInterval(() => {
      checkSidecarHealth();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkSidecarHealth]);

  // Save transcription mode when changed
  useEffect(() => {
    localStorage.setItem('transcription_mode', transcriptionMode);
  }, [transcriptionMode]);

  // Save key when changed
  useEffect(() => {
    if (geminiKey) localStorage.setItem('gemini_key', geminiKey);
  }, [geminiKey]);

  // Save prompt style persistence
  useEffect(() => {
    localStorage.setItem('prompt_style_persistence', String(isPromptStylePersistent));
    if (isPromptStylePersistent) {
      localStorage.setItem('prompt_style', promptStyle);
    } else {
      localStorage.removeItem('prompt_style');
    }
  }, [isPromptStylePersistent, promptStyle]);

  // Save history when changed
  useEffect(() => {
    localStorage.setItem('transcription_history', JSON.stringify(history));
  }, [history]);

  const toggleRecording = () => {
    setIsRecording(prev => !prev);
    if (!isRecording) {
      addLog('Recording started', 'info');
    } else {
      addLog('Recording stopped', 'info');
    }
  };

  const addLog = (message: string, type: Log['type'] = 'info') => {
    const newLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50)); // Keep last 50
  };

  const addToHistory = (text: string) => {
    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
      text
    };
    setHistory(prev => [newItem, ...prev]);
  };

  const deleteFromHistory = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const metrics: Metrics = {
    words: transcriptionText.trim().split(/\s+/).filter(w => w.length > 0).length,
    characters: transcriptionText.length,
    readingTime: Math.ceil(transcriptionText.trim().split(/\s+/).length / 200),
    latency: 0.0 // Mock
  };

  return (
    <GlobalContext.Provider
      value={{
        activeTab,
        setActiveTab,
        isSettingsOpen,
        setIsSettingsOpen,
        isRecording,
        toggleRecording,
        isProcessing,
        setIsProcessing,
        transcriptionText,
        setTranscriptionText,
        logs,
        addLog,
        metrics,
        history,
        addToHistory,
        deleteFromHistory,
        geminiKey,
        setGeminiKey,
        selectedModel,
        setSelectedModel,
        promptStyle,
        setPromptStyle,
        isPromptStylePersistent,
        setIsPromptStylePersistent,
        // Voice AI Sidecar
        transcriptionMode,
        setTranscriptionMode,
        sidecarAvailable,
        sidecarStatus,
        checkSidecarHealth,
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
};

export const useGlobal = () => {
  const context = useContext(GlobalContext);
  if (context === undefined) {
    throw new Error('useGlobal must be used within a GlobalProvider');
  }
  return context;
};
