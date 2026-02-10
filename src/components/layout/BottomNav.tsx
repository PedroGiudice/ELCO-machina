import * as React from 'react';
import { Mic, Volume2, Settings, Activity } from 'lucide-react';
import type { PanelType } from '../../hooks/useActivePanel';

interface BottomNavProps {
  activePanel: PanelType;
  onPanelChange: (panel: PanelType) => void;
  disabled?: boolean;
}

const navItems: { id: PanelType; label: string; icon: typeof Mic }[] = [
  { id: 'att', label: 'ATT', icon: Mic },
  { id: 'tts', label: 'TTS', icon: Volume2 },
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'stats', label: 'Sistema', icon: Activity },
];

export function BottomNav({ activePanel, onPanelChange, disabled = false }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md px-4"
      style={{
        backgroundColor: 'rgba(26, 26, 28, 0.95)',
        borderTop: '1px solid var(--border-subtle)',
        paddingBottom: 'var(--sab)',
      }}
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = activePanel === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => !disabled && onPanelChange(item.id)}
              disabled={disabled}
              className={`
                relative flex flex-col items-center justify-center
                w-20 h-12 rounded-lg
                transition-colors duration-200
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {/* Indicator */}
              {isActive && (
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{ backgroundColor: 'var(--accent-dim)' }}
                />
              )}

              {/* Icon */}
              <Icon
                className={`relative z-10 w-5 h-5 transition-transform duration-200 ${
                  isActive ? 'scale-110' : ''
                }`}
              />

              {/* Label */}
              <span className="relative z-10 text-xs font-medium mt-1">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
