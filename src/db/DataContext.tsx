import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Child, ID, Item, Outfit } from '@/models';
import { NewChildInput, NewItemInput, NewOutfitInput, repository } from './repository';

interface DataContextValue {
  loading: boolean;
  children: Child[];
  items: Item[];
  outfits: Outfit[];
  refresh: () => Promise<void>;
  addChild: (input: NewChildInput) => Promise<void>;
  updateChild: (id: ID, patch: Partial<NewChildInput>) => Promise<void>;
  deleteChild: (id: ID) => Promise<void>;
  addItem: (input: NewItemInput) => Promise<void>;
  updateItem: (id: ID, patch: Partial<NewItemInput>) => Promise<void>;
  deleteItem: (id: ID) => Promise<void>;
  addOutfit: (input: NewOutfitInput) => Promise<void>;
  updateOutfit: (id: ID, patch: Partial<NewOutfitInput>) => Promise<void>;
  deleteOutfit: (id: ID) => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export const DataProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [allChildren, setChildren] = useState<Child[]>([]);
  const [allItems, setItems] = useState<Item[]>([]);
  const [allOutfits, setOutfits] = useState<Outfit[]>([]);

  const refresh = useCallback(async () => {
    await repository.init();
    const data = await repository.getAll();
    setChildren(data.children);
    setItems(data.items);
    setOutfits(data.outfits);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runAndRefresh = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      loading,
      children: allChildren,
      items: allItems,
      outfits: allOutfits,
      refresh,
      addChild: async (input) => runAndRefresh(() => repository.addChild(input)),
      updateChild: async (id, patch) => runAndRefresh(() => repository.updateChild(id, patch)),
      deleteChild: async (id) => runAndRefresh(() => repository.deleteChild(id)),
      addItem: async (input) => runAndRefresh(() => repository.addItem(input)),
      updateItem: async (id, patch) => runAndRefresh(() => repository.updateItem(id, patch)),
      deleteItem: async (id) => runAndRefresh(() => repository.deleteItem(id)),
      addOutfit: async (input) => runAndRefresh(() => repository.addOutfit(input)),
      updateOutfit: async (id, patch) => runAndRefresh(() => repository.updateOutfit(id, patch)),
      deleteOutfit: async (id) => runAndRefresh(() => repository.deleteOutfit(id)),
    }),
    [allChildren, allItems, allOutfits, loading, refresh, runAndRefresh],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = (): DataContextValue => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};
