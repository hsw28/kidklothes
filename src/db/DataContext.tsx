import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { ActivityEvent, AppSettings, BackupPayload, Child, ChildItem, FilterPreset, ID, Item, Outfit, PrintAlias, PurchaseStateSnapshot, SaleDraft, SaleDraftItem, StorageLocation } from '@/models';
import { appConfig } from '@/config';
import { getEntitlementSnapshot, initPurchases } from '@/services/purchases';
import { trackBstDraftArchived, trackBstDraftCreated } from '@/services/bst/bstAnalytics';
import { hasProAccess } from '@/services/proAccess';
import { setAppGroupInt } from '@/utils/appGroupStorage';
import { cacheRemoteImage, findPersistedImageByFilename, isAppOwnedImageUri, persistLocalImage } from '@/utils/imageCache';
import { getItemLocalImageUri, getItemRemoteImageUri } from '@/utils/itemMedia';
import { BatchAddInput, BulkItemPatchInput, BulkUpdateSaleDraftItemsInput, CreateSaleDraftInput, ListRecentItemsInput, NewChildInput, NewItemInput, NewOutfitInput, SaveFilterPresetInput, UpdateSaleDraftInput, UpdateSaleDraftItemInput, repository } from './repository';

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
  saleDrafts: SaleDraft[];
  saleDraftItems: SaleDraftItem[];
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
  createSaleDraft: (input: CreateSaleDraftInput) => Promise<SaleDraft | undefined>;
  updateSaleDraft: (id: ID, patch: UpdateSaleDraftInput) => Promise<void>;
  updateSaleDraftItem: (id: ID, patch: UpdateSaleDraftItemInput) => Promise<void>;
  bulkUpdateSaleDraftItems: (saleDraftId: ID, patch: BulkUpdateSaleDraftItemsInput) => Promise<void>;
  deleteSaleDraft: (id: ID) => Promise<void>;
  removeSaleDraftItem: (id: ID) => Promise<void>;
  reorderSaleDraftItems: (saleDraftId: ID, orderedDraftItemIds: ID[]) => Promise<void>;
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
  developerForceProAccessEnabled: false,
  betaKidLimitBannerDismissed: false,
  proTeaserBannerDismissed: false,
  missingPhotoRestoreNudgeShown: true,
  hasSeenBstPostingGuide: false,
  proEarlyAccessJoined: false,
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
  const [allSaleDrafts, setSaleDrafts] = useState<SaleDraft[]>([]);
  const [allSaleDraftItems, setSaleDraftItems] = useState<SaleDraftItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const imagePersistInFlightRef = useRef(false);
  const startupImageMigrationDoneRef = useRef(false);
  const startupImageIntegrityCheckDoneRef = useRef(false);
  const imageIntegrityWarnedItemIdsRef = useRef<Set<ID>>(new Set());

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
      setSaleDrafts(data.saleDrafts);
      setSaleDraftItems(data.saleDraftItems);
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
    void refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    void setAppGroupInt('childCount', allChildren.length);
  }, [allChildren.length]);
  useEffect(() => {
    if (loading) return;
    if (startupImageMigrationDoneRef.current) return;
    if (imagePersistInFlightRef.current) return;
    const candidates = allItems
      .filter((item) => {
        const remote = getItemRemoteImageUri(item);
        const local = getItemLocalImageUri(item);
        const cached = (item.cachedImageUri ?? '').trim();
        const needsRemoteCache = Boolean(remote) && (!cached || /\/caches\//i.test(cached));
        const needsLocalMigration = Boolean(local) && !isAppOwnedImageUri(cached || local);
        const needsOwnedCacheValidation = Boolean(cached) && isAppOwnedImageUri(cached);
        return needsRemoteCache || needsLocalMigration || needsOwnedCacheValidation;
      });
    startupImageMigrationDoneRef.current = true;
    if (!candidates.length) return;

    imagePersistInFlightRef.current = true;
    void (async () => {
      try {
        for (const item of candidates) {
          const cached = (item.cachedImageUri ?? '').trim();
          if (cached && isAppOwnedImageUri(cached)) {
            try {
              const info = await FileSystem.getInfoAsync(cached);
              if (info.exists) continue;
              const rebound = await findPersistedImageByFilename(cached);
              if (rebound) {
                await repository.updateItemCachedImage(item.id, rebound);
                setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, cachedImageUri: rebound } : entry)));
                continue;
              }
            } catch {
              // Treat as missing and continue recovery path.
            }
          }

          const localCandidates = Array.from(
            new Set(
              [item.cachedImageUri ?? '', ...(item.imageUrls ?? []), item.imageUrl ?? '']
                .map((value) => value.trim())
                .filter((value) => /^(file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/i.test(value)),
            ),
          );

          let recovered = false;
          for (const local of localCandidates) {
            try {
              const persistent = await persistLocalImage(local);
              if (!persistent || !isAppOwnedImageUri(persistent)) continue;
              const info = await FileSystem.getInfoAsync(persistent);
              if (!info.exists) continue;
              await repository.updateItemCachedImage(item.id, persistent);
              setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, cachedImageUri: persistent } : entry)));
              recovered = true;
              break;
            } catch {
              // try next local source
            }
          }
          if (recovered) continue;

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
  }, [allItems, loading]);

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

  const isLocalLikeUri = (value?: string) => /^(file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/i.test((value ?? '').trim());
  const isRemoteHttpUri = (value?: string) => /^https?:\/\//i.test((value ?? '').trim());

  const prepareInputWithPersistentImage = useCallback(async <T extends Partial<NewItemInput>>(input: T): Promise<T> => {
    const imageUrl = (input.imageUrl ?? '').trim();
    const cachedImageUri = (input.cachedImageUri ?? '').trim();
    const imageUrls = (input.imageUrls ?? []).map((entry) => (entry ?? '').trim()).filter(Boolean);
    const localCandidates = Array.from(new Set([cachedImageUri, imageUrl, ...imageUrls].filter((value) => isLocalLikeUri(value))));
    const localCandidate = localCandidates[0];
    if (!localCandidate) return input;

    const persisted = await persistLocalImage(localCandidate);
    if (!persisted || !isAppOwnedImageUri(persisted)) return input;
    const persistedInfo = await FileSystem.getInfoAsync(persisted);
    if (!persistedInfo.exists) return input;

    const nextImageUrls = Array.from(
      new Set([persisted, ...localCandidates, ...imageUrls.filter((value) => !isLocalLikeUri(value) || isAppOwnedImageUri(value))]),
    );
    return {
      ...input,
      imageUrl: persisted,
      imageUrls: nextImageUrls,
      cachedImageUri: persisted,
    };
  }, []);

  const ensureItemHasPersistentCopy = useCallback(async (itemId: ID, remoteCandidate?: string) => {
    const item = await repository.getItemById(itemId);
    if (!item) return;
    const cached = (item.cachedImageUri ?? '').trim();
    if (cached && isAppOwnedImageUri(cached)) {
      try {
        const info = await FileSystem.getInfoAsync(cached);
        if (info.exists) return;
        const rebound = await findPersistedImageByFilename(cached);
        if (rebound) {
          await repository.updateItemCachedImage(itemId, rebound);
          return;
        }
      } catch {
        // continue recovery
      }
    }

    const localCandidates = Array.from(
      new Set(
        [item.cachedImageUri ?? '', ...(item.imageUrls ?? []), item.imageUrl ?? '']
          .map((value) => value.trim())
          .filter((value) => isLocalLikeUri(value)),
      ),
    );
    let recoveredFromLocal = false;
    for (const localCandidate of localCandidates) {
      try {
        const persisted = await persistLocalImage(localCandidate);
        if (persisted && isAppOwnedImageUri(persisted)) {
          const info = await FileSystem.getInfoAsync(persisted);
          if (!info.exists) {
            const rebound = await findPersistedImageByFilename(persisted);
            if (!rebound) continue;
            await repository.updateItemCachedImage(itemId, rebound);
            recoveredFromLocal = true;
            break;
          }
          await repository.updateItemCachedImage(itemId, persisted);
          recoveredFromLocal = true;
          break;
        }
      } catch {
        // continue to next local candidate
      }
    }
    if (recoveredFromLocal) return;

    const remote = (remoteCandidate || getItemRemoteImageUri(item) || '').trim();
    if (!isRemoteHttpUri(remote)) return;
    try {
      const cachedRemote = await cacheRemoteImage(itemId, remote);
      if (cachedRemote) await repository.updateItemCachedImage(itemId, cachedRemote);
    } catch {
      // keep original URLs; startup migration can retry automatically.
    }
  }, []);

  const warnIfMissingPersistentImage = useCallback(async (itemId: ID, source: 'add' | 'update' | 'startup') => {
    if (imageIntegrityWarnedItemIdsRef.current.has(itemId)) return;
    const item = await repository.getItemById(itemId);
    if (!item) return;

    const hasAnyImageSource = Boolean(
      (item.imageUrl ?? '').trim()
      || (item.cachedImageUri ?? '').trim()
      || (item.imageUrls ?? []).some((entry) => (entry ?? '').trim().length > 0),
    );
    if (!hasAnyImageSource) return;

    const cached = (item.cachedImageUri ?? '').trim();
    if (cached && isAppOwnedImageUri(cached)) {
      try {
        const info = await FileSystem.getInfoAsync(cached);
        if (info.exists) return;
      } catch {
        // fall through to warning
      }
    }

    imageIntegrityWarnedItemIdsRef.current.add(itemId);
    await repository.logEvent({
      type: 'image_integrity_warning',
      payload: { itemId, source },
    });
    if (__DEV__) {
      console.warn('[ImageIntegrity] Missing persistent photo for item with image source', { itemId, source });
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (startupImageIntegrityCheckDoneRef.current) return;
    startupImageIntegrityCheckDoneRef.current = true;

    const recentWithImages = [...allItems]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((item) => Boolean((item.imageUrl ?? '').trim() || (item.cachedImageUri ?? '').trim() || (item.imageUrls ?? []).length))
      .slice(0, 100);
    if (!recentWithImages.length) return;

    void (async () => {
      for (const item of recentWithImages) {
        await warnIfMissingPersistentImage(item.id, 'startup');
      }
    })();
  }, [allItems, loading, warnIfMissingPersistentImage]);

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
      saleDrafts: allSaleDrafts,
      saleDraftItems: allSaleDraftItems,
      settings,
      refresh,
      updateSettings: async (patch) => runAndRefresh(() => repository.updateSettings(patch)),
      addChild: async (input) => runAndRefreshWithResult(() => repository.addChild(input)),
      updateChild: async (id, patch) => runAndRefresh(() => repository.updateChild(id, patch)),
      deleteChild: async (id) => runAndRefresh(() => repository.deleteChild(id)),
      getKidCount: async () => repository.getKidCount(),
      canCreateAnotherKid: async () => repository.canCreateAnotherKid(),
      addItem: async (input) => {
        const prepared = await prepareInputWithPersistentImage(input);
        const created = await repository.addItem(prepared);
        await ensureItemHasPersistentCopy(created.id, prepared.imageUrl);
        await warnIfMissingPersistentImage(created.id, 'add');
        await refresh();
        return created;
      },
      addItemsBatch: async (input) => {
        const prepared = await prepareInputWithPersistentImage(input);
        const createdItems = await repository.addItemsBatch(prepared as BatchAddInput);
        for (const item of createdItems) {
          await ensureItemHasPersistentCopy(item.id, prepared.imageUrl);
          await warnIfMissingPersistentImage(item.id, 'add');
        }
        await refresh();
        return createdItems;
      },
      updateItem: async (id, patch) => {
        const prepared = await prepareInputWithPersistentImage(patch);
        await repository.updateItem(id, prepared);
        if (patch.imageUrl !== undefined || patch.imageUrls !== undefined || patch.cachedImageUri !== undefined) {
          await ensureItemHasPersistentCopy(id, prepared.imageUrl);
          await warnIfMissingPersistentImage(id, 'update');
        }
        await refresh();
      },
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
      createSaleDraft: async (input) => {
        const created = await runAndRefreshWithResult(() => repository.createSaleDraft(input));
        if (created) {
          await trackBstDraftCreated(async (type, payload) => {
            await repository.logEvent({ type, payload });
          }, {
            draftId: created.id,
            itemCount: input.itemIds.length,
            isPro: hasProAccess(settings, purchaseState),
            triggeredFrom: 'create_screen',
          });
        }
        return created;
      },
      updateSaleDraft: async (id, patch) => {
        const existingDraft = allSaleDrafts.find((draft) => draft.id === id);
        await runAndRefresh(() => repository.updateSaleDraft(id, patch));
        if (patch.status === 'archived' && existingDraft?.status !== 'archived') {
          await trackBstDraftArchived(async (type, payload) => {
            await repository.logEvent({ type, payload });
          }, {
            draftId: id,
            itemCount: allSaleDraftItems.filter((item) => item.saleDraftId === id && item.included).length,
            isPro: hasProAccess(settings, purchaseState),
          });
        }
      },
      updateSaleDraftItem: async (id, patch) => runAndRefresh(() => repository.updateSaleDraftItem(id, patch)),
      bulkUpdateSaleDraftItems: async (saleDraftId, patch) => runAndRefresh(() => repository.bulkUpdateSaleDraftItems(saleDraftId, patch)),
      deleteSaleDraft: async (id) => runAndRefresh(() => repository.deleteSaleDraft(id)),
      removeSaleDraftItem: async (id) => runAndRefresh(() => repository.removeSaleDraftItem(id)),
      reorderSaleDraftItems: async (saleDraftId, orderedDraftItemIds) => runAndRefresh(() => repository.reorderSaleDraftItems(saleDraftId, orderedDraftItemIds)),
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
    [allChildren, allItems, allChildItems, allStorageLocations, allPrintAliases, purchaseState, allOutfits, allFilterPresets, allBrands, allSaleDrafts, allSaleDraftItems, loading, errorMessage, settings, refresh, runAndRefresh, runAndRefreshWithResult, refreshPurchaseState, prepareInputWithPersistentImage, ensureItemHasPersistentCopy, warnIfMissingPersistentImage],
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
