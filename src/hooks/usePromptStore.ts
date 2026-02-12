/**
 * usePromptStore - Hook React para gerenciar templates de prompts
 *
 * Wrapper reativo sobre PromptStore singleton.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getPromptStore,
  type PromptTemplate,
  type PromptStore,
} from '../services/PromptStore';

export interface UsePromptStoreReturn {
  templates: PromptTemplate[];
  isLoaded: boolean;
  getById: (id: string) => PromptTemplate | undefined;
  getByName: (name: string) => PromptTemplate | undefined;
  save: (template: PromptTemplate) => Promise<void>;
  deleteTemplate: (id: string) => Promise<boolean>;
  resetBuiltins: () => Promise<void>;
  duplicate: (id: string) => PromptTemplate | undefined;
}

export function usePromptStore(): UsePromptStoreReturn {
  const [store] = useState<PromptStore>(() => getPromptStore());
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Inicializar store na montagem
  useEffect(() => {
    store.init().then(() => {
      setTemplates(store.getAll());
      setIsLoaded(true);
    });
  }, [store]);

  const refresh = useCallback(() => {
    setTemplates(store.getAll());
  }, [store]);

  const save = useCallback(
    async (template: PromptTemplate) => {
      await store.save(template);
      refresh();
    },
    [store, refresh],
  );

  const deleteTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await store.delete(id);
      refresh();
      return result;
    },
    [store, refresh],
  );

  const resetBuiltins = useCallback(async () => {
    await store.resetBuiltins();
    refresh();
  }, [store, refresh]);

  const duplicate = useCallback(
    (id: string): PromptTemplate | undefined => {
      return store.duplicate(id);
    },
    [store],
  );

  const getById = useCallback(
    (id: string) => store.getById(id),
    [store],
  );

  const getByName = useCallback(
    (name: string) => store.getByName(name),
    [store],
  );

  return {
    templates,
    isLoaded,
    getById,
    getByName,
    save,
    deleteTemplate,
    resetBuiltins,
    duplicate,
  };
}

export default usePromptStore;
