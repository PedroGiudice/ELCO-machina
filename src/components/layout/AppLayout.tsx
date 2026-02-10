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
    tts: panelTTS,
    config: panelConfig,
    stats: panelStats,
  }[activePanel];

  const isFullscreenPanel = activePanel === 'stats';

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
        {/* Panel Area */}
        <aside
          className={`
            ${isFullscreenPanel ? 'w-full' : 'w-full md:w-[340px]'}
            bg-[var(--bg-elevated)]
            ${isFullscreenPanel ? '' : 'border-r border-[var(--border-subtle)]'}
            flex flex-col
            overflow-hidden
            ${isFullscreenPanel ? 'max-h-full' : 'md:max-h-full max-h-[45vh]'}
          `}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activePanel}
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex-1 overflow-y-auto pb-20"
            >
              {currentPanel}
            </motion.div>
          </AnimatePresence>
        </aside>

        {/* Editor Area - Hidden when Stats panel is active */}
        {!isFullscreenPanel && (
          <main className="flex-1 flex flex-col overflow-hidden min-h-0">
            {editor}
          </main>
        )}
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
