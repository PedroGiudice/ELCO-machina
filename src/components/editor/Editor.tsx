import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Minus,
  Plus,
  Trash2,
  Copy,
  Volume2,
  VolumeX,
  Terminal,
  Feather,
} from 'lucide-react';
import { Button } from '../ui/Button';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  isProcessing?: boolean;
  isSpeaking?: boolean;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  onClear?: () => void;
  onCopy?: () => void;
  onExportTxt?: () => void;
  onExportMd?: () => void;
  onReadText?: () => void;
  onStopReading?: () => void;
  canRead?: boolean;
  outputStyle?: string;
  activeContext?: string;
  aiModel?: string;
}

export function Editor({
  value,
  onChange,
  isProcessing = false,
  isSpeaking = false,
  fontSize = 14,
  onFontSizeChange,
  onClear,
  onCopy,
  onExportTxt,
  onExportMd,
  onReadText,
  onStopReading,
  canRead = false,
  outputStyle = 'Verbatim',
  activeContext = 'General',
  aiModel = 'gemini-2.5-flash',
}: EditorProps) {
  const lineCount = value.split('\n').length;
  const charCount = value.length;

  const isCodeMode = outputStyle === 'Code Generator';

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)]">
      {/* Toolbar */}
      <div className="h-12 border-b border-[var(--border-subtle)] flex items-center px-4 justify-between bg-[var(--bg-elevated)] shrink-0">
        {/* Left: Title + Context */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Output
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent-dim)] text-[var(--text-secondary)]">
            {activeContext}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Font Size Controls - Desktop */}
          {onFontSizeChange && (
            <div className="hidden md:flex items-center gap-1 mr-2">
              <button
                onClick={() => onFontSizeChange(Math.max(10, fontSize - 1))}
                className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-dim)] transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-[10px] text-[var(--text-secondary)] w-6 text-center font-mono">
                {fontSize}
              </span>
              <button
                onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))}
                className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-dim)] transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Clear */}
          {onClear && value && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden md:inline">Clear</span>
            </Button>
          )}

          {/* Export */}
          {onExportTxt && value && (
            <Button variant="ghost" size="sm" onClick={onExportTxt}>
              <span className="text-[10px]">TXT</span>
            </Button>
          )}
          {onExportMd && value && (
            <Button variant="ghost" size="sm" onClick={onExportMd}>
              <span className="text-[10px]">MD</span>
            </Button>
          )}

          {/* TTS */}
          {(onReadText || onStopReading) && value && (
            <Button
              variant={isSpeaking ? 'secondary' : 'ghost'}
              size="sm"
              onClick={isSpeaking ? onStopReading : onReadText}
              disabled={!canRead}
              className={isSpeaking ? 'text-red-400 border-red-500/50' : ''}
            >
              {isSpeaking ? (
                <VolumeX className="w-3 h-3" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
              <span className="hidden md:inline">{isSpeaking ? 'Stop' : 'Read'}</span>
            </Button>
          )}

          {/* Copy */}
          {onCopy && (
            <Button variant="primary" size="sm" onClick={onCopy}>
              <Copy className="w-3 h-3" />
              <span className="hidden md:inline">Copy</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{ fontSize: `${fontSize}px` }}
          className={`
            w-full h-full bg-transparent border-0
            p-4 md:p-8 resize-none
            focus:ring-0 focus:outline-none
            leading-relaxed placeholder:opacity-30
            ${isCodeMode ? 'font-mono' : 'font-editor'}
            text-[var(--text-primary)]
          `}
          placeholder={isProcessing ? 'Processando...' : 'Digite ou cole texto aqui...'}
        />

        {/* Empty State Decoration */}
        <AnimatePresence>
          {!value && !isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 select-none pointer-events-none"
            >
              {isCodeMode ? (
                <Terminal className="w-24 h-24" />
              ) : (
                <Feather className="w-24 h-24" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status Footer */}
      <div className="h-7 border-t border-[var(--border-subtle)] flex items-center px-4 justify-between bg-[var(--bg-elevated)] text-[9px] text-[var(--text-secondary)] font-mono shrink-0">
        <div className="flex items-center gap-4">
          <span>Ln {lineCount}, Col {charCount}</span>
          <span>UTF-8</span>
          <span className="hidden md:inline opacity-50">
            Model: {aiModel.replace('gemini-', '')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isProcessing ? 'bg-yellow-500 animate-pulse' : 'bg-[var(--border-subtle)]'
            }`}
          />
          <span>{isProcessing ? 'PROCESSING' : 'READY'}</span>
        </div>
      </div>
    </div>
  );
}
