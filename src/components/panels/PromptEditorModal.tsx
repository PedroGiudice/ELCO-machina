/**
 * PromptEditorModal - Editar system instruction e temperature de um PromptTemplate
 *
 * Segue padrao visual do Memory Editor modal (bg-black/80, backdrop-blur, bg-[#18181b]).
 * Keyboard: Escape fecha, Ctrl+S salva.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, Copy, Trash2 } from 'lucide-react';
import type { PromptTemplate } from '../../services/PromptStore';

interface PromptEditorModalProps {
  template: PromptTemplate;
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: PromptTemplate) => Promise<void>;
  onDuplicate: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;
}

const PLACEHOLDERS = [
  '{CONTEXT_MEMORY}',
  '{OUTPUT_LANGUAGE}',
  '{RECORDING_STYLE}',
  '{CUSTOM_INSTRUCTIONS}',
];

const MAX_INSTRUCTION_LENGTH = 5120;

export function PromptEditorModal({
  template,
  isOpen,
  onClose,
  onSave,
  onDuplicate,
  onDelete,
}: PromptEditorModalProps) {
  const [name, setName] = useState(template.name);
  const [systemInstruction, setSystemInstruction] = useState(template.systemInstruction);
  const [temperature, setTemperature] = useState(template.temperature);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Resetar estado quando template muda
  useEffect(() => {
    setName(template.name);
    setSystemInstruction(template.systemInstruction);
    setTemperature(template.temperature);
    setConfirmDelete(false);
  }, [template]);

  const hasChanges =
    name !== template.name ||
    systemInstruction !== template.systemInstruction ||
    temperature !== template.temperature;

  const handleSave = useCallback(async () => {
    if (!hasChanges || isSaving) return;
    setIsSaving(true);
    try {
      await onSave({
        ...template,
        name: name.trim(),
        systemInstruction,
        temperature,
        updatedAt: Date.now(),
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [hasChanges, isSaving, onSave, template, name, systemInstruction, temperature, onClose]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(template.id);
    onClose();
  }, [onDelete, confirmDelete, template.id, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, handleSave]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-sm font-bold flex items-center gap-2">
            Edit Prompt: &ldquo;{template.name}&rdquo;
          </h2>
          <button
            onClick={onClose}
            className="opacity-50 hover:opacity-100 transition-opacity"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
          {/* Name */}
          <div>
            <label className="text-[10px] text-white/50 mb-1.5 block uppercase tracking-wider font-bold">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-white/30"
            />
          </div>

          {/* System Instruction */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold">
                System Instruction
              </label>
              <span
                className={`text-[9px] font-mono ${
                  systemInstruction.length > MAX_INSTRUCTION_LENGTH
                    ? 'text-red-400'
                    : 'text-white/30'
                }`}
              >
                {systemInstruction.length}/{MAX_INSTRUCTION_LENGTH}
              </span>
            </div>
            <textarea
              value={systemInstruction}
              onChange={(e) =>
                setSystemInstruction(e.target.value.slice(0, MAX_INSTRUCTION_LENGTH))
              }
              className="flex-1 min-h-[200px] w-full bg-black/20 border border-white/10 rounded-md p-3 text-xs font-mono focus:outline-none focus:border-white/30 resize-none leading-relaxed"
              placeholder="System instruction for this prompt style..."
            />
          </div>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-white/50 uppercase tracking-wider font-bold">
                Temperature
              </label>
              <span className="text-[10px] font-mono text-white/60">{temperature.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
            />
            <div className="flex justify-between text-[8px] text-white/20 mt-1">
              <span>0.0 (preciso)</span>
              <span>1.0</span>
              <span>2.0 (criativo)</span>
            </div>
          </div>

          {/* Placeholders */}
          <div>
            <label className="text-[10px] text-white/50 mb-1.5 block uppercase tracking-wider font-bold">
              Placeholders disponíveis
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((ph) => (
                <span
                  key={ph}
                  className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[9px] font-mono text-white/40"
                >
                  {ph}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {template.isBuiltin ? (
              <span className="text-[9px] text-white/30 px-2 py-1 bg-white/5 rounded">
                Builtin -- cannot delete
              </span>
            ) : (
              onDelete && (
                <button
                  onClick={handleDelete}
                  className={`px-3 py-2 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5 ${
                    confirmDelete
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'text-red-400 hover:bg-red-500/10'
                  }`}
                >
                  <Trash2 className="w-3 h-3" />
                  {confirmDelete ? 'Sure? Click again' : 'Delete'}
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onDuplicate(template.id)}
              className="px-3 py-2 text-xs font-medium text-white/60 hover:text-white/90 hover:bg-white/5 rounded-sm transition-colors flex items-center gap-1.5"
            >
              <Copy className="w-3 h-3" />
              Duplicate
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="px-4 py-2 text-white text-xs font-medium rounded-sm transition-colors shadow-lg flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ backgroundColor: hasChanges ? '#3b82f6' : '#3b82f640' }}
            >
              <Save className="w-3 h-3" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
