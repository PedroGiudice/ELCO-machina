import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Volume2, VolumeX, Upload, RotateCcw, Loader2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';
import { safeFetch } from '../../services/safeFetch';
import type { XTTSParams } from '../../types';
import { DEFAULT_XTTS_PARAMS, type TTSStatus, type VoiceRef } from '../../hooks/useTTS';

interface PanelTTSProps {
  // State
  ttsStatus: TTSStatus;
  statusMessage: string | null;
  hasText: boolean;

  // Actions
  onReadText: () => void;
  onStopReading: () => void;

  // XTTS Params
  xttsParams: XTTSParams;
  onXttsParamsChange: (params: XTTSParams) => void;

  // Voice Cloning
  voiceRef: VoiceRef | null;
  onVoiceRefChange: (ref: VoiceRef | null) => void;

  // Endpoint
  modalEndpointUrl: string;
  onEndpointChange: (url: string) => void;

  // Audio URL (para player inline)
  ttsAudioUrl?: string | null;
}

const STATUS_LABELS: Record<TTSStatus, string> = {
  idle: 'Pronto',
  cold_start: 'Inicializando GPU...',
  synthesizing: 'Sintetizando...',
  playing: 'Reproduzindo...',
  error: 'Erro',
};

const STATUS_COLORS: Record<TTSStatus, string> = {
  idle: 'text-[var(--text-secondary)]',
  cold_start: 'text-yellow-400',
  synthesizing: 'text-blue-400',
  playing: 'text-green-400',
  error: 'text-red-400',
};

export function PanelTTS({
  ttsStatus,
  statusMessage,
  hasText,
  onReadText,
  onStopReading,
  xttsParams,
  onXttsParamsChange,
  voiceRef,
  onVoiceRefChange,
  modalEndpointUrl,
  onEndpointChange,
}: PanelTTSProps) {
  const isSpeaking = ttsStatus === 'playing';
  const isBusy = ttsStatus === 'cold_start' || ttsStatus === 'synthesizing';

  const handleSelectAudio = useCallback(async () => {
    const selected = await open({
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'webm'] }],
      multiple: false,
    });
    if (selected) {
      const bytes = await readFile(selected);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      onVoiceRefChange({ path: selected, base64 });
    }
  }, [onVoiceRefChange]);

  const updateParam = <K extends keyof XTTSParams>(key: K, value: XTTSParams[K]) => {
    onXttsParamsChange({ ...xttsParams, [key]: value });
  };

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-sm font-semibold">Texto para Fala (XTTS v2)</h2>
      </div>

      {/* Status */}
      <div className={`flex items-center gap-2 text-[10px] ${STATUS_COLORS[ttsStatus]}`}>
        {isBusy && <Loader2 className="w-3 h-3 animate-spin" />}
        {ttsStatus === 'error' && <AlertCircle className="w-3 h-3" />}
        <span>{statusMessage || STATUS_LABELS[ttsStatus]}</span>
      </div>

      {/* Main Action */}
      <Button
        variant={isSpeaking ? 'secondary' : 'primary'}
        className={`w-full h-14 text-base ${isSpeaking ? 'text-red-400 border-red-500/50' : ''}`}
        onClick={isSpeaking || isBusy ? onStopReading : onReadText}
        disabled={(!hasText || !voiceRef) && !isSpeaking && !isBusy}
      >
        {isSpeaking || isBusy ? (
          <>
            <VolumeX className="w-5 h-5" />
            Parar
          </>
        ) : (
          <>
            <Volume2 className="w-5 h-5" />
            Ler Texto em Voz Alta
          </>
        )}
      </Button>

      {!hasText && (
        <p className="text-[10px] text-[var(--text-secondary)] text-center">
          Escreva ou transcreva um texto primeiro
        </p>
      )}

      {hasText && !voiceRef && (
        <p className="text-[10px] text-yellow-400 text-center">
          Envie um audio de referencia para clonagem de voz
        </p>
      )}

      <div className="w-full h-px bg-[var(--border-subtle)]" />

      {/* Voice Cloning */}
      <section className="space-y-3">
        <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          Clonagem de Voz
        </label>
        <p className="text-[9px] text-[var(--text-secondary)]">
          {voiceRef
            ? `Amostra: ${voiceRef.path.split('/').pop() ?? voiceRef.path}`
            : 'Selecione um audio de referencia (obrigatorio para XTTS v2).'}
        </p>
        <button
          type="button"
          onClick={handleSelectAudio}
          className="flex items-center justify-between w-full h-11 px-3 bg-[var(--bg-overlay)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--accent-dim)] transition-colors group"
        >
          <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] flex items-center gap-2">
            <Upload className="w-3 h-3" />
            {voiceRef ? 'Trocar amostra de voz' : 'Selecionar amostra de voz'}
          </span>
        </button>
        {voiceRef && (
          <button
            onClick={() => onVoiceRefChange(null)}
            className="text-[10px] text-red-400 hover:text-red-300"
          >
            Remover amostra
          </button>
        )}
      </section>

      <div className="w-full h-px bg-[var(--border-subtle)]" />

      {/* XTTS v2 Parameters */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
            Parametros XTTS v2
          </label>
          <button
            onClick={() => onXttsParamsChange(DEFAULT_XTTS_PARAMS)}
            className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title="Resetar para valores padrao"
          >
            <RotateCcw className="w-3 h-3" />
            Resetar
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4 p-3 bg-[var(--bg-base)] rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
        >
          <Slider
            label="Velocidade"
            value={xttsParams.speed}
            onChange={(v) => updateParam('speed', v)}
            min={0.5}
            max={2.0}
            step={0.05}
            formatValue={(v) => `${v.toFixed(2)}x`}
          />
          <Slider
            label="Temperatura"
            value={xttsParams.temperature}
            onChange={(v) => updateParam('temperature', v)}
            min={0.1}
            max={0.8}
            step={0.05}
            formatValue={(v) => v.toFixed(2)}
          />
          <Slider
            label="Top K"
            value={xttsParams.top_k}
            onChange={(v) => updateParam('top_k', v)}
            min={1}
            max={100}
            step={1}
            formatValue={(v) => String(Math.round(v))}
          />
          <Slider
            label="Top P"
            value={xttsParams.top_p}
            onChange={(v) => updateParam('top_p', v)}
            min={0.1}
            max={1.0}
            step={0.05}
            formatValue={(v) => v.toFixed(2)}
          />
          <Slider
            label="Penalidade de Repeticao"
            value={xttsParams.repetition_penalty}
            onChange={(v) => updateParam('repetition_penalty', v)}
            min={1.0}
            max={5.0}
            step={0.1}
            formatValue={(v) => v.toFixed(1)}
          />
          <Slider
            label="Penalidade de Comprimento"
            value={xttsParams.length_penalty}
            onChange={(v) => updateParam('length_penalty', v)}
            min={0.5}
            max={2.0}
            step={0.1}
            formatValue={(v) => v.toFixed(1)}
          />
        </motion.div>
      </section>

      <div className="w-full h-px bg-[var(--border-subtle)]" />

      {/* Endpoint URL */}
      <EndpointSection
        modalEndpointUrl={modalEndpointUrl}
        onEndpointChange={onEndpointChange}
      />
    </div>
  );
}

