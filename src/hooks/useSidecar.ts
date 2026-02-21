import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  VoiceAIClient,
  setVoiceAIUrl,
  getVoiceAIClient,
} from '../services/VoiceAIClient';

// ============================================================================
// TYPES
// ============================================================================

export type WhisperTestStatus = 'idle' | 'testing' | 'success' | 'error';

export interface UseSidecarReturn {
  // State
  sidecarAvailable: boolean;
  sidecarStatus: string;
  voiceAIClient: VoiceAIClient | null;

  // Whisper Server
  whisperServerUrl: string;
  setWhisperServerUrl: (url: string) => void;
  whisperTestStatus: WhisperTestStatus;
  whisperTestMessage: string;
  testWhisperServer: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useSidecar(
  addLog?: (msg: string, type: 'info' | 'success' | 'error') => void,
): UseSidecarReturn {
  const log = (msg: string, type: 'info' | 'success' | 'error') => {
    if (addLog) addLog(msg, type);
    else console.log(`[Sidecar ${type}]`, msg);
  };
  const [sidecarAvailable, setSidecarAvailable] = useState<boolean>(false);
  const [sidecarStatus, setSidecarStatus] = useState<string>('checking');
  const clientRef = useRef<VoiceAIClient | null>(null);

  const [whisperServerUrl, setWhisperServerUrl] = useState<string>(() => {
    return localStorage.getItem('whisper_server_url') || 'http://100.123.73.128:8765';
  });
  const [whisperTestStatus, setWhisperTestStatus] = useState<WhisperTestStatus>('idle');
  const [whisperTestMessage, setWhisperTestMessage] = useState<string>('');

  // Persist URL and apply on change
  useEffect(() => {
    localStorage.setItem('whisper_server_url', whisperServerUrl);
    setVoiceAIUrl(whisperServerUrl || null);
  }, [whisperServerUrl]);

  // Initialize Voice AI Client and check health
  useEffect(() => {
    const url = whisperServerUrl || 'http://137.131.201.119/sidecar';
    setVoiceAIUrl(whisperServerUrl || null);
    clientRef.current = getVoiceAIClient();

    const checkSidecar = async () => {
      try {
        setSidecarStatus('checking');
        const health = await clientRef.current?.health();
        if (health?.status === 'healthy') {
          setSidecarAvailable(true);
          setSidecarStatus(
            `Local STT (Whisper ${health.models?.whisper?.model || 'medium'})`,
          );
          log('Voice AI Sidecar conectado - Transcricao local ativada', 'success');
        } else {
          setSidecarAvailable(false);
          setSidecarStatus('Sidecar offline');
        }
      } catch {
        setSidecarAvailable(false);
        setSidecarStatus('Sidecar offline');
      }
    };

    const initSidecar = async () => {
      setSidecarStatus('conectando...');
      await checkSidecar();
    };

    initSidecar();

    // Recheck a cada 2 minutos
    const interval = setInterval(checkSidecar, 120000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Test Whisper server connection
  const testWhisperServer = useCallback(async () => {
    const url = whisperServerUrl.trim();
    if (!url) {
      setWhisperTestStatus('error');
      setWhisperTestMessage('URL do servidor Whisper obrigatoria');
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
        setWhisperTestMessage(
          `Conectado: Whisper ${data.models?.whisper?.model || 'medium'}`,
        );
        // Aplicar nova URL e reconectar
        setVoiceAIUrl(url);
        clientRef.current = getVoiceAIClient();
        setSidecarAvailable(true);
        setSidecarStatus(
          `Remoto (Whisper ${data.models?.whisper?.model || 'medium'})`,
        );
      } else {
        throw new Error('Servidor degradado');
      }
    } catch (error) {
      setWhisperTestStatus('error');
      setWhisperTestMessage(
        error instanceof Error ? error.message : 'Erro de conexao',
      );
    }
  }, [whisperServerUrl]);

  return useMemo(() => ({
    sidecarAvailable,
    sidecarStatus,
    voiceAIClient: clientRef.current,
    whisperServerUrl,
    setWhisperServerUrl,
    whisperTestStatus,
    whisperTestMessage,
    testWhisperServer,
  }), [
    sidecarAvailable, sidecarStatus,
    whisperServerUrl, whisperTestStatus, whisperTestMessage, testWhisperServer,
  ]);
}

export default useSidecar;
