// Hooks centralizados do ELCO-machina
export { useAuth, type UseAuthReturn } from './useAuth';
export { useSettings, type UseSettingsReturn } from './useSettings';
export { usePersistence, type UsePersistenceReturn } from './usePersistence';
export { useActivePanel, type PanelType } from './useActivePanel';
export { useUpdater, type UseUpdaterReturn } from './useUpdater';
export { useSidecar, type UseSidecarReturn } from './useSidecar';

// Hooks de dominio
export { useTTS, type UseTTSReturn } from './useTTS';
export {
  useAudioProcessing,
  type UseAudioProcessingConfig,
  type UseAudioProcessingReturn,
} from './useAudioProcessing';
export {
  useAudioRecording,
  type UseAudioRecordingReturn,
  type AudioMetrics,
} from './useAudioRecording';
