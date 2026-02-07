import * as React from 'react';
import { useRef, useEffect } from 'react';
import { Activity, Mic, Volume2, Sparkles, Radio, Box } from 'lucide-react';

type AudioMetrics = {
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

type LogEntry = {
  msg: string;
  type: 'info' | 'success' | 'error';
  time?: Date;
};

interface PanelStatsProps {
  logs: LogEntry[];
  sidecarAvailable: boolean;
  sidecarStatus: string;
  whisperServerUrl: string;
  transcriptionMode: 'auto' | 'local' | 'cloud';
  ttsEngine: 'piper' | 'chatterbox';
  ttsProfile: string;
  isSpeaking: boolean;
  aiModel: string;
  hasApiKey: boolean;
  audioMetrics: AudioMetrics | null;
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

function LogLine({ entry }: { entry: LogEntry }) {
  const time = entry.time
    ? entry.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  const typeColors = {
    info: 'text-[var(--text-secondary)]',
    success: 'text-emerald-400',
    error: 'text-red-400',
  };

  return (
    <div className="flex gap-2 text-[11px] font-mono leading-relaxed">
      <span className="text-[var(--text-secondary)] opacity-50 flex-shrink-0">{time}</span>
      <span className={`${typeColors[entry.type]} break-all`}>{entry.msg}</span>
    </div>
  );
}

export function PanelStats({
  logs,
  sidecarAvailable,
  sidecarStatus,
  whisperServerUrl,
  transcriptionMode,
  ttsEngine,
  ttsProfile,
  isSpeaking,
  aiModel,
  hasApiKey,
  audioMetrics,
  isRecording,
  isProcessing,
  selectedMicLabel,
  appVersion,
}: PanelStatsProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const sttStatus = sidecarAvailable ? 'healthy' : 'error';
  const ttsStatus = sidecarAvailable ? (isSpeaking ? 'healthy' : 'inactive') : 'error';
  const geminiStatus = hasApiKey ? 'healthy' : 'warning';
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
          <div className="flex-1 overflow-y-auto bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3 space-y-1">
            {logs.length === 0 ? (
              <span className="text-[11px] text-[var(--text-secondary)] font-mono opacity-50">
                Nenhuma atividade registrada.
              </span>
            ) : (
              logs.map((entry, i) => <LogLine key={i} entry={entry} />)
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
              label="Engine"
              value={transcriptionMode === 'cloud' ? 'Gemini' : 'Whisper'}
            />
            <InfoLine label="Mode" value={transcriptionMode} />
            <InfoLine label="Status" value={sidecarStatus} />
            {whisperServerUrl && (
              <InfoLine label="Server" value={whisperServerUrl.replace(/^https?:\/\//, '')} />
            )}
          </ServiceCard>

          {/* TTS */}
          <ServiceCard icon={Volume2} label="TTS" status={ttsStatus}>
            <InfoLine label="Engine" value={ttsEngine} />
            <InfoLine label="Profile" value={ttsProfile} />
            <InfoLine label="Speaking" value={isSpeaking ? 'sim' : 'nao'} />
          </ServiceCard>

          {/* Gemini */}
          <ServiceCard icon={Sparkles} label="Gemini" status={geminiStatus}>
            <InfoLine label="Model" value={aiModel} />
            <InfoLine label="API Key" value={hasApiKey ? 'configurada' : 'ausente'} />
          </ServiceCard>

          {/* Audio */}
          <ServiceCard icon={Radio} label="Audio" status={audioStatus}>
            <InfoLine label="Mic" value={selectedMicLabel} />
            <InfoLine label="Recording" value={isRecording ? 'sim' : 'nao'} />
            {audioMetrics && (
              <>
                <InfoLine label="Duration" value={`${audioMetrics.duration.toFixed(1)}s`} />
                <InfoLine label="SNR" value={`${audioMetrics.clarityScore}/100`} />
                <InfoLine label="RMS" value={`${audioMetrics.rmsDB.toFixed(1)} dB`} />
              </>
            )}
          </ServiceCard>

          {/* App */}
          <ServiceCard icon={Box} label="App" status="healthy">
            <InfoLine label="Version" value={`v${appVersion}`} />
            <InfoLine label="Trans. Mode" value={transcriptionMode} />
            <InfoLine label="Processing" value={isProcessing ? 'sim' : 'nao'} />
          </ServiceCard>
        </div>
      </div>
    </div>
  );
}
