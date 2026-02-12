import * as React from 'react';
import { motion } from 'motion/react';
import { Mic, Users, Zap, Check, FolderOpen, Brain, Plus, ChevronRight, Pencil, Settings2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import type { PromptTemplate } from '../../services/PromptStore';

interface PanelATTProps {
  // Recording
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;

  // Audio
  audioBlob: Blob | null;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadError?: string | null;

  // Recording Config
  recordingStyle: 'Dictation' | 'Interview';
  onRecordingStyleChange: (style: 'Dictation' | 'Interview') => void;

  // Context
  contextPools: string[];
  activeContext: string;
  onContextChange: (ctx: string) => void;
  onAddContext: () => void;
  onOpenMemory: () => void;

  // Output Settings
  outputLanguage: string;
  onLanguageChange: (lang: string) => void;
  outputStyle: string;
  onStyleChange: (style: string) => void;
  customStylePrompt?: string;
  onCustomStyleChange?: (prompt: string) => void;

  // Prompt Templates (fonte unica de verdade)
  templates?: PromptTemplate[];
  onEditPrompt?: (styleName: string) => void;
  onManagePrompts?: () => void;

  // Processing
  isProcessing: boolean;
  onProcess: () => void;

  // Visualizer
  audioVisualizer?: React.ReactNode;

  // Mic info
  selectedMicLabel?: string;
  autoGainControl?: boolean;
}

// Fallback caso templates ainda nao tenham carregado
const FALLBACK_STYLES = [
  'Whisper Only', 'Verbatim', 'Elegant Prose', 'Ana Suy', 'Poetic / Verses',
  'Normal', 'Verbose', 'Concise', 'Formal', 'Prompt (Claude)', 'Prompt (Gemini)',
  'Bullet Points', 'Summary', 'Tech Docs', 'Email', 'Tweet Thread',
  'Code Generator', 'Custom',
];

export function PanelATT({
  isRecording,
  onStartRecording,
  onStopRecording,
  audioBlob,
  onFileUpload,
  uploadError,
  recordingStyle,
  onRecordingStyleChange,
  contextPools,
  activeContext,
  onContextChange,
  onAddContext,
  onOpenMemory,
  outputLanguage,
  onLanguageChange,
  outputStyle,
  onStyleChange,
  customStylePrompt = '',
  onCustomStyleChange,
  templates,
  onEditPrompt,
  onManagePrompts,
  isProcessing,
  onProcess,
  audioVisualizer,
  selectedMicLabel = 'Default Mic',
  autoGainControl = true,
}: PanelATTProps) {
  // Usar templates do PromptStore como fonte de verdade, fallback para lista estatica
  const styleNames = templates && templates.length > 0
    ? templates.map((t) => t.name)
    : FALLBACK_STYLES;
  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Mic className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-sm font-semibold">Audio to Text</h2>
      </div>

      {/* Context Pool Selector */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
            <FolderOpen className="w-3 h-3" />
            Context Scope
          </label>
          <button
            onClick={onOpenMemory}
            className="text-[9px] flex items-center gap-1 hover:opacity-80 transition-colors text-[var(--accent)]"
          >
            <Brain className="w-3 h-3" />
            Memory
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {contextPools.map((ctx) => (
            <motion.button
              key={ctx}
              whileTap={{ scale: 0.95 }}
              onClick={() => onContextChange(ctx)}
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-[var(--radius-sm)] text-[10px] font-medium
                transition-all border
                ${
                  activeContext === ctx
                    ? 'bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-overlay)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }
              `}
            >
              {ctx}
            </motion.button>
          ))}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onAddContext}
            className="flex-shrink-0 w-7 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-overlay)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Plus className="w-3 h-3" />
          </motion.button>
        </div>
      </section>

      <div className="w-full h-px bg-[var(--border-subtle)]" />

      {/* Audio Capture */}
      <section className="space-y-3">
        <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
          <Mic className="w-3 h-3" />
          Audio Input
        </label>

        {/* Recording Style Toggle */}
        <div className="flex gap-2 bg-[var(--bg-overlay)] p-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
          {(['Dictation', 'Interview'] as const).map((style) => (
            <button
              key={style}
              onClick={() => onRecordingStyleChange(style)}
              className={`
                flex-1 py-1.5 text-[10px] rounded-[var(--radius-sm)] transition-all
                flex items-center justify-center gap-1.5
                ${
                  recordingStyle === style
                    ? 'bg-[var(--accent-dim)] text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }
              `}
            >
              {style === 'Dictation' ? <Mic className="w-3 h-3" /> : <Users className="w-3 h-3" />}
              {style}
            </button>
          ))}
        </div>

        {/* Recording Controls */}
        <div className="bg-[var(--bg-overlay)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
          <div className="flex items-center gap-2 mb-3">
            {!isRecording ? (
              <Button variant="secondary" className="flex-1 h-10" onClick={onStartRecording}>
                <div className="w-2 h-2 rounded-full bg-red-500" />
                Record
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="flex-1 h-10 text-red-400 border-red-500/30 bg-red-500/10"
                onClick={onStopRecording}
              >
                <div className="w-3 h-3 bg-red-500 rounded-sm" />
                Stop
              </Button>
            )}
          </div>

          {/* Visualizer Area */}
          <div className="h-12 bg-[var(--bg-base)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden relative">
            {audioVisualizer || (
              <span className="text-[10px] text-[var(--text-secondary)]">
                {isRecording ? 'Recording...' : 'Ready'}
              </span>
            )}
            {isRecording && (
              <div className="absolute top-1 right-2 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] text-red-400 font-mono tracking-tighter">LIVE</span>
              </div>
            )}
          </div>

          {/* Mic Info */}
          <div className="mt-2 text-[9px] text-[var(--text-secondary)] flex justify-between">
            <span>Using: {selectedMicLabel}</span>
            <span className="opacity-50">AGC {autoGainControl ? 'ON' : 'OFF'}</span>
          </div>
        </div>
      </section>

      {/* File Upload */}
      <section className="space-y-3">
        <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
          Import File
        </label>
        <label className="flex items-center justify-between w-full h-11 px-3 bg-[var(--bg-overlay)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--accent-dim)] transition-colors group">
          <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate max-w-[180px]">
            {audioBlob && 'name' in audioBlob
              ? (audioBlob as File).name
              : 'Select MP3, WAV...'}
          </span>
          <ChevronRight className="w-3 h-3 text-[var(--text-secondary)]" />
          <input
            type="file"
            className="hidden"
            accept="audio/*"
            onChange={onFileUpload}
          />
        </label>
        {uploadError && (
          <p className="text-[10px] text-red-400 pl-1">{uploadError}</p>
        )}
      </section>

      <div className="w-full h-px bg-[var(--border-subtle)]" />

      {/* Output Settings */}
      <section className="space-y-4">
        <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          Output Settings
        </label>

        <div className="space-y-3">
          {/* Language */}
          <div>
            <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 block">
              Target Language
            </label>
            <select
              value={outputLanguage}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="w-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] py-2.5 px-3 text-xs focus:outline-none appearance-none text-[var(--text-primary)]"
            >
              <option value="English">English</option>
              <option value="Portuguese">Portuguese</option>
              <option value="Spanish">Spanish</option>
            </select>
          </div>

          {/* Style */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-[var(--text-secondary)]">
                Prompt Style
              </label>
              {onManagePrompts && (
                <button
                  onClick={onManagePrompts}
                  className="text-[9px] flex items-center gap-1 hover:opacity-80 transition-colors text-[var(--accent)]"
                >
                  <Settings2 className="w-3 h-3" />
                  Manage
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              <select
                value={outputStyle}
                onChange={(e) => onStyleChange(e.target.value)}
                className="flex-1 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] py-2.5 px-3 text-xs focus:outline-none appearance-none text-[var(--text-primary)]"
              >
                {styleNames.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
              {onEditPrompt && outputStyle !== 'Whisper Only' && (
                <button
                  onClick={() => onEditPrompt(outputStyle)}
                  className="px-2 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  title="Edit prompt"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Custom Style Input */}
          {outputStyle === 'Custom' && onCustomStyleChange && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label className="text-[10px] text-[var(--text-secondary)] mb-1.5 flex justify-between">
                <span>Instructions</span>
                <span
                  className={customStylePrompt.length > 150 ? 'text-red-400' : 'opacity-50'}
                >
                  {customStylePrompt.length}/150
                </span>
              </label>
              <textarea
                value={customStylePrompt}
                onChange={(e) => onCustomStyleChange(e.target.value.slice(0, 150))}
                placeholder="E.g. Explain like I'm five..."
                className="w-full h-20 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] p-3 text-xs focus:outline-none resize-none placeholder:opacity-30 text-[var(--text-primary)]"
              />
            </motion.div>
          )}
        </div>
      </section>

      {/* Process Button */}
      <Button
        variant="primary"
        className="w-full h-12"
        onClick={onProcess}
        disabled={!audioBlob || isProcessing}
        isLoading={isProcessing}
      >
        {isProcessing ? (
          'Processing...'
        ) : (
          <>
            <Zap className="w-3.5 h-3.5" />
            {outputStyle === 'Verbatim' || outputStyle === 'Whisper Only'
              ? 'Transcribe'
              : outputStyle === 'Code Generator'
              ? 'Generate Code'
              : 'Refine Text'}
          </>
        )}
      </Button>

      {/* Ready Indicator */}
      {audioBlob && !isProcessing && (
        <div className="flex items-center gap-2 justify-center text-[10px] text-[var(--text-secondary)]">
          <Check className="w-3 h-3 text-emerald-500" />
          Ready: {(audioBlob.size / 1024).toFixed(1)} KB
        </div>
      )}
    </div>
  );
}
