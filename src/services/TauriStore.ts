/**
 * TauriStore - Camada de persistencia unificada via @tauri-apps/plugin-store
 *
 * Dois stores:
 * - settings.json: configs do usuario (idioma, estilo, modelo, URLs, auth, TTS)
 * - data.json: historico, contexto, trabalho em andamento
 *
 * Fallback para localStorage quando o plugin nao esta disponivel (dev mode web).
 * Migracao automatica de localStorage no primeiro load.
 */

import type { Store } from '@tauri-apps/plugin-store';

// ============================================================================
// DETECCAO DE AMBIENTE
// ============================================================================

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI__' in window;

// ============================================================================
// SINGLETON STORES
// ============================================================================

const stores: Record<string, Store> = {};
const initPromises: Record<string, Promise<Store | null>> = {};

async function getTauriStore(name: string): Promise<Store | null> {
  if (!isTauri()) return null;
  if (stores[name]) return stores[name];
  if (initPromises[name]) return initPromises[name];

  initPromises[name] = (async () => {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(name, { autoSave: 100 });
      stores[name] = store;
      return store;
    } catch (e) {
      console.error(`[TauriStore] Falha ao inicializar ${name}:`, e);
      return null;
    } finally {
      delete initPromises[name];
    }
  })();

  return initPromises[name];
}

export async function getSettingsStore(): Promise<Store | null> {
  return getTauriStore('settings.json');
}

export async function getDataStore(): Promise<Store | null> {
  return getTauriStore('data.json');
}

// ============================================================================
// OPERACOES GENERICAS COM FALLBACK
// ============================================================================

export async function storeGet<T>(
  storeName: 'settings.json' | 'data.json',
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const store = await getTauriStore(storeName);
    if (store) {
      const val = await store.get<T>(key);
      if (val !== undefined && val !== null) return val;
    }
  } catch {
    // silencioso
  }

  // Fallback localStorage
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      // Tenta parse JSON, senao retorna como string
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    }
  } catch {
    // silencioso
  }

  return fallback;
}

export async function storeSet(
  storeName: 'settings.json' | 'data.json',
  key: string,
  value: unknown,
): Promise<void> {
  try {
    const store = await getTauriStore(storeName);
    if (store) {
      await store.set(key, value);
      return;
    }
  } catch {
    // silencioso
  }

  // Fallback localStorage
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch {
    // silencioso
  }
}

export async function storeDelete(
  storeName: 'settings.json' | 'data.json',
  key: string,
): Promise<void> {
  try {
    const store = await getTauriStore(storeName);
    if (store) {
      await store.delete(key);
    }
  } catch {
    // silencioso
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // silencioso
  }
}

// ============================================================================
// MIGRACAO AUTOMATICA
// ============================================================================

/**
 * Migra uma chave de localStorage para o Tauri Store.
 * Retorna o valor migrado ou o fallback.
 */
export async function migrateKey<T>(
  storeName: 'settings.json' | 'data.json',
  key: string,
  fallback: T,
): Promise<T> {
  const store = await getTauriStore(storeName);
  if (!store) {
    // Sem Tauri, ler direto do localStorage
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
      }
    } catch { /* silencioso */ }
    return fallback;
  }

  // Verificar se ja tem valor no store
  try {
    const existing = await store.get<T>(key);
    if (existing !== undefined && existing !== null) return existing;
  } catch { /* silencioso */ }

  // Migrar de localStorage
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      let parsed: T;
      try { parsed = JSON.parse(raw) as T; } catch { parsed = raw as unknown as T; }
      await store.set(key, parsed);
      localStorage.removeItem(key);
      return parsed;
    }
  } catch { /* silencioso */ }

  return fallback;
}
