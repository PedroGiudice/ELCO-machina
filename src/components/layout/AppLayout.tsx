import * as React from 'react';
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
      className="flex flex-col h-full w-full"
      style={{
        backgroundColor: 'var(--bg-base)',
        color: 'var(--text-primary)',
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
            ${isFullscreenPanel ? 'w-full' : 'w-full md:w-80'}
            flex flex-col overflow-hidden
            ${isFullscreenPanel ? 'max-h-full' : 'md:max-h-full max-h-[45vh]'}
          `}
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderRight: isFullscreenPanel ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex-1 overflow-y-auto pb-20">
            {currentPanel}
          </div>
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
