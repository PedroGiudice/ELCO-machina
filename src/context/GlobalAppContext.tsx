import React, { createContext, useContext, useMemo } from 'react';

// Hooks
import { useAuth, type UseAuthReturn } from '../hooks/useAuth';
import { useSettings, type UseSettingsReturn } from '../hooks/useSettings';
import { usePersistence, type UsePersistenceReturn } from '../hooks/usePersistence';
import { useActivePanel, type PanelType } from '../hooks/useActivePanel';
import { useUpdater, type UseUpdaterReturn } from '../hooks/useUpdater';
import { useSidecar, type UseSidecarReturn } from '../hooks/useSidecar';

// ============================================================================
// CONTEXT TYPE
// ============================================================================

export interface AppContextType {
  auth: UseAuthReturn;
  settings: UseSettingsReturn;
  persistence: UsePersistenceReturn;
  panel: {
    activePanel: PanelType;
    setActivePanel: (panel: PanelType) => void;
    isTransitioning: boolean;
  };
  updater: UseUpdaterReturn;
  sidecar: UseSidecarReturn;
}

// ============================================================================
// CONTEXT
// ============================================================================

const AppContext = createContext<AppContextType | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Inicializar hooks
  const auth = useAuth();
  const settings = useSettings();
  const persistence = usePersistence();
  const panel = useActivePanel('att');
  const updater = useUpdater();
  const sidecar = useSidecar(persistence.addLog);

  const value = useMemo<AppContextType>(() => ({
    auth,
    settings,
    persistence,
    panel,
    updater,
    sidecar,
  }), [auth, settings, persistence, panel, updater, sidecar]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

// ============================================================================
// HOOK DE ACESSO
// ============================================================================

export function useAppContext(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext deve ser usado dentro de <AppProvider>');
  }
  return context;
}

// Hooks de acesso granular para evitar re-renders desnecessarios
export function useAppAuth() {
  return useAppContext().auth;
}

export function useAppSettings() {
  return useAppContext().settings;
}

export function useAppPersistence() {
  return useAppContext().persistence;
}

export function useAppPanel() {
  return useAppContext().panel;
}

export function useAppUpdater() {
  return useAppContext().updater;
}

export function useAppSidecar() {
  return useAppContext().sidecar;
}
