import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BottomNav } from './BottomNav';
import type { PanelType } from '../../hooks/useActivePanel';

interface AppLayoutProps {
  activePanel: PanelType;
  onPanelChange: (panel: PanelType) => void;
  isProcessing?: boolean;
  editor: React.ReactNode;
  panelATT: React.ReactNode;
  panelTTS: React.ReactNode;
  panelConfig: React.ReactNode;
  panelStats: React.ReactNode;
}

const panelVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export function AppLayout({
  activePanel,
  onPanelChange,
  isProcessing = false,
  editor,
  panelATT,
  panelTTS,
  panelConfig,
  panelStats,
}: AppLayoutProps) {
  const currentPanel = {
    att: panelATT,
    editor,
    tts: panelTTS,
    config: panelConfig,
    stats: panelStats,
  }[activePanel];

  return (
    <div
      className="
        flex flex-col h-full w-full
        bg-[var(--bg-base)]
        text-[var(--text-primary)]
      "
      style={{
        paddingTop: 'var(--sat)',
        paddingLeft: 'var(--sal)',
        paddingRight: 'var(--sar)',
      }}
    >
      {/* Full-screen panel */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activePanel}
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="min-h-full pb-32"
          >
            {currentPanel}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Navigation */}
      <BottomNav
        activePanel={activePanel}
        onPanelChange={onPanelChange}
        disabled={isProcessing}
      />

      {/* Bottom padding for safe area below nav */}
      <div className="h-[var(--sab)] shrink-0" />
    </div>
  );
}
