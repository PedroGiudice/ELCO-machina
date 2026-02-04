import React, { useState, useRef, useEffect, useCallback } from 'react';

// --- TYPES ---

export type RecordingStyle = 'Dictation' | 'Interview';

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

export interface UseAudioRecordingReturn {
  // State
  isRecording: boolean;
  audioBlob: Blob | null;
  audioStream: MediaStream | null;
  audioMetrics: AudioMetrics | null;
  uploadError: string | null;
  recordingStartTime: number;

  // Config
  availableMics: MediaDeviceInfo[];
  selectedMicId: string;
  setSelectedMicId: (id: string) => void;
  recordingStyle: RecordingStyle;
  setRecordingStyle: (style: RecordingStyle) => void;
  noiseSuppression: boolean;
  setNoiseSuppression: (v: boolean) => void;
  echoCancellation: boolean;
  setEchoCancellation: (v: boolean) => void;
  autoGainControl: boolean;
  setAutoGainControl: (v: boolean) => void;

  // Actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearAudio: () => void;
  setAudioBlob: (blob: Blob | null) => void;
}

// --- UTILITY FUNCTIONS ---

/**
 * Detecta se está rodando em ambiente Tauri
 */
const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

/**
 * Analisa conteúdo de áudio e retorna métricas
 */
export const analyzeAudioContent = async (blob: Blob): Promise<AudioMetrics> => {
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
    const sampledAmplitudes: number[] = [];
    for (let i = 0; i < rawData.length; i += 100) {
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

// --- HOOK ---

interface UseAudioRecordingOptions {
  onLog?: (message: string, type: 'info' | 'error' | 'success' | 'warn') => void;
  onAudioAnalyzed?: (metrics: AudioMetrics) => void;
  persistAudio?: (blob: Blob | null) => Promise<void>;
}

export function useAudioRecording(options: UseAudioRecordingOptions = {}): UseAudioRecordingReturn {
  const { onLog, onAudioAnalyzed, persistAudio } = options;

  // Helper para logging
  const addLog = useCallback((message: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    if (onLog) {
      onLog(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }, [onLog]);

  // --- STATE ---
  const [isRecording, setIsRecording] = useState(false);
  const [isNativeRecording, setIsNativeRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);

  // Hardware State
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  const [recordingStyle, setRecordingStyle] = useState<RecordingStyle>('Dictation');

  // Audio Config Settings
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(true);
  const [echoCancellation, setEchoCancellation] = useState<boolean>(true);
  const [autoGainControl, setAutoGainControl] = useState<boolean>(true);

  // --- EFFECTS ---

  // Enumerate microphones on mount
  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const mics = devices.filter(d => d.kind === 'audioinput');
        setAvailableMics(mics);
      }).catch(err => {
        console.warn('Failed to enumerate devices:', err);
      });
    }
  }, []);

  // Analyze audio when blob changes
  useEffect(() => {
    if (audioBlob && !isRecording) {
      // Persist audio if callback provided
      if (persistAudio) {
        persistAudio(audioBlob);
      }

      // Analyze audio
      addLog("Analyzing audio signal...", 'info');
      analyzeAudioContent(audioBlob).then(metrics => {
        setAudioMetrics(metrics);
        addLog("Audio analysis complete.", 'success');
        if (onAudioAnalyzed) {
          onAudioAnalyzed(metrics);
        }
      }).catch(err => {
        console.error("Analysis failed", err);
        addLog("Audio analysis failed.", 'error');
      });
    } else if (audioBlob === null && !isRecording) {
      // If cleared
      if (persistAudio) {
        persistAudio(null);
      }
      setAudioMetrics(null);
    }
  }, [audioBlob, isRecording, addLog, onAudioAnalyzed, persistAudio]);

  // --- ACTIONS ---

  const startRecording = useCallback(async () => {
    // Tentar plugin nativo primeiro (funciona no Linux desktop onde WebKit2GTK não tem permissões)
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

        // Se o erro indica ausência de dispositivo de audio, mostrar mensagem específica
        if (errorMsg.includes('NoDevice') || errorMsg.includes('no device') || errorMsg.includes('not available')) {
          addLog("Nenhum microfone detectado no sistema.", 'error');
          return;
        }

        // Tentar fallback Web API apenas se o erro não foi de dispositivo
        addLog("Plugin nativo falhou, tentando Web API...", 'info');
      }
    }

    // Fallback: Web API (funciona no Android e navegador)
    // NOTA: No Linux desktop com WebKit2GTK, isso vai falhar com NotAllowedError
    // porque o WebKit2GTK não tem handler de permissão configurado no Tauri
    try {
      // Verificar se mediaDevices está disponível
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        addLog("API de midia nao disponivel neste ambiente.", 'error');
        return;
      }

      const constraints: MediaStreamConstraints = {
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
        // Erro específico do WebKit2GTK no Linux - permissão negada automaticamente
        addLog("Permissao de microfone negada. No Linux, use o botao de upload de arquivo como alternativa.", 'error');
      } else if (errorName === 'NotFoundError') {
        addLog("Nenhum microfone encontrado no sistema.", 'error');
      } else {
        addLog(`Erro ao acessar microfone: ${errorMsg}`, 'error');
      }
    }
  }, [selectedMicId, echoCancellation, noiseSuppression, autoGainControl, addLog]);

  const stopRecording = useCallback(async () => {
    // Se usando gravação nativa
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
  }, [isNativeRecording, mediaRecorder, addLog]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [addLog]);

  const clearAudio = useCallback(() => {
    setAudioBlob(null);
    setAudioMetrics(null);
    setUploadError(null);
    setRecordingStartTime(0);
    addLog("Audio cleared.", 'info');
  }, [addLog]);

  return {
    // State
    isRecording,
    audioBlob,
    audioStream,
    audioMetrics,
    uploadError,
    recordingStartTime,

    // Config
    availableMics,
    selectedMicId,
    setSelectedMicId,
    recordingStyle,
    setRecordingStyle,
    noiseSuppression,
    setNoiseSuppression,
    echoCancellation,
    setEchoCancellation,
    autoGainControl,
    setAutoGainControl,

    // Actions
    startRecording,
    stopRecording,
    handleFileUpload,
    clearAudio,
    setAudioBlob
  };
}

export default useAudioRecording;
