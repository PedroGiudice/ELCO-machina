import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type HistoryItem = { text: string; date: string; id: string };

export type ContextItem = {
  name: string;
  memory: string;
  lastUpdated: number;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const DB_NAME = 'GeminiArchitectDB';
const DB_VERSION = 2;
const STORE_NAME = 'workspace';
const CONTEXT_STORE = 'contexts';

const HISTORY_DB_NAME = 'ProATTHistoryDB';
const HISTORY_STORE_NAME = 'history';

const MAX_HISTORY_ITEMS = 500;

// ============================================================================
// UTILS
// ============================================================================

const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

const generateHistoryId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// ============================================================================
// INDEXEDDB - Audio & Context
// ============================================================================

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(CONTEXT_STORE)) {
        db.createObjectStore(CONTEXT_STORE, { keyPath: 'name' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveAudioToDB = async (blob: Blob | null) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    if (blob) {
      store.put(blob, 'current_audio');
    } else {
      store.delete('current_audio');
    }
  } catch (e) {
    console.error('Failed to save audio state', e);
  }
};

const loadAudioFromDB = async (): Promise<Blob | undefined> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get('current_audio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
};

const saveContextToDB = async (item: ContextItem) => {
  try {
    const db = await initDB();
    const tx = db.transaction(CONTEXT_STORE, 'readwrite');
    tx.objectStore(CONTEXT_STORE).put(item);
    return new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  } catch (e) {
    console.error('Failed to save context', e);
  }
};

const loadAllContextsFromDB = async (): Promise<ContextItem[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTEXT_STORE, 'readonly');
      const request = tx.objectStore(CONTEXT_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
};

// ============================================================================
// INDEXEDDB - History
// ============================================================================

const openHistoryDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        db.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'key' });
      }
    };
  });
};

const saveHistoryToIndexedDB = async (history: HistoryItem[]): Promise<void> => {
  try {
    const db = await openHistoryDB();
    const tx = db.transaction(HISTORY_STORE_NAME, 'readwrite');
    const store = tx.objectStore(HISTORY_STORE_NAME);
    store.put({ key: 'transcription_history', data: history });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.error('IndexedDB save failed:', e);
  }
};

const loadHistoryFromIndexedDB = async (): Promise<HistoryItem[] | null> => {
  try {
    const db = await openHistoryDB();
    const tx = db.transaction(HISTORY_STORE_NAME, 'readonly');
    const store = tx.objectStore(HISTORY_STORE_NAME);
    const request = store.get('transcription_history');
    const result = await new Promise<any>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result?.data || null;
  } catch (e) {
    console.error('IndexedDB load failed:', e);
    return null;
  }
};

// ============================================================================
// TAURI STORE
// ============================================================================

let storeInstance: any = null;
let storeInitPromise: Promise<any> | null = null;

const getStore = async () => {
  if (!isTauri()) return null;
  if (storeInstance) return storeInstance;

  if (storeInitPromise) return storeInitPromise;

  storeInitPromise = (async () => {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      storeInstance = await load('history.json', { defaults: {}, autoSave: 100 });
      console.log('Tauri Store initialized successfully');
      return storeInstance;
    } catch (e) {
      console.error('Failed to initialize Tauri Store:', e);
      storeInstance = null;
      return null;
    } finally {
      storeInitPromise = null;
    }
  })();

  return storeInitPromise;
};

// API Key persistence
const loadApiKey = async (): Promise<string> => {
  const store = await getStore();

  if (store) {
    try {
      const key = await store.get('gemini_api_key') as string | undefined;
      if (key) return key;
    } catch (e) {
      console.error('Failed to load API key from store:', e);
    }
  }

  if (process.env.API_KEY) {
    return process.env.API_KEY;
  }

  try {
    const saved = localStorage.getItem('gemini_api_key');
    if (saved) return saved;
  } catch (e) {
    console.error('Failed to load API key from localStorage:', e);
  }

  return '';
};

const saveApiKeyToStore = async (key: string): Promise<void> => {
  const store = await getStore();

  if (store) {
    try {
      await store.set('gemini_api_key', key);
      return;
    } catch (e) {
      console.error('Failed to save API key to store:', e);
    }
  }

  try {
    localStorage.setItem('gemini_api_key', key);
  } catch (e) {
    console.error('Failed to save API key to localStorage:', e);
  }
};

