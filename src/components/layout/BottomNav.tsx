import * as React from 'react';
import { motion } from 'motion/react';
import { Mic, FileText, Volume2, Settings, Activity } from 'lucide-react';
import type { PanelType } from '../../hooks/useActivePanel';

interface BottomNavProps {
  activePanel: PanelType;
  onPanelChange: (panel: PanelType) => void;
  disabled?: boolean;
}

const navItems: { id: PanelType; label: string; icon: typeof Mic }[] = [
  { id: 'att', label: 'ATT', icon: Mic },
  { id: 'editor', label: 'Editor', icon: FileText },
  { id: 'tts', label: 'TTS', icon: Volume2 },
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'stats', label: 'Sistema', icon: Activity },
];

export function BottomNav({ activePanel, onPanelChange, disabled = false }: BottomNavProps) {
  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0 z-50
        bg-[var(--bg-elevated)]/95 backdrop-blur-md
        border-t border-[var(--border-subtle)]
        pb-[var(--sab)] px-4
      "
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = activePanel === item.id;
          const Icon = item.icon;

          return (
            <motion.button
              key={item.id}
              onClick={() => !disabled && onPanelChange(item.id)}
              disabled={disabled}
              whileTap={{ scale: 0.95 }}
              className={`
                relative flex flex-col items-center justify-center
                w-20 h-12 rounded-[var(--radius-md)]
                transition-colors duration-200
                ${isActive
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {/* Indicator */}
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute inset-0 bg-[var(--accent-dim)] rounded-[var(--radius-md)]"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
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
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
