import { useState, useCallback, useMemo } from 'react';

export type PanelType = 'att' | 'tts' | 'config' | 'stats';

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

  return useMemo(() => ({
    activePanel,
    setActivePanel: changePanel,
    isTransitioning,
  }), [activePanel, changePanel, isTransitioning]);
}
