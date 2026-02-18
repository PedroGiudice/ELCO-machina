import { useState, useEffect, useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready';

export interface UseUpdaterReturn {
  updateStatus: UpdateStatus;
  updateProgress: number;
  updateVersion: string | null;
}

// ============================================================================
// UTILS
// ============================================================================

const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

const isAndroid = (): boolean => {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
};

const ANDROID_UPDATE_URL = 'http://100.114.203.28:8090/proatt/latest-android.json';

const isNewerVersion = (remote: string, local: string): boolean => {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
};

// ============================================================================
// HOOK
// ============================================================================

export function useUpdater(): UseUpdaterReturn {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    const checkForUpdatesDesktop = async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const { relaunch } = await import('@tauri-apps/plugin-process');
        const { ask } = await import('@tauri-apps/plugin-dialog');

        setUpdateStatus('checking');
        const update = await check();

        if (update) {
          setUpdateStatus('available');
          setUpdateVersion(update.version);
          console.log(`[Updater] Nova versao disponivel: ${update.version}`);

          const shouldDownload = await ask(
            `Nova versao ${update.version} disponivel. Deseja baixar e instalar agora?`,
            { title: 'Atualizacao Disponivel', kind: 'info' },
          );

          if (!shouldDownload) {
            console.log('[Updater] Usuario recusou a atualizacao');
            setUpdateStatus('idle');
            return;
          }

          setUpdateStatus('downloading');
          setUpdateProgress(0);
          let downloaded = 0;
          console.log('[Updater] Iniciando download...');

          await update.downloadAndInstall((event) => {
            if (event.event === 'Progress') {
              const data = event.data as { chunkLength: number; contentLength?: number };
              downloaded += data.chunkLength;
              if (data.contentLength && data.contentLength > 0) {
                const pct = Math.min((downloaded / data.contentLength) * 100, 100);
                setUpdateProgress(pct);
              }
            }
          });

          console.log('[Updater] Download concluido. Pronto para reiniciar.');
          setUpdateStatus('ready');

          const shouldRestart = await ask(
            `Versao ${update.version} instalada com sucesso! Reiniciar agora?`,
            { title: 'Atualizacao Instalada', kind: 'info' },
          );

          if (shouldRestart) {
            await relaunch();
          }
        } else {
          console.log('[Updater] Nenhuma atualizacao disponivel');
          setUpdateStatus('idle');
        }
      } catch (e) {
        console.error('[Updater] Erro na atualizacao:', e);
        setUpdateStatus('idle');
      }
    };

    const checkForUpdatesAndroid = async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const { ask } = await import('@tauri-apps/plugin-dialog');
        const { openUrl } = await import('@tauri-apps/plugin-opener');

        setUpdateStatus('checking');
        const localVersion = await getVersion();
        console.log(`[Updater-Android] Versao local: ${localVersion}`);

        const resp = await fetch(ANDROID_UPDATE_URL);
        if (!resp.ok) {
          console.log(`[Updater-Android] Servidor retornou ${resp.status}`);
          setUpdateStatus('idle');
          return;
        }

        const data = await resp.json();
        const remoteVersion = data.version as string;
        console.log(`[Updater-Android] Versao remota: ${remoteVersion}`);

        if (isNewerVersion(remoteVersion, localVersion)) {
          setUpdateStatus('available');
          setUpdateVersion(remoteVersion);
          console.log(`[Updater-Android] Nova versao disponivel: ${remoteVersion}`);

          const shouldUpdate = await ask(
            `Nova versao ${remoteVersion} disponivel (voce tem ${localVersion}). Deseja baixar e instalar?`,
            { title: 'Atualizacao Disponivel', kind: 'info' },
          );

          if (!shouldUpdate) {
            console.log('[Updater-Android] Usuario recusou');
            setUpdateStatus('idle');
            return;
          }

          const apkUrl = data.url as string;
          console.log(`[Updater-Android] Abrindo URL: ${apkUrl}`);
          await openUrl(apkUrl);
          setUpdateStatus('idle');
        } else {
          console.log('[Updater-Android] Nenhuma atualizacao disponivel');
          setUpdateStatus('idle');
        }
      } catch (e) {
        console.error('[Updater-Android] Erro:', e);
        setUpdateStatus('idle');
      }
    };

    const timer = setTimeout(() => {
      if (isAndroid()) {
        checkForUpdatesAndroid();
      } else {
        checkForUpdatesDesktop();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return useMemo(() => ({
    updateStatus,
    updateProgress,
    updateVersion,
  }), [updateStatus, updateProgress, updateVersion]);
}

export default useUpdater;
