import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityEvent, AppSettings, BackupPayload, Child, ChildItem, FilterPreset, ID, Item, Outfit, PrintAlias, PurchaseStateSnapshot, StorageLocation } from '@/models';
import { appConfig } from '@/config';
import { getEntitlementSnapshot, initPurchases } from '@/services/purchases';
import { setAppGroupInt } from '@/utils/appGroupStorage';
import { cacheRemoteImage, isAppOwnedImageUri, persistLocalImage } from '@/utils/imageCache';
import { getItemLocalImageUri, getItemRemoteImageUri } from '@/utils/itemMedia';
import { BatchAddInput, BulkItemPatchInput, ListRecentItemsInput, NewChildInput, NewItemInput, NewOutfitInput, SaveFilterPresetInput, repository } from './repository';

interface DataContextValue {
  loading: boolean;
  errorMessage?: string;
  children: Child[];
  items: Item[];
  childItems: ChildItem[];
  storageLocations: StorageLocation[];
  printAliases: PrintAlias[];
  purchaseState?: PurchaseStateSnapshot;
  outfits: Outfit[];
  filterPresets: FilterPreset[];
  brands: string[];
  settings: AppSettings;
  refresh: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  addChild: (input: NewChildInput) => Promise<Child | undefined>;
  updateChild: (id: ID, patch: Partial<NewChildInput>) => Promise<void>;
  deleteChild: (id: ID) => Promise<void>;
  getKidCount: () => Promise<number>;
  canCreateAnotherKid: () => Promise<{ ok: boolean; current: number; max: number }>;
  addItem: (input: NewItemInput) => Promise<Item | undefined>;
  addItemsBatch: (input: BatchAddInput) => Promise<Item[]>;
  updateItem: (id: ID, patch: Partial<NewItemInput>) => Promise<void>;
  createStorageLocation: (input: { childId?: ID; name: string; type?: string; notes?: string }) => Promise<StorageLocation | undefined>;
  updateStorageLocation: (id: ID, patch: { name?: string; type?: string; notes?: string; childId?: ID }) => Promise<void>;
  deleteStorageLocation: (id: ID) => Promise<void>;
  listStorageLocations: (childId?: ID) => Promise<StorageLocation[]>;
  assignChildItemToLocation: (childItemId: ID, storageLocationId?: ID) => Promise<void>;
  createPrintAlias: (input: { canonical: string; alias: string }) => Promise<PrintAlias | undefined>;
  listPrintAliases: () => Promise<PrintAlias[]>;
  updateItemCachedImage: (id: ID, cachedImageUri: string) => Promise<void>;
  trackOutboundClick: (id: ID, outboundUrl: string) => Promise<void>;
  bulkUpdateItems: (itemIds: ID[], patch: BulkItemPatchInput) => Promise<void>;
  bulkAssignChild: (itemIds: ID[], childId: ID) => Promise<void>;
  archiveItems: (itemIds: ID[]) => Promise<void>;
  restoreItems: (itemIds: ID[]) => Promise<void>;
  markItemsWorn: (itemIds: ID[]) => Promise<void>;
  deleteItem: (id: ID) => Promise<void>;
  addOutfit: (input: NewOutfitInput) => Promise<Outfit | undefined>;
  updateOutfit: (id: ID, patch: Partial<NewOutfitInput>) => Promise<void>;
  deleteOutfit: (id: ID) => Promise<void>;
  saveFilterPreset: (input: SaveFilterPresetInput) => Promise<void>;
  deleteFilterPreset: (id: ID) => Promise<void>;
  logEvent: (type: string, payload?: Record<string, unknown>) => Promise<void>;
  getEvents: (limit?: number) => Promise<ActivityEvent[]>;
  listRecentItems: (input?: ListRecentItemsInput) => Promise<Item[]>;
  getEventCount: (type: string, sinceDate: number) => Promise<number>;
  clearEvents: () => Promise<void>;
  refreshPurchaseState: () => Promise<PurchaseStateSnapshot | undefined>;
  getPurchaseState: () => Promise<PurchaseStateSnapshot | undefined>;
  exportBackup: () => Promise<BackupPayload>;
  importBackup: (payload: BackupPayload) => Promise<void>;
}

