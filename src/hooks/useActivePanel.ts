import { useState, useCallback } from 'react';

export type PanelType = 'att' | 'tts' | 'config';

export function useActivePanel(initialPanel: PanelType = 'att') {
  const [activePanel, setActivePanel] = useState<PanelType>(initialPanel);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const changePanel = useCallback((panel: PanelType) => {
    if (panel === activePanel || isTransitioning) return;

    setIsTransitioning(true);
    setActivePanel(panel);

    // Reset transition state after animation completes
    setTimeout(() => {
      setIsTransitioning(false);
    }, 300);
  }, [activePanel, isTransitioning]);

  return {
    activePanel,
    setActivePanel: changePanel,
    isTransitioning,
  };
}