// ============================================================================
// Endpoint Section com Health Check
// ============================================================================

type HealthStatus = 'unknown' | 'checking' | 'connected' | 'starting' | 'offline';

const HEALTH_LABELS: Record<HealthStatus, string> = {
  unknown: '',
  checking: 'Verificando...',
  connected: 'Conectado',
  starting: 'Inicializando...',
  offline: 'Offline',
};

const HEALTH_COLORS: Record<HealthStatus, string> = {
  unknown: '',
  checking: 'text-blue-400',
  connected: 'text-green-400',
  starting: 'text-yellow-400',
  offline: 'text-red-400',
};

function deriveHealthUrl(synthesizeUrl: string): string {
  // https://pedrogiudice--xtts-serve-xttsserver-synthesize.modal.run
  // -> https://pedrogiudice--xtts-serve-xttsserver-health.modal.run
  return synthesizeUrl.replace(/-synthesize\./, '-health.');
}

function EndpointSection({
  modalEndpointUrl,
  onEndpointChange,
}: {
  modalEndpointUrl: string;
  onEndpointChange: (url: string) => void;
}) {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('unknown');
  const [healthDetail, setHealthDetail] = useState<string | null>(null);

  const testConnection = useCallback(async () => {
    if (!modalEndpointUrl.trim()) return;

    setHealthStatus('checking');
    setHealthDetail(null);

    const healthUrl = deriveHealthUrl(modalEndpointUrl);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s para cold start

      const response = await safeFetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setHealthStatus('connected');
        const gpu = data.gpu || 'desconhecida';
        const loadTime = data.model_load_s ? `${data.model_load_s}s` : '?';
        setHealthDetail(`GPU: ${gpu} | Modelo carregado em ${loadTime}`);
      } else if (response.status === 503 || response.status === 502) {
        setHealthStatus('starting');
        setHealthDetail('Servidor em cold start. Aguarde e tente novamente.');
      } else {
        setHealthStatus('offline');
        setHealthDetail(`HTTP ${response.status}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setHealthStatus('starting');
        setHealthDetail('Timeout -- servidor pode estar em cold start (ate 70s).');
      } else {
        setHealthStatus('offline');
        setHealthDetail('Servidor inacessivel. Verifique a URL.');
      }
    }
  }, [modalEndpointUrl]);

  return (
    <section className="space-y-2">
      <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
        Servidor TTS (XTTS v2)
      </label>
      <input
        type="url"
        value={modalEndpointUrl}
        onChange={(e) => {
          onEndpointChange(e.target.value);
          setHealthStatus('unknown');
          setHealthDetail(null);
        }}
        className="w-full px-3 py-2 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] font-mono focus:outline-none focus:border-[var(--accent)] transition-colors"
        placeholder="https://..."
      />
      <div className="flex items-center gap-2">
        <button
          onClick={testConnection}
          disabled={healthStatus === 'checking' || !modalEndpointUrl.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {healthStatus === 'checking' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : healthStatus === 'connected' ? (
            <Wifi className="w-3 h-3 text-green-400" />
          ) : healthStatus === 'offline' ? (
            <WifiOff className="w-3 h-3 text-red-400" />
          ) : (
            <Wifi className="w-3 h-3" />
          )}
          Testar Conexao
        </button>
        {healthStatus !== 'unknown' && (
          <span className={`text-[10px] ${HEALTH_COLORS[healthStatus]}`}>
            {HEALTH_LABELS[healthStatus]}
          </span>
        )}
      </div>
      {healthDetail && (
        <p className="text-[9px] text-[var(--text-secondary)]">
          {healthDetail}
        </p>
      )}
    </section>
  );
}
