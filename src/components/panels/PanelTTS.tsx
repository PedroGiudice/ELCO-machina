import * as React from 'react';
import { motion } from 'motion/react';
import { Volume2, VolumeX, ChevronRight, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';

interface TTSCustomParams {
  exaggeration: number;
  speed: number;
  stability: number;
  steps: number;
  sentence_silence: number;
}

interface PanelTTSProps {
  // State
  isSpeaking: boolean;
  canSpeak: boolean;
  hasText: boolean;

  // Actions
  onReadText: () => void;
  onStopReading: () => void;

  // Engine Settings
  ttsEngine: 'piper' | 'chatterbox';
  onEngineChange: (engine: 'piper' | 'chatterbox') => void;

  // Profile
  ttsProfile: string;
  onProfileChange: (profile: string) => void;

  // Custom Params
  ttsCustomParams: TTSCustomParams;
  onCustomParamsChange: (params: TTSCustomParams) => void;

  // Voice Cloning
  voiceRefAudio: string | null;
  onVoiceRefChange: (ref: string | null) => void;
}

const profiles = [
  { id: 'standard', label: 'Standard', desc: 'Balanced' },
  { id: 'legal', label: 'Legal', desc: 'Formal' },
  { id: 'expressive', label: 'Expressive', desc: 'Emotional' },
  { id: 'fast_preview', label: 'Fast Preview', desc: 'Quick' },
  { id: 'custom', label: 'Custom', desc: 'Your settings' },
];

export function PanelTTS({
  isSpeaking,
  canSpeak,
  hasText,
  onReadText,
  onStopReading,
  ttsEngine,
  onEngineChange,
  ttsProfile,
  onProfileChange,
  ttsCustomParams,
  onCustomParamsChange,
  voiceRefAudio,
  onVoiceRefChange,
}: PanelTTSProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          onVoiceRefChange(reader.result.split(',')[1]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-sm font-semibold">Text to Speech</h2>
      </div>

      {/* Main Action */}
      <Button
        variant={isSpeaking ? 'secondary' : 'primary'}
        className={`w-full h-14 text-base ${isSpeaking ? 'text-red-400 border-red-500/50' : ''}`}
        onClick={isSpeaking ? onStopReading : onReadText}
        disabled={!canSpeak || !hasText}
      >
        {isSpeaking ? (
          <>
            <VolumeX className="w-5 h-5" />
            Stop Reading
          </>
        ) : (
          <>
            <Volume2 className="w-5 h-5" />
            Read Text Aloud
          </>
        )}
      </Button>

      {!hasText && (
        <p className="text-[10px] text-[var(--text-secondary)] text-center">
          Write or transcribe text first
        </p>
      )}

      {!canSpeak && hasText && (
        <p className="text-[10px] text-red-400 text-center">
          Voice AI server unavailable
        </p>
      )}

      <div className="w-full h-px bg-[var(--border-subtle)]" />

      {/* Engine Selection */}
      <section className="space-y-3">
        <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          TTS Engine
        </label>
        <div className="grid grid-cols-2 gap-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => onEngineChange('chatterbox')}
            className={`
              flex flex-col items-start p-3 rounded-[var(--radius-md)] border transition-all text-left
              ${
                ttsEngine === 'chatterbox'
                  ? 'bg-[var(--accent-dim)] border-[var(--accent)]'
                  : 'bg-[var(--bg-overlay)] border-[var(--border-subtle)] opacity-60 hover:opacity-100'
              }
            `}
          >
            <span className="text-xs font-bold">Chatterbox</span>
            <span className="text-[9px] text-[var(--text-secondary)]">
              Natural, voice cloning
            </span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => onEngineChange('piper')}
            className={`
              flex flex-col items-start p-3 rounded-[var(--radius-md)] border transition-all text-left
              ${
                ttsEngine === 'piper'
                  ? 'bg-[var(--accent-dim)] border-[var(--accent)]'
                  : 'bg-[var(--bg-overlay)] border-[var(--border-subtle)] opacity-60 hover:opacity-100'
              }
            `}
          >
            <span className="text-xs font-bold">Piper</span>
            <span className="text-[9px] text-[var(--text-secondary)]">Local, fast</span>
          </motion.button>
        </div>
      </section>

      {/* Chatterbox Settings */}
      {ttsEngine === 'chatterbox' && (
        <>
          <div className="w-full h-px bg-[var(--border-subtle)]" />

          {/* Profile Selection */}
          <section className="space-y-3">
            <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Voice Profile
            </label>
            <div className="space-y-2">
              {profiles.map((profile) => (
                <motion.button
                  key={profile.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onProfileChange(profile.id)}
                  className={`
                    w-full flex items-center justify-between p-3 rounded-[var(--radius-sm)] border transition-all
                    ${
                      ttsProfile === profile.id
                        ? 'bg-[var(--accent-dim)] border-[var(--accent)]'
                        : 'bg-[var(--bg-overlay)] border-[var(--border-subtle)] opacity-60 hover:opacity-100'
                    }
                  `}
                >
                  <div className="flex flex-col items-start">
                    <span className="text-xs font-medium">{profile.label}</span>
                    <span className="text-[9px] text-[var(--text-secondary)]">
                      {profile.desc}
                    </span>
                  </div>
                  {ttsProfile === profile.id && (
                    <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                  )}
                </motion.button>
              ))}
            </div>
          </section>

          {/* Custom Parameters */}
          {ttsProfile === 'custom' && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4 p-3 bg-[var(--bg-base)] rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
            >
              <Slider
                label="Expressiveness"
                value={ttsCustomParams.exaggeration}
                onChange={(v) =>
                  onCustomParamsChange({ ...ttsCustomParams, exaggeration: v })
                }
                min={0}
                max={1}
                step={0.1}
                formatValue={(v) => v.toFixed(1)}
              />
              <Slider
                label="Speed"
                value={ttsCustomParams.speed}
                onChange={(v) =>
                  onCustomParamsChange({ ...ttsCustomParams, speed: v })
                }
                min={0.5}
                max={2}
                step={0.1}
                formatValue={(v) => `${v.toFixed(1)}x`}
              />
              <Slider
                label="Stability"
                value={ttsCustomParams.stability}
                onChange={(v) =>
                  onCustomParamsChange({ ...ttsCustomParams, stability: v })
                }
                min={0}
                max={1}
                step={0.1}
                formatValue={(v) => v.toFixed(1)}
              />
              <Slider
                label="Quality (steps)"
                value={ttsCustomParams.steps}
                onChange={(v) =>
                  onCustomParamsChange({ ...ttsCustomParams, steps: v })
                }
                min={4}
                max={32}
                step={2}
                formatValue={(v) => String(v)}
              />
            </motion.section>
          )}

          <div className="w-full h-px bg-[var(--border-subtle)]" />

          {/* Voice Cloning */}
          <section className="space-y-3">
            <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Voice Cloning (Optional)
            </label>
            <label className="flex items-center justify-between w-full h-11 px-3 bg-[var(--bg-overlay)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] cursor-pointer hover:bg-[var(--accent-dim)] transition-colors group">
              <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] flex items-center gap-2">
                <Upload className="w-3 h-3" />
                {voiceRefAudio ? 'Voice reference loaded' : 'Upload voice sample'}
              </span>
              <ChevronRight className="w-3 h-3 text-[var(--text-secondary)]" />
              <input
                type="file"
                className="hidden"
                accept="audio/*"
                onChange={handleFileChange}
              />
            </label>
            {voiceRefAudio && (
              <button
                onClick={() => onVoiceRefChange(null)}
                className="text-[10px] text-red-400 hover:text-red-300"
              >
                Remove voice reference
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
