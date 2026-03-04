import * as React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '../ui/Button';

interface PanelTTSProps {
  // Estado
  isSpeaking: boolean;
  canSpeak: boolean;
  hasText: boolean;

  // Acoes
  onReadText: () => void;
  onStopReading: () => void;
}

export function PanelTTS({
  isSpeaking,
  canSpeak,
  hasText,
  onReadText,
  onStopReading,
}: PanelTTSProps) {
  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-sm font-semibold">Texto para Fala</h2>
      </div>

      {/* Botao principal */}
      <Button
        variant={isSpeaking ? 'secondary' : 'primary'}
        className={`w-full h-14 text-base ${isSpeaking ? 'text-red-400 border-red-500/50' : ''}`}
        onClick={isSpeaking ? onStopReading : onReadText}
        disabled={!canSpeak || !hasText}
      >
        {isSpeaking ? (
          <>
            <VolumeX className="w-5 h-5" />
            Parar Leitura
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

      {!canSpeak && hasText && (
        <p className="text-[10px] text-red-400 text-center">
          Servidor de voz inacessivel. Verifique se o sidecar esta ativo.
        </p>
      )}
    </div>
  );
}
