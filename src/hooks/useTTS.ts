import { useState, useRef, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface TTSCustomParams {
  exaggeration: number;
  speed: number;
  stability: number;
  steps: number;
  sentence_silence: number;
}

export type TTSEngine = 'piper' | 'chatterbox';

interface TTSSettings {
  engine: TTSEngine;
  profile: string;
  customParams: TTSCustomParams;
  voiceRef: string | null;
}

export interface UseTTSReturn {
  // State
  isSpeaking: boolean;

  // Config
  ttsEngine: TTSEngine;
  setTtsEngine: (engine: TTSEngine) => void;
  ttsProfile: string;
  setTtsProfile: (profile: string) => void;
  ttsCustomParams: TTSCustomParams;
  setTtsCustomParams: (params: TTSCustomParams) => void;
  voiceRefAudio: string | null;
  setVoiceRefAudio: (ref: string | null) => void;

  // Actions
  readText: (text: string) => Promise<void>;
  stopReading: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'tts_settings';

const DEFAULT_CUSTOM_PARAMS: TTSCustomParams = {
  exaggeration: 0.5,
  speed: 1.0,
  stability: 0.5,
  steps: 10,
  sentence_silence: 0.2,
};

// ============================================================================
// HOOK
// ============================================================================

export function useTTS(
  whisperServerUrl: string,
  addLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): UseTTSReturn {
  // Internal logging helper
  const log = useCallback((msg: string, type: 'info' | 'success' | 'error') => {
    if (addLog) {
      addLog(msg, type);
    } else {
      console.log(`[TTS ${type}]`, msg);
    }
  }, [addLog]);

  // State
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Settings
  const [ttsEngine, setTtsEngine] = useState<TTSEngine>('chatterbox');
  const [ttsProfile, setTtsProfile] = useState<string>('standard');
  const [voiceRefAudio, setVoiceRefAudio] = useState<string | null>(null);
  const [ttsCustomParams, setTtsCustomParams] = useState<TTSCustomParams>(DEFAULT_CUSTOM_PARAMS);

  // Load settings on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const settings: TTSSettings = JSON.parse(saved);
        if (settings.engine) setTtsEngine(settings.engine);
        if (settings.profile) setTtsProfile(settings.profile);
        if (settings.customParams) setTtsCustomParams(settings.customParams);
        if (settings.voiceRef) setVoiceRefAudio(settings.voiceRef);
      } catch (e) {
        console.warn('Failed to load TTS settings:', e);
      }
    }
  }, []);

  // Persist settings on change
  useEffect(() => {
    const settings: TTSSettings = {
      engine: ttsEngine,
      profile: ttsProfile,
      customParams: ttsCustomParams,
      voiceRef: voiceRefAudio,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [ttsEngine, ttsProfile, ttsCustomParams, voiceRefAudio]);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (ttsAudioUrl) {
        URL.revokeObjectURL(ttsAudioUrl);
      }
    };
  }, [ttsAudioUrl]);

  // Read text aloud
  const readText = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) {
      log('Nenhum texto para ler', 'error');
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

    // Chatterbox usa GPU remota e pode demorar no cold start
    const isChatterbox = ttsEngine === 'chatterbox';
    if (isChatterbox) {
      log('Sintetizando via Chatterbox (GPU). Primeira chamada pode levar ~20s...', 'info');
    } else {
      log('Sintetizando audio...', 'info');
    }

    try {
      // Build request body based on TTS settings
      const requestBody: Record<string, unknown> = {
        text: text,
        voice: isChatterbox ? 'cloned' : 'pt-br-faber-medium',
        preprocess: true,
      };

      if (isChatterbox) {
        if (ttsProfile === 'custom') {
          requestBody.params = ttsCustomParams;
        } else {
          requestBody.profile = ttsProfile;
        }
        if (voiceRefAudio) {
          requestBody.voice_ref = voiceRefAudio;
        }
      }

      // Timeout maior para Chatterbox (cold start GPU)
      const controller = new AbortController();
      const timeoutMs = isChatterbox ? 180000 : 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${whisperServerUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Erro desconhecido' }));
        const detail = error.detail || `HTTP ${response.status}`;

        // Mensagens mais claras por tipo de erro
        if (response.status === 503) {
          throw new Error('Servidor de voz indisponivel. Verifique se o sidecar esta rodando.');
        }
        throw new Error(detail);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      setTtsAudioUrl(audioUrl);

      // Create and play audio
      const audio = new Audio(audioUrl);
      ttsAudioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        log('Leitura concluida', 'success');
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        log('Erro ao reproduzir audio', 'error');
      };

      await audio.play();
      log('Reproduzindo...', 'success');

    } catch (err: unknown) {
      let errorMessage = 'Erro desconhecido';

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = isChatterbox
            ? 'Timeout: GPU demorou demais. Tente novamente (cold start pode ser lento na primeira vez).'
            : 'Timeout na sintese de audio.';
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          errorMessage = 'Servidor de voz inacessivel. Verifique se o sidecar esta rodando.';
        } else {
          errorMessage = err.message;
        }
      }

      console.error('TTS Error:', err);
      log(`Erro TTS: ${errorMessage}`, 'error');
      setIsSpeaking(false);
    }
  }, [whisperServerUrl, ttsEngine, ttsProfile, ttsCustomParams, voiceRefAudio, ttsAudioUrl, log]);

  // Stop reading
  const stopReading = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
      ttsAudioRef.current = null;
    }
    setIsSpeaking(false);
    log('Leitura interrompida', 'info');
  }, [log]);

  return {
    // State
    isSpeaking,

    // Config
    ttsEngine,
    setTtsEngine,
    ttsProfile,
    setTtsProfile,
    ttsCustomParams,
    setTtsCustomParams,
    voiceRefAudio,
    setVoiceRefAudio,

    // Actions
    readText,
    stopReading,
  };
}

export default useTTS;