// History persistence
const loadHistory = async (): Promise<HistoryItem[]> => {
  const store = await getStore();

  if (store) {
    try {
      const history = await store.get('transcription_history') as HistoryItem[] | undefined;
      if (history && history.length > 0) {
        return history;
      }
    } catch (e) {
      console.error('Failed to load from Tauri Store:', e);
    }
  }

  const indexedDBHistory = await loadHistoryFromIndexedDB();
  if (indexedDBHistory && indexedDBHistory.length > 0) {
    console.log('Loaded history from IndexedDB');
    return indexedDBHistory;
  }

  try {
    const saved = localStorage.getItem('gemini_history_v2');
    if (saved) {
      const parsed = JSON.parse(saved) as HistoryItem[];
      return parsed.map((item) => ({
        ...item,
        id: item.id || generateHistoryId(),
      }));
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
  return [];
};

const saveHistory = async (history: HistoryItem[]): Promise<void> => {
  const store = await getStore();

  if (store) {
    try {
      await store.set('transcription_history', history);
      return;
    } catch (e) {
      console.error('Failed to save to Tauri Store:', e);
    }
  }

  await saveHistoryToIndexedDB(history);

  try {
    localStorage.setItem('gemini_history_v2', JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
};

// ============================================================================
// HOOK INTERFACE
// ============================================================================

export interface UsePersistenceReturn {
  // History
  history: HistoryItem[];
  historyLoaded: boolean;
  addToHistory: (text: string, date: string, id: string) => void;
  deleteHistoryItem: (id: string) => void;
  clearAllHistory: () => void;

  // Context
  contextPools: string[];
  activeContext: string;
  setActiveContext: (ctx: string) => void;
  contextMemory: Record<string, string>;
  updateContextMemory: (ctx: string, memory: string) => void;
  handleAddContext: () => Promise<void>;

  // Memory Editor
  isMemoryModalOpen: boolean;
  setIsMemoryModalOpen: (v: boolean) => void;
  tempMemoryEdit: string;
  setTempMemoryEdit: (v: string) => void;
  isSavingContext: boolean;
  openMemoryEditor: () => void;
  saveMemory: () => Promise<void>;

  // API Key
  apiKey: string;
  apiKeyInput: string;
  setApiKeyInput: (v: string) => void;
  isApiKeyVisible: boolean;
  setIsApiKeyVisible: (v: boolean) => void;
  saveApiKey: (key: string) => Promise<void>;

  // Audio persistence
  saveAudioToDB: (blob: Blob | null) => Promise<void>;
  loadAudioFromDB: () => Promise<Blob | undefined>;

  // Context DB
  saveContextToDB: (item: ContextItem) => Promise<void>;

  // Logs
  logs: { msg: string; type: 'info' | 'success' | 'error'; time?: Date }[];
  addLog: (msg: string, type: 'info' | 'success' | 'error') => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function usePersistence(): UsePersistenceReturn {
  // Logs
  const [logs, setLogs] = useState<{ msg: string; type: 'info' | 'success' | 'error'; time?: Date }[]>([]);

  const addLog = useCallback(
    (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
      setLogs((prev) => [...prev.slice(-49), { msg, type, time: new Date() }]);
    },
    [],
  );

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Context
  const [contextPools, setContextPools] = useState<string[]>(['General']);
  const [activeContext, setActiveContext] = useState<string>(() => {
    return localStorage.getItem('gemini_active_context') || 'General';
  });
  const [contextMemory, setContextMemory] = useState<Record<string, string>>({});

  // Memory Editor
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [tempMemoryEdit, setTempMemoryEdit] = useState('');
  const [isSavingContext, setIsSavingContext] = useState(false);

  // API Key
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isApiKeyVisible, setIsApiKeyVisible] = useState<boolean>(false);

  // --- Load on mount ---

  // Load API Key
  useEffect(() => {
    loadApiKey().then((key) => {
      setApiKey(key);
      setApiKeyInput(key);
    });
  }, []);

  // Load History
  useEffect(() => {
    loadHistory().then((loaded) => {
      setHistory(loaded);
      setHistoryLoaded(true);
    });
  }, []);

  // Save history on change
  useEffect(() => {
    if (historyLoaded && history.length >= 0) {
      saveHistory(history);
    }
  }, [history, historyLoaded]);

  // Persist active context
  useEffect(
    () => localStorage.setItem('gemini_active_context', activeContext),
    [activeContext],
  );

  // Load contexts and audio from IndexedDB
  useEffect(() => {
    const initializeData = async () => {
      const savedContexts = await loadAllContextsFromDB();

      let initialMemory: Record<string, string> = {};
      let initialPools: string[] = [];

      if (savedContexts.length > 0) {
        savedContexts.forEach((ctx) => {
          initialMemory[ctx.name] = ctx.memory;
          initialPools.push(ctx.name);
        });
      } else {
        // Migration from localStorage
        const lsPools = localStorage.getItem('gemini_context_pools');
        const lsMemory = localStorage.getItem('gemini_context_memory');

        if (lsPools && lsMemory) {
          try {
            const pools = JSON.parse(lsPools) as string[];
            const memory = JSON.parse(lsMemory) as Record<string, string>;

            addLog('Migrating data to secure storage...', 'info');

            for (const name of pools) {
              const mem = memory[name] || '';
              await saveContextToDB({ name, memory: mem, lastUpdated: Date.now() });
              initialMemory[name] = mem;
              initialPools.push(name);
            }
            addLog('Data migration complete.', 'success');
          } catch (e) {
            console.error('Migration failed', e);
          }
        }
      }

      // Fallback defaults
      if (initialPools.length === 0) {
        initialPools = ['General', 'Coding', 'Writing'];
        await saveContextToDB({ name: 'General', memory: '', lastUpdated: Date.now() });
        await saveContextToDB({ name: 'Coding', memory: '', lastUpdated: Date.now() });
        await saveContextToDB({ name: 'Writing', memory: '', lastUpdated: Date.now() });
      }

      setContextPools(initialPools);
      setContextMemory(initialMemory);
    };

    initializeData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Actions ---

  const addToHistory = useCallback((text: string, date: string, id: string) => {
    setHistory((prev) =>
      [{ text, date, id }, ...prev].slice(0, MAX_HISTORY_ITEMS),
    );
  }, []);

  const deleteHistoryItemFn = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearAllHistoryFn = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const updateContextMemory = useCallback((ctx: string, memory: string) => {
    setContextMemory((prev) => ({ ...prev, [ctx]: memory }));
  }, []);

  const handleAddContext = useCallback(async () => {
    const name = prompt(
      "Name your new Context Pool (e.g. 'Project Alpha', 'React Docs'):",
    );
    if (name && !contextPools.includes(name)) {
      setContextPools((prev) => [...prev, name]);
      setActiveContext(name);
      setContextMemory((prev) => ({ ...prev, [name]: '' }));

      await saveContextToDB({ name, memory: '', lastUpdated: Date.now() });
      addLog(`Context '${name}' created & persisted.`, 'success');
    }
  }, [contextPools, addLog]);

  const openMemoryEditor = useCallback(() => {
    setTempMemoryEdit(contextMemory[activeContext] || '');
    setIsMemoryModalOpen(true);
  }, [contextMemory, activeContext]);

  const saveMemoryFn = useCallback(async () => {
    setIsSavingContext(true);
    const updatedMemory = tempMemoryEdit;

    setContextMemory((prev) => ({ ...prev, [activeContext]: updatedMemory }));

    await saveContextToDB({
      name: activeContext,
      memory: updatedMemory,
      lastUpdated: Date.now(),
    });

    setIsSavingContext(false);
    setIsMemoryModalOpen(false);
    addLog('Context memory saved to secure storage.', 'success');
  }, [tempMemoryEdit, activeContext, addLog]);

  const saveApiKeyFn = useCallback(async (key: string) => {
    await saveApiKeyToStore(key);
    setApiKey(key);
  }, []);

  return {
    // History
    history,
    historyLoaded,
    addToHistory,
    deleteHistoryItem: deleteHistoryItemFn,
    clearAllHistory: clearAllHistoryFn,

    // Context
    contextPools,
    activeContext,
    setActiveContext,
    contextMemory,
    updateContextMemory,
    handleAddContext,

    // Memory Editor
    isMemoryModalOpen,
    setIsMemoryModalOpen,
    tempMemoryEdit,
    setTempMemoryEdit,
    isSavingContext,
    openMemoryEditor,
    saveMemory: saveMemoryFn,

    // API Key
    apiKey,
    apiKeyInput,
    setApiKeyInput,
    isApiKeyVisible,
    setIsApiKeyVisible,
    saveApiKey: saveApiKeyFn,

    // Audio persistence
    saveAudioToDB,
    loadAudioFromDB,

    // Context DB
    saveContextToDB,

    // Logs
    logs,
    addLog,
  };
}

export default usePersistence;