const defaultSettings: AppSettings = {
  closetAddDefaultView: 'detailed',
  notificationsEnabled: false,
  notifyWeeklyTidy: false,
  notifyOutgrow: false,
  monetizationEnabled: false,
  guidedOnboarding: true,
  guidedOnboardingCompleted: false,
  advancedFeaturesUnlocked: false,
  lastShoppingType: undefined,
  lastShoppingChildId: undefined,
  closetCategoryOrder: undefined,
  hiddenClosetCategoriesGlobal: [],
  wishlistCategoryOrder: undefined,
  hiddenWishlistCategories: [],
  kidsPreviewCategories: undefined,
  developerModeEnabled: false,
  betaKidLimitBannerDismissed: false,
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

export const DataProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [allChildren, setChildren] = useState<Child[]>([]);
  const [allItems, setItems] = useState<Item[]>([]);
  const [allChildItems, setChildItems] = useState<ChildItem[]>([]);
  const [allStorageLocations, setStorageLocations] = useState<StorageLocation[]>([]);
  const [allPrintAliases, setPrintAliases] = useState<PrintAlias[]>([]);
  const [purchaseState, setPurchaseState] = useState<PurchaseStateSnapshot | undefined>(undefined);
  const [allOutfits, setOutfits] = useState<Outfit[]>([]);
  const [allFilterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [allBrands, setBrands] = useState<string[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const imagePersistInFlightRef = useRef(false);
  const imagePersistAttemptedRef = useRef<Set<string>>(new Set());

  const refreshPurchaseState = useCallback(async (): Promise<PurchaseStateSnapshot | undefined> => {
    if (!appConfig.monetizationEnabled) return undefined;
    try {
      await initPurchases();
      const snapshot = await getEntitlementSnapshot();
      await repository.savePurchaseState(snapshot);
      await repository.logEvent({
        type: 'purchase_state_refreshed',
        payload: {
          isEntitled: snapshot.isEntitled,
          activeEntitlementsCount: snapshot.activeEntitlements.length,
        },
      });
      setPurchaseState(snapshot);
      return snapshot;
    } catch {
      return undefined;
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      await repository.init();
      const data = await repository.getAll();
      setChildren(data.children);
      setItems(data.items);
      setChildItems(data.childItems);
      setStorageLocations(data.storageLocations);
      setPrintAliases(data.printAliases);
      setPurchaseState(data.purchaseState);
      setOutfits(data.outfits);
      setFilterPresets(data.filterPresets);
      setBrands(data.brands);
      setSettings(data.settings);

      if (appConfig.monetizationEnabled) {
        await refreshPurchaseState();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load local data.';
      setErrorMessage(message);
      if (__DEV__) console.error('[DataContext.refresh] failed', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [refreshPurchaseState]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    void setAppGroupInt('childCount', allChildren.length);
  }, [allChildren.length]);
  useEffect(() => {
    if (imagePersistInFlightRef.current) return;
    const candidates = allItems
      .filter((item) => {
        const remote = getItemRemoteImageUri(item);
        const local = getItemLocalImageUri(item);
        const cached = (item.cachedImageUri ?? '').trim();
        const needsRemoteCache = Boolean(remote) && (!cached || /\/caches\//i.test(cached));
        const needsLocalMigration = Boolean(local) && !isAppOwnedImageUri(cached || local);
        return needsRemoteCache || needsLocalMigration;
      })
      .filter((item) => !imagePersistAttemptedRef.current.has(item.id))
      .slice(0, 10);
    if (!candidates.length) return;

    imagePersistInFlightRef.current = true;
    candidates.forEach((item) => imagePersistAttemptedRef.current.add(item.id));
    void (async () => {
      try {
        for (const item of candidates) {
          const local = getItemLocalImageUri(item);
          if (local && !isAppOwnedImageUri(local)) {
            try {
              const persistent = await persistLocalImage(local);
              if (persistent && persistent !== local) {
                await repository.updateItemCachedImage(item.id, persistent);
                setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, cachedImageUri: persistent } : entry)));
                continue;
              }
            } catch {
              // continue to remote fallback
            }
          }

          const remote = getItemRemoteImageUri(item);
          if (!remote) continue;
          try {
            const cached = await cacheRemoteImage(item.id, remote);
            if (!cached) continue;
            await repository.updateItemCachedImage(item.id, cached);
            setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, cachedImageUri: cached } : entry)));
          } catch {
            // best-effort background persistence of remote images
          }
        }
      } finally {
        imagePersistInFlightRef.current = false;
      }
    })();
  }, [allItems]);

  const runAndRefresh = useCallback(
    async (action: () => Promise<unknown>) => {
      await action();
      await refresh();
    },
    [refresh],
  );
  const runAndRefreshWithResult = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      const result = await action();
      await refresh();
      return result;
    },
    [refresh],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      loading,
      errorMessage,
      children: allChildren,
      items: allItems,
      childItems: allChildItems,
      storageLocations: allStorageLocations,
      printAliases: allPrintAliases,
      purchaseState,
      outfits: allOutfits,
      filterPresets: allFilterPresets,
      brands: allBrands,
      settings,
      refresh,
      updateSettings: async (patch) => runAndRefresh(() => repository.updateSettings(patch)),
      addChild: async (input) => runAndRefreshWithResult(() => repository.addChild(input)),
      updateChild: async (id, patch) => runAndRefresh(() => repository.updateChild(id, patch)),
      deleteChild: async (id) => runAndRefresh(() => repository.deleteChild(id)),
      getKidCount: async () => repository.getKidCount(),
      canCreateAnotherKid: async () => repository.canCreateAnotherKid(),
      addItem: async (input) => runAndRefreshWithResult(() => repository.addItem(input)),
      addItemsBatch: async (input) => runAndRefreshWithResult(() => repository.addItemsBatch(input)),
      updateItem: async (id, patch) => runAndRefresh(() => repository.updateItem(id, patch)),
      createStorageLocation: async (input) => runAndRefreshWithResult(() => repository.createStorageLocation(input)),
      updateStorageLocation: async (id, patch) => runAndRefresh(() => repository.updateStorageLocation(id, patch)),
      deleteStorageLocation: async (id) => runAndRefresh(() => repository.deleteStorageLocation(id)),
      listStorageLocations: async (childId) => repository.listStorageLocations(childId),
      assignChildItemToLocation: async (childItemId, storageLocationId) => runAndRefresh(() => repository.assignChildItemToLocation(childItemId, storageLocationId)),
      createPrintAlias: async (input) => runAndRefreshWithResult(() => repository.createPrintAlias(input)),
      listPrintAliases: async () => repository.listPrintAliases(),
      updateItemCachedImage: async (id, cachedImageUri) => runAndRefresh(() => repository.updateItemCachedImage(id, cachedImageUri)),
      trackOutboundClick: async (id, outboundUrl) => runAndRefresh(() => repository.trackOutboundClick(id, outboundUrl)),
      bulkUpdateItems: async (itemIds, patch) => runAndRefresh(() => repository.bulkUpdateItems(itemIds, patch)),
      bulkAssignChild: async (itemIds, childId) => runAndRefresh(() => repository.bulkAssignChild(itemIds, childId)),
      archiveItems: async (itemIds) => runAndRefresh(() => repository.archiveItems(itemIds)),
      restoreItems: async (itemIds) => runAndRefresh(() => repository.restoreItems(itemIds)),
      markItemsWorn: async (itemIds) => runAndRefresh(() => repository.markItemsWorn(itemIds)),
      deleteItem: async (id) => runAndRefresh(() => repository.deleteItem(id)),
      addOutfit: async (input) => runAndRefreshWithResult(() => repository.addOutfit(input)),
      updateOutfit: async (id, patch) => runAndRefresh(() => repository.updateOutfit(id, patch)),
      deleteOutfit: async (id) => runAndRefresh(() => repository.deleteOutfit(id)),
      saveFilterPreset: async (input) => runAndRefresh(() => repository.saveFilterPreset(input)),
      deleteFilterPreset: async (id) => runAndRefresh(() => repository.deleteFilterPreset(id)),
      logEvent: async (type, payload) => {
        await repository.logEvent({ type, payload });
      },
      getEvents: async (limit) => repository.getEvents(limit),
      listRecentItems: async (input) => repository.listRecentItems(input),
      getEventCount: async (type, sinceDate) => repository.getEventCount(type, sinceDate),
      clearEvents: async () => repository.clearEvents(),
      refreshPurchaseState,
      getPurchaseState: async () => repository.getPurchaseState(),
      exportBackup: async () => repository.exportBackup(),
      importBackup: async (payload) => runAndRefresh(() => repository.importBackup(payload)),
    }),
    [allChildren, allItems, allChildItems, allStorageLocations, allPrintAliases, purchaseState, allOutfits, allFilterPresets, allBrands, loading, errorMessage, settings, refresh, runAndRefresh, runAndRefreshWithResult, refreshPurchaseState],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = (): DataContextValue => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};

export const useItemsForChild = (childId?: ID) => {
  const { items } = useData();
  return useMemo(
    () => (childId ? items.filter((item) => item.childIds.includes(childId)) : items),
    [items, childId],
  );
};

export const useCountsForChild = (childId?: ID) => {
  const { items } = useData();
  return useMemo(() => {
    const scoped = childId ? items.filter((item) => item.childIds.includes(childId)) : items;
    const byStatus = scoped.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total: scoped.length,
      byStatus,
    };
  }, [items, childId]);
};
