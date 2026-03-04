import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Activity, Mic, Volume2, Sparkles, Radio, Box } from 'lucide-react';
import type { LogEntry, LogCategory, AudioMetrics } from '../../types';

interface PanelStatsProps {
  logs: LogEntry[];
  sidecarAvailable: boolean;
  sidecarStatus: string;
  sttBackend: 'vm' | 'modal';
  isSpeaking: boolean;
  aiModel: string;
  hasApiKey: boolean;
  audioMetrics: AudioMetrics | null;
  ttsStatus?: string;
  isRecording: boolean;
  isProcessing: boolean;
  selectedMicLabel: string;
  appVersion: string;
}

function StatusDot({ status }: { status: 'healthy' | 'warning' | 'error' | 'inactive' }) {
  const colors = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    inactive: 'bg-neutral-500',
  };
  return <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[status]}`} />;
}

function ServiceCard({
  icon: Icon,
  label,
  status,
  children,
}: {
  icon: typeof Mic;
  label: string;
  status: 'healthy' | 'warning' | 'error' | 'inactive';
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <StatusDot status={status} />
        <Icon className="w-3 h-3 text-[var(--text-secondary)]" />
        <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="space-y-1 pl-4">{children}</div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)] font-mono">{value}</span>
    </div>
  );
}

const CATEGORY_COLORS: Record<LogCategory, string> = {
  stt: 'text-blue-400',
  tts: 'text-purple-400',
  refiner: 'text-amber-400',
  audio: 'text-emerald-400',
  app: 'text-neutral-400',
  ipc: 'text-cyan-400',
};

const FILTER_CHIPS: { id: LogCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'stt', label: 'STT' },
  { id: 'tts', label: 'TTS' },
  { id: 'refiner', label: 'Refiner' },
  { id: 'audio', label: 'Audio' },
  { id: 'app', label: 'App' },
  { id: 'ipc', label: 'IPC' },
];

const LogLine: React.FC<{ entry: LogEntry }> = ({ entry }) => {
  const time = entry.time.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const typeColors = {
    info: 'text-[var(--text-secondary)]',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
  };

  const catColor = CATEGORY_COLORS[entry.category] ?? 'text-neutral-400';

  return (
    <div className="flex gap-2 text-[11px] font-mono leading-relaxed">
      <span className="text-[var(--text-secondary)] opacity-50 flex-shrink-0">{time}</span>
      <span className={`${catColor} flex-shrink-0 uppercase`}>[{entry.category}]</span>
      <span className={`${typeColors[entry.type]} break-all`}>{entry.msg}</span>
    </div>
  );
};

export function PanelStats({
  logs,
  sidecarAvailable,
  sidecarStatus,
  sttBackend,
  isSpeaking,
  aiModel,
  hasApiKey,
  audioMetrics,
  ttsStatus: ttsStatusLabel,
  isRecording,
  isProcessing,
  selectedMicLabel,
  appVersion,
}: PanelStatsProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [activeFilter, setActiveFilter] = useState<LogCategory | 'all'>('all');

  const filteredLogs = activeFilter === 'all'
    ? logs
    : logs.filter(l => l.category === activeFilter);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  // STT: healthy se sidecar ok, error se offline (nao ha fallback cloud)
  const sttStatus: 'healthy' | 'warning' | 'error' | 'inactive' = sidecarAvailable
    ? 'healthy'
    : 'error';

  // TTS: independente do health check do STT. Se estiver falando, healthy.
  // Se sidecar offline, warning (tentativa ainda possivel via fallback).
  const ttsStatus: 'healthy' | 'warning' | 'error' | 'inactive' = isSpeaking
    ? 'healthy'
    : sidecarAvailable
      ? 'inactive'
      : 'warning';
  const claudeStatus = hasApiKey ? 'healthy' : 'warning';
  const audioStatus = isRecording ? 'healthy' : (isProcessing ? 'warning' : 'inactive');

  return (
    <div className="p-5 space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Activity className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-sm font-semibold">Sistema</h2>
      </div>

      {/* Split Layout */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden">
        {/* Left: Atividade (Logs) */}
        <div className="flex-[3] flex flex-col min-h-0 md:border-r md:border-[var(--border-subtle)] md:pr-4">
          <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex-shrink-0">
            Atividade
          </label>
          <div className="flex gap-1 flex-wrap mb-2 flex-shrink-0">
            {FILTER_CHIPS.map(chip => (
              <button
                key={chip.id}
                onClick={() => setActiveFilter(chip.id)}
                className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                  activeFilter === chip.id
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-transparent text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--text-secondary)]'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 space-y-1">
            {filteredLogs.length === 0 ? (
              <span className="text-[11px] text-[var(--text-secondary)] font-mono opacity-50">
                Nenhuma atividade registrada.
              </span>
            ) : (
              filteredLogs.map((entry, i) => <LogLine key={i} entry={entry} />)
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Right: Servicos */}
        <div className="flex-[2] flex flex-col min-h-0 overflow-y-auto space-y-3">
          <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex-shrink-0">
            Servicos
          </label>

          {/* STT */}
          <ServiceCard icon={Mic} label="STT" status={sttStatus}>
            <InfoLine
              label="Motor"
              value={
                sttBackend === 'modal'
                  ? 'faster-whisper large-v3-turbo (GPU)'
                  : 'whisper.cpp small (CPU)'
              }
            />
            <InfoLine
              label="Backend"
              value={sttBackend === 'modal' ? 'Modal' : 'VM'}
            />
            <InfoLine label="Status" value={sidecarAvailable ? 'online' : 'offline'} />
          </ServiceCard>

          {/* TTS */}
          <ServiceCard icon={Volume2} label="TTS" status={ttsStatus}>
            <InfoLine label="Motor" value="XTTS v2" />
            {ttsStatusLabel && <InfoLine label="Status" value={ttsStatusLabel} />}
            <InfoLine label="Falando" value={isSpeaking ? 'sim' : 'nao'} />
            {!sidecarAvailable && !isSpeaking && (
              <InfoLine label="Nota" value="health check pendente" />
            )}
          </ServiceCard>

          {/* Claude Refiner */}
          <ServiceCard icon={Sparkles} label="Claude" status={claudeStatus}>
            <InfoLine label="Modelo" value={aiModel} />
            <InfoLine label="API Key" value={hasApiKey ? 'configurada' : 'ausente'} />
          </ServiceCard>

          {/* Audio */}
          <ServiceCard icon={Radio} label="Audio" status={audioStatus}>
            <InfoLine label="Microfone" value={selectedMicLabel} />
            <InfoLine label="Gravando" value={isRecording ? 'sim' : 'nao'} />
            {audioMetrics && (
              <>
                <InfoLine label="Duracao" value={`${audioMetrics.duration.toFixed(1)}s`} />
                <InfoLine label="SNR" value={`${audioMetrics.clarityScore}/100`} />
                <InfoLine label="RMS" value={`${audioMetrics.rmsDB.toFixed(1)} dB`} />
              </>
            )}
          </ServiceCard>

          {/* App */}
          <ServiceCard icon={Box} label="App" status="healthy">
            <InfoLine label="Versao" value={`v${appVersion}`} />
            <InfoLine label="STT" value={sttBackend === 'modal' ? 'Modal (GPU)' : 'VM (CPU)'} />
            <InfoLine label="Processando" value={isProcessing ? 'sim' : 'nao'} />
          </ServiceCard>
        </div>
      </div>
    </div>
  );
}
