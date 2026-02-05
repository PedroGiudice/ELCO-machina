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
}: AppLayoutProps) {
  const currentPanel = {
    att: panelATT,
    tts: panelTTS,
    config: panelConfig,
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
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Panel Area - Left on desktop, overlay on mobile */}
        <aside
          className="
            w-full md:w-[340px]
            bg-[var(--bg-elevated)]
            border-r border-[var(--border-subtle)]
            flex flex-col
            overflow-hidden
            md:max-h-full
            max-h-[45vh]
          "
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activePanel}
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex-1 overflow-y-auto"
            >
              {currentPanel}
            </motion.div>
          </AnimatePresence>
        </aside>

        {/* Editor Area - Always visible, takes remaining space */}
        <main className="flex-1 flex flex-col overflow-hidden min-h-0">
          {editor}
        </main>
      </div>

      {/* Bottom Navigation */}
      <BottomNav
        activePanel={activePanel}
        onPanelChange={onPanelChange}
        disabled={isProcessing}
      />

      {/* Bottom padding for mobile nav */}
      <div className="h-16 md:h-0 shrink-0" />
    </div>
  );
}
