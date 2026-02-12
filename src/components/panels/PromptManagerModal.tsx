/**
 * PromptManagerModal - Lista completa de templates com CRUD
 *
 * Criar, duplicar, deletar, import/export, reset builtins.
 * Segue padrao visual do Memory Editor modal.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Download, Upload, RotateCcw, Pencil, Copy, Trash2 } from 'lucide-react';
import type { PromptTemplate } from '../../services/PromptStore';

interface PromptManagerModalProps {
  templates: PromptTemplate[];
  isOpen: boolean;
  onClose: () => void;
  onEditTemplate: (template: PromptTemplate) => void;
  onNewTemplate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => Promise<boolean>;
  onResetBuiltins: () => Promise<void>;
  onExport: () => void;
  onImport: () => void;
}

export function PromptManagerModal({
  templates,
  isOpen,
  onClose,
  onEditTemplate,
  onNewTemplate,
  onDuplicate,
  onDelete,
  onResetBuiltins,
  onExport,
  onImport,
}: PromptManagerModalProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Resetar estados ao fechar/abrir
  useEffect(() => {
    if (isOpen) {
      setConfirmReset(false);
      setDeletingId(null);
    }
  }, [isOpen]);

  // Keyboard: Escape fecha
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const builtins = templates.filter((t) => t.isBuiltin);
  const customs = templates.filter((t) => !t.isBuiltin);

  const handleDelete = useCallback(
    async (id: string) => {
      if (deletingId !== id) {
        setDeletingId(id);
        return;
      }
      await onDelete(id);
      setDeletingId(null);
    },
    [deletingId, onDelete],
  );

  const handleReset = useCallback(async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    await onResetBuiltins();
    setConfirmReset(false);
  }, [confirmReset, onResetBuiltins]);

  if (!isOpen) return null;

  const TemplateRow = ({ t, showDelete }: { t: PromptTemplate; showDelete: boolean }) => (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-white/5 rounded transition-colors group">
      <div className="flex-1 min-w-0">
        <span className="text-xs text-white/80 truncate block">{t.name}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-[9px] font-mono text-white/30">
          temp: {t.temperature.toFixed(1)}
        </span>
        <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEditTemplate(t)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Edit"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDuplicate(t.id)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Duplicate"
          >
            <Copy className="w-3 h-3" />
          </button>
          {showDelete && (
            <button
              onClick={() => handleDelete(t.id)}
              className={`p-1 rounded transition-colors ${
                deletingId === t.id
                  ? 'bg-red-500/20 text-red-400'
                  : 'hover:bg-red-500/10 text-white/50 hover:text-red-400'
              }`}
              title={deletingId === t.id ? 'Click again to confirm' : 'Delete'}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-sm font-bold">Prompt Manager</h2>
          <button
            onClick={onClose}
            className="opacity-50 hover:opacity-100 transition-opacity"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-white/10 flex flex-wrap gap-2">
          <button
            onClick={onNewTemplate}
            className="px-3 py-1.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" />
            New Prompt
          </button>
          <button
            onClick={onImport}
            className="px-3 py-1.5 text-[10px] font-medium bg-white/5 text-white/60 border border-white/10 rounded hover:bg-white/10 transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3 h-3" />
            Import
          </button>
          <button
            onClick={onExport}
            className="px-3 py-1.5 text-[10px] font-medium bg-white/5 text-white/60 border border-white/10 rounded hover:bg-white/10 transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            Export
          </button>
          <button
            onClick={handleReset}
            className={`px-3 py-1.5 text-[10px] font-medium border rounded transition-colors flex items-center gap-1.5 ${
              confirmReset
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            {confirmReset ? 'Sure? Click again' : 'Reset Builtins'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Builtins */}
          <div>
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
              Builtins ({builtins.length})
            </h3>
            <div className="border border-white/10 rounded-md divide-y divide-white/5">
              {builtins.map((t) => (
                <TemplateRow key={t.id} t={t} showDelete={false} />
              ))}
            </div>
          </div>

          {/* Custom */}
          {customs.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                Custom ({customs.length})
              </h3>
              <div className="border border-white/10 rounded-md divide-y divide-white/5">
                {customs.map((t) => (
                  <TemplateRow key={t.id} t={t} showDelete={true} />
                ))}
              </div>
            </div>
          )}

          {customs.length === 0 && (
            <p className="text-[10px] text-white/30 text-center py-4">
              No custom templates yet. Click &ldquo;New Prompt&rdquo; or &ldquo;Duplicate&rdquo; a builtin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
