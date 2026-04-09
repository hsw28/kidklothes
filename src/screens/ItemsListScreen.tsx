import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Clipboard, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { DraggableCategoryPrefsEditor } from '@/components/DraggableCategoryPrefsEditor';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RemoteImage } from '@/components/RemoteImage';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { useReviewPrompt } from '@/hooks/useReviewPrompt';
import { useUndoToast } from '@/hooks/useUndoToast';
import { ClothingType, Item, ItemStatus } from '@/models';
import { ItemsStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme';
import { cacheRemoteImage } from '@/utils/imageCache';
import { closetCategoryForItem, getSizeAnchors } from '@/utils/closetViewInsights';
import { ClosetCategory, closetLabel, DEFAULT_WISHLIST_CATEGORY_ORDER, getConfiguredWishlistCategories, sanitizeCategoryOrder, sanitizeHiddenCategories } from '@/utils/categories';
import { formatWishlistShareText } from '@/utils/shareWishlistText';
import { isAdvancedUnlocked } from '@/utils/featureUnlock';
import { formatItemCategoryLabel } from '@/utils/itemLabels';
import { getItemDisplayFallbackUri, getItemDisplayImageUri } from '@/utils/itemMedia';
import { validateQuickLinkSaveInput } from '@/utils/itemValidation';
import { getChildCurrentSizeText, getChildNextSizeText } from '@/utils/sizes';
import { getItemTagSearchTokens } from '@/utils/tagSystem';
import { showActionMenu } from '@/utils/actionSheets';
import { fetchLinkItemDraft } from '@/utils/linkItemDraft';

type Props = NativeStackScreenProps<ItemsStackParamList, 'ItemsList'>;
type StatusFilter = 'All' | ItemStatus;
type ClothingTypeFilter = 'All' | ClothingType;
type SortedFilter = 'All' | 'Unsorted';
type WearFilter = 'All' | 'Most worn' | 'Neglected';
type AddedDateFilter = 'All' | 'Added today' | 'Last 24h';
type CategoryFilter = 'All' | ClosetCategory;

const isUnsortedItem = (item: Item) => !item.size.trim() || !item.sizeNormalized || !item.category || (!item.notes && item.tags.length === 0);

const tokenMatch = (item: Item, query: string) => {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = [item.title, item.printName ?? '', item.brand ?? '', item.brandTags.join(' '), item.tags.join(' '), getItemTagSearchTokens(item).join(' ')].join(' ').toLowerCase();
  return tokens.every((token) => haystack.includes(token));
};

type ItemListRowProps = {
  itemId: string;
  title: string;
  brand?: string;
  brandTags: string[];
  childName: string;
  assignmentLabel?: string;
  quantity: number;
  sizeLabel: string;
  categoryLabel: string;
  wornCount: number;
  statusLabel: string;
  isWishlist: boolean;
  isUnsorted: boolean;
  isSelected: boolean;
  selectionMode: boolean;
  thumbUri?: string;
  thumbFallbackUri?: string;
  onPress: (itemId: string) => void;
};

const ItemListRowComponent: React.FC<ItemListRowProps> = ({
  itemId,
  title,
  brand,
  brandTags,
  childName,
  assignmentLabel,
  quantity,
  sizeLabel,
  categoryLabel,
  wornCount,
  statusLabel,
  isWishlist,
  isUnsorted,
  isSelected,
  selectionMode,
  thumbUri,
  thumbFallbackUri,
  onPress,
}) => {
  const theme = useAppTheme();
  const rowStyles = useMemo(
    () =>
      StyleSheet.create({
        title: { fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary },
        selectionText: { fontSize: 12, color: theme.colors.textSecondary },
        cardRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
        cardBody: { flex: 1, gap: 6 },
        thumbnail: { width: 64, height: 64, borderRadius: 8, backgroundColor: theme.colors.placeholder },
        titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
        brand: { fontSize: 13, color: theme.colors.textPrimary, fontWeight: '500' },
        meta: { fontSize: 13, color: theme.colors.textSecondary },
        row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        badgeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
        badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.mutedBadgeBg },
        badgeUnsorted: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.accentSecondarySoft },
        badgeText: { fontSize: 12, color: theme.colors.mutedBadgeText, fontWeight: '600' },
      }),
    [theme.colors.accentSecondarySoft, theme.colors.mutedBadgeBg, theme.colors.mutedBadgeText, theme.colors.placeholder, theme.colors.textPrimary, theme.colors.textSecondary],
  );

  return (
    <Pressable
      style={({ pressed }) => (pressed ? { opacity: 0.96 } : null)}
      onPress={() => onPress(itemId)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sizeLabel || 'No size'}, ${statusLabel}`}
    >
      <Card>
        <View style={rowStyles.cardRow}>
          <RemoteImage uri={thumbUri} fallbackUri={thumbFallbackUri} style={rowStyles.thumbnail} fallbackLabel={title} />
          <View style={rowStyles.cardBody}>
            <View style={rowStyles.titleRow}>
              <Text style={rowStyles.title}>{title}</Text>
              {selectionMode ? <Text style={rowStyles.selectionText}>{isSelected ? 'Selected' : 'Tap to select'}</Text> : null}
            </View>
            {!!brand ? <Text style={rowStyles.brand}>Brand: {brand}</Text> : null}
            <View style={rowStyles.row}>
              <Text style={rowStyles.meta}>{childName}</Text>
              <Text style={rowStyles.meta}>Size {sizeLabel}</Text>
              <Text style={rowStyles.meta}>{categoryLabel}</Text>
              {!isWishlist ? <Text style={rowStyles.meta}>Worn {wornCount}</Text> : null}
            </View>
            <View style={rowStyles.badgeRow}>
              <View style={rowStyles.badge}>
                <Text style={rowStyles.badgeText}>{statusLabel}</Text>
              </View>
              {quantity > 1 ? (
                <View style={rowStyles.badge}>
                  <Text style={rowStyles.badgeText}>{quantity}x</Text>
                </View>
              ) : null}
              {assignmentLabel ? (
                <View style={rowStyles.badge}>
                  <Text style={rowStyles.badgeText}>{assignmentLabel}</Text>
                </View>
              ) : null}
              {isUnsorted ? (
                <View style={rowStyles.badgeUnsorted}>
                  <Text style={rowStyles.badgeText}>unsorted</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
};

const ItemListRow = React.memo(ItemListRowComponent);

export const ItemsListScreen: React.FC<Props> = ({ navigation, route }) => {
  const {
    items,
    children,
    brands,
    childItems,
    filterPresets,
    settings,
    addItem,
    logEvent,
    bulkUpdateItems,
    updateItem,
    bulkAssignChild,
    archiveItems,
    restoreItems,
    updateItemCachedImage,
    updateSettings,
    saveFilterPreset,
    deleteFilterPreset,
  } = useData();
  const { recordMeaningfulActionAndMaybePrompt } = useReviewPrompt();
  const { showToast } = useUndoToast();
  const theme = useAppTheme();

  const [childId, setChildId] = useState<string | undefined>(route.params?.initialChildId);
  const [status, setStatus] = useState<StatusFilter>(route.params?.initialStatus ?? 'All');
  const [addedDateFilter, setAddedDateFilter] = useState<AddedDateFilter>(route.params?.initialTodayOnly ? 'Added today' : 'All');
  const [initialSinceHours, setInitialSinceHours] = useState<number | undefined>(route.params?.initialSinceHours);
  const [sizeBucketFilter, setSizeBucketFilter] = useState<'All' | 'now' | 'next'>(route.params?.initialSizeBucket ?? 'All');
  const [storageLocationIdFilter, setStorageLocationIdFilter] = useState<string | undefined>(route.params?.initialStorageLocationId);
  const [sizeFilter, setSizeFilter] = useState(route.params?.initialSize ?? '');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(route.params?.initialCategory ?? 'All');
  const [clothingType, setClothingType] = useState<ClothingTypeFilter>(route.params?.initialClothingType ?? 'All');
  const [sortedFilter, setSortedFilter] = useState<SortedFilter>('All');
  const [brandFilter, setBrandFilter] = useState<string>(route.params?.initialBrandId ?? 'All');
  const [wearFilter, setWearFilter] = useState<WearFilter>('All');
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [itemIdsFilter, setItemIdsFilter] = useState<string[] | undefined>(route.params?.initialItemIds);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [captureUrl, setCaptureUrl] = useState('');
  const [captureChildId, setCaptureChildId] = useState(children[0]?.id ?? '');
  const [captureStatus, setCaptureStatus] = useState<ItemStatus>('wishlist');
  const [savingQuick, setSavingQuick] = useState(false);

  const [presetName, setPresetName] = useState('');

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [bulkTag, setBulkTag] = useState('');
  const [bulkChildId, setBulkChildId] = useState(children[0]?.id ?? '');
  const hideInbox = route.params?.hideInbox ?? false;
  const isWishlistScreen = route.params?.initialStatus === 'wishlist';
  const [filtersExpanded, setFiltersExpanded] = useState(!hideInbox);
  const [showCategoryLayoutEditor, setShowCategoryLayoutEditor] = useState(false);
  const advancedUnlocked = isAdvancedUnlocked(settings, children, childItems, items);
  const hasClosetPowerAccess = advancedUnlocked;
  const openItemDetail = useCallback((itemId: string) => {
    navigation.navigate('ItemDetail', { itemId });
  }, [navigation]);

  useEffect(() => {
    if (children.length > 0 && !captureChildId) setCaptureChildId(children[0].id);
    if (children.length > 0 && !bulkChildId) setBulkChildId(children[0].id);
  }, [bulkChildId, captureChildId, children]);

  useEffect(() => {
    if (!route.params?.initialChildId) return;
    setChildId(route.params.initialChildId);
  }, [route.params?.initialChildId]);

  useEffect(() => {
    if (!route.params?.initialTodayOnly) return;
    setAddedDateFilter('Added today');
  }, [route.params?.initialTodayOnly]);

  useEffect(() => {
    if (route.params?.initialSinceHours === undefined) return;
    setInitialSinceHours(route.params.initialSinceHours);
    setAddedDateFilter(route.params.initialSinceHours === 24 ? 'Last 24h' : 'Last 24h');
  }, [route.params?.initialSinceHours]);

  useEffect(() => {
    if (route.params?.initialSize === undefined) return;
    setSizeFilter(route.params.initialSize);
  }, [route.params?.initialSize]);

  useEffect(() => {
    if (route.params?.initialClothingType === undefined) return;
    setClothingType(route.params.initialClothingType);
  }, [route.params?.initialClothingType]);
  useEffect(() => {
    if (route.params?.initialCategory === undefined) return;
    setCategoryFilter(route.params.initialCategory);
  }, [route.params?.initialCategory]);

  useEffect(() => {
    if (route.params?.initialBrandId === undefined) return;
    setBrandFilter(route.params.initialBrandId);
  }, [route.params?.initialBrandId]);

  useEffect(() => {
    if (route.params?.initialSizeBucket === undefined) return;
    setSizeBucketFilter(route.params.initialSizeBucket);
  }, [route.params?.initialSizeBucket]);

  useEffect(() => {
    if (route.params?.initialStorageLocationId === undefined) return;
    setStorageLocationIdFilter(route.params.initialStorageLocationId);
  }, [route.params?.initialStorageLocationId]);

  useEffect(() => {
    if (route.params?.initialQuery === undefined) return;
    setQuery(route.params.initialQuery);
  }, [route.params?.initialQuery]);
  useEffect(() => {
    if (route.params?.initialItemIds === undefined) return;
    setItemIdsFilter(route.params.initialItemIds);
  }, [route.params?.initialItemIds]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    const cacheMissingImages = async () => {
      const linkedItemIds = childId
        ? new Set(childItems.filter((link) => link.childId === childId).map((link) => link.itemId))
        : undefined;
      const candidates = items
        .filter((item) => (linkedItemIds ? linkedItemIds.has(item.id) : true))
        .filter((item) => (status === 'All' ? true : item.status === status))
        .filter((item) => !item.cachedImageUri)
        .map((item) => ({ id: item.id, url: getItemDisplayImageUri(item) || '' }))
        .filter((item) => item.url.startsWith('http'))
        .slice(0, 18);

      for (const candidate of candidates) {
        if (cancelled) return;
        try {
          const uri = await cacheRemoteImage(candidate.id, candidate.url);
          if (!uri || cancelled) continue;
          await updateItemCachedImage(candidate.id, uri);
        } catch {
          // Best-effort thumbnail cache.
        }
      }
    };

    cacheMissingImages();
    return () => {
      cancelled = true;
    };
  }, [items, childItems, childId, status, updateItemCachedImage]);

  const linksByItem = useMemo(() => {
    const map = new Map<string, typeof childItems>();
    childItems.forEach((link) => {
      const prev = map.get(link.itemId) ?? [];
      prev.push(link);
      map.set(link.itemId, prev);
    });
    return map;
  }, [childItems]);

  const childOptions = useMemo(() => ['All', ...children.map((child) => child.name)], [children]);
  const statusOptions: StatusFilter[] = ['All', 'wishlist', 'owned', 'for-sale', 'sold'];
  const clothingTypeOptions: ClothingTypeFilter[] = ['All', 'sleeper', 'romper', 'top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'];
  const sortedOptions: SortedFilter[] = ['All', 'Unsorted'];
  const wearOptions: WearFilter[] = ['All', 'Most worn', 'Neglected'];
  const brandOptions = useMemo(() => ['All', ...brands], [brands]);
  const wishlistVisibleCategories = useMemo(() => getConfiguredWishlistCategories(settings), [settings]);
  const wishlistCategoryOrderForEdit = useMemo(
    () => sanitizeCategoryOrder(settings.wishlistCategoryOrder, { includeOther: false, fallback: DEFAULT_WISHLIST_CATEGORY_ORDER }),
    [settings.wishlistCategoryOrder],
  );
  const hiddenWishlistCategoriesForEdit = useMemo(
    () => new Set(sanitizeHiddenCategories(settings.hiddenWishlistCategories, { includeOther: false })),
    [settings.hiddenWishlistCategories],
  );
  const wishlistCategoryOptions = useMemo<CategoryFilter[]>(
    () => ['All', ...wishlistVisibleCategories],
    [wishlistVisibleCategories],
  );

  const activeChild = children.find((entry) => entry.id === childId);
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const sinceHoursStart = initialSinceHours ? now.getTime() - initialSinceHours * 60 * 60 * 1000 : undefined;
  const childOwnedItems = useMemo(() => {
    if (!childId) return [];
    const linked = new Set((childItems.filter((link) => link.childId === childId)).map((link) => link.itemId));
    return items.filter((item) => linked.has(item.id) && item.status === 'owned');
  }, [childId, childItems, items]);
  const sizeAnchors = useMemo(() => getSizeAnchors(childOwnedItems, activeChild), [childOwnedItems, activeChild]);
  const currentSizeText = getChildCurrentSizeText(activeChild);
  const nextSizeText = getChildNextSizeText(activeChild);
  const wishlistShareSizeBucketLabel = useMemo<'Now' | 'Next' | 'Both' | undefined>(() => {
    if (sizeBucketFilter === 'now') return 'Now';
    if (sizeBucketFilter === 'next') return 'Next';
    if (sizeBucketFilter === 'All' && (currentSizeText || nextSizeText)) return 'Both';
    return undefined;
  }, [sizeBucketFilter, currentSizeText, nextSizeText]);

  const filtered = useMemo(() => items.filter((item) => {
    if (itemIdsFilter && itemIdsFilter.length > 0 && !itemIdsFilter.includes(item.id)) return false;
    const links = linksByItem.get(item.id) ?? [];
    const childSpecificLink = childId ? links.find((link) => link.childId === childId) : undefined;
    const itemCategory = closetCategoryForItem(item);

    if (childId && !childSpecificLink) return false;
    if (isWishlistScreen && !wishlistVisibleCategories.includes(itemCategory)) return false;
    if (storageLocationIdFilter && (!childSpecificLink || childSpecificLink.storageLocationId !== storageLocationIdFilter)) return false;
    if (status !== 'All') {
      const effectiveStatus = childSpecificLink?.statusForChild ?? item.status;
      if (effectiveStatus !== status) return false;
    }
    if (clothingType !== 'All' && item.clothingType !== clothingType) return false;
    if (categoryFilter !== 'All' && itemCategory !== categoryFilter) return false;
    if (brandFilter !== 'All' && !item.brandTags.includes(brandFilter) && (item.brand ?? '').toLowerCase().trim() !== brandFilter.toLowerCase().trim()) return false;
    if (sizeBucketFilter !== 'All' && childId) {
      const category = closetCategoryForItem(item);
      const current = sizeAnchors.currentByCategory.get(category);
      const next = sizeAnchors.nextByCategory.get(category);
      if (sizeBucketFilter === 'now' && (!current || item.size.toLowerCase().trim() !== current.toLowerCase().trim())) return false;
      if (sizeBucketFilter === 'next' && (!next || item.size.toLowerCase().trim() !== next.toLowerCase().trim())) return false;
    }
    if (sortedFilter === 'Unsorted' && !isUnsortedItem(item)) return false;
    if (wearFilter === 'Most worn' && (item.wornCount ?? 0) <= 0) return false;
    if (wearFilter === 'Neglected' && (item.wornCount ?? 0) > 1) return false;
    if (addedDateFilter === 'Added today' && (item.createdAt < dayStart || item.createdAt >= dayEnd)) return false;
    if (addedDateFilter === 'Last 24h' && sinceHoursStart !== undefined && item.createdAt < sinceHoursStart) return false;
    if (sizeFilter.trim() && item.size.toLowerCase().trim() !== sizeFilter.toLowerCase().trim()) return false;
    return tokenMatch(item, debouncedQuery);
  }), [
    items,
    linksByItem,
    childId,
    storageLocationIdFilter,
    status,
    isWishlistScreen,
    wishlistVisibleCategories,
    clothingType,
    categoryFilter,
    brandFilter,
    sizeBucketFilter,
    sizeAnchors,
    sortedFilter,
    wearFilter,
    addedDateFilter,
    dayStart,
    dayEnd,
    sinceHoursStart,
    sizeFilter,
    itemIdsFilter,
    debouncedQuery,
  ]);

  const canShareWishlist = Boolean(childId && status === 'wishlist' && filtered.length > 0);
  const filterSummary = useMemo(() => {
    const childLabel = activeChild ? activeChild.name : 'All kids';
    const statusLabel = status === 'All' ? 'All statuses' : status;
    const queryLabel = debouncedQuery.trim() ? 'Search on' : undefined;
    return [childLabel, statusLabel, queryLabel].filter(Boolean).join(' • ');
  }, [activeChild, status, debouncedQuery]);

  const chooseChild = (name: string) => {
    if (name === 'All') {
      setChildId(undefined);
      return;
    }
    setChildId(children.find((child) => child.name === name)?.id);
  };

  const quickSave = async () => {
    try {
      if (children.length === 0) {
        Alert.alert('Create a Child First', 'Add a child in the Kids tab before saving wishlist or closet items.');
        return;
      }

      validateQuickLinkSaveInput({
        childId: captureChildId,
        url: captureUrl,
        status: captureStatus,
      });

      setSavingQuick(true);
      const draft = await fetchLinkItemDraft({
        url: captureUrl,
        childId: captureChildId,
        status: captureStatus,
      });
      const created = await addItem(draft);
      if (created?.id) {
        const previewThumb = getItemDisplayImageUri(created) || '';
        if (/^https?:\/\//i.test(previewThumb)) {
          try {
            const cached = await cacheRemoteImage(created.id, previewThumb);
            if (cached) await updateItemCachedImage(created.id, cached);
          } catch {
            // Best-effort cache so wishlist thumbnails appear immediately.
          }
        }
      }
      await logEvent('item_created_via', {
        createdVia: 'quick_add',
        childId: captureChildId,
        status: captureStatus,
        itemId: created?.id ?? null,
      });
      if (created?.id) {
        showToast({
          label: 'Saved Link',
          doUndo: async () => {
            await archiveItems([created.id]);
          },
        });
      }
      await recordMeaningfulActionAndMaybePrompt('quick_save', 'items_list_quick_save');

      setCaptureUrl('');
    } catch (error) {
      if (__DEV__) console.error('[ItemsList.quickSave] failed', {
        captureStatus,
        captureChildId: captureChildId ?? null,
        hasUrl: Boolean(captureUrl.trim()),
      }, error);
      void logEvent('quick_link_save_failed', {
        status: captureStatus,
        childId: captureChildId ?? null,
        message: error instanceof Error ? error.message : 'unknown',
      }).catch(() => undefined);
      Alert.alert('Save Failed', error instanceof Error ? error.message : 'Could not save item. Please try again.');
    } finally {
      setSavingQuick(false);
    }
  };

  useLayoutEffect(() => {
    if (!isWishlistScreen) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable
            onPress={openShareSheet}
            style={{
              minHeight: 36,
              paddingHorizontal: 12,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surfaceMuted,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            accessibilityRole="button"
            accessibilityLabel="Share wishlist options"
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.textPrimary }}>Share</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, isWishlistScreen, openShareSheet, theme.colors.textPrimary, theme.colors.accentCoralSoft, theme.colors.surfaceMuted, theme.colors.border]);

  const getWishlistShareMessage = useCallback(() => {
    if (!childId || status !== 'wishlist') {
      throw new Error('Choose a child and wishlist status to export a wishlist.');
    }
    const child = children.find((entry) => entry.id === childId);
    if (!child) {
      throw new Error('Selected child not found.');
    }
    return {
      child,
      message: formatWishlistShareText(filtered, {
        childId,
        childName: child.name,
        sizeBucketLabel: wishlistShareSizeBucketLabel,
        monetizationEnabled: settings.monetizationEnabled,
        children,
        childItems,
      }),
    };
  }, [childId, status, children, filtered, wishlistShareSizeBucketLabel, settings.monetizationEnabled, childItems]);

  const shareWishlistText = async () => {
    if (!childId || status !== 'wishlist') {
      Alert.alert('Select filters', 'Choose a child and wishlist status to export a wishlist.');
      return;
    }
    const { child, message } = getWishlistShareMessage();
    await Share.share({ title: `${child.name} Wishlist`, message });
  };

  const emailWishlist = async () => {
    if (!childId || status !== 'wishlist') return;
    const { child, message } = getWishlistShareMessage();
    await Share.share({ title: `${child.name} Wishlist`, message });
  };

  const shareWishlistNative = async () => {
    if (!childId || status !== 'wishlist') return;
    const { child, message } = getWishlistShareMessage();
    await Share.share({ title: `${child.name} Wishlist`, message });
  };

  const copyWishlistText = async () => {
    if (!childId || status !== 'wishlist') {
      Alert.alert('Select filters', 'Choose a child and wishlist status to copy a wishlist.');
      return;
    }
    const { message } = getWishlistShareMessage();
    Clipboard.setString(message);
    Alert.alert('Copied', 'Wishlist text copied to clipboard.');
  };

  function openShareSheet() {
    Alert.alert('Share Wishlist', 'Choose an option', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Share via native share sheet (text)', onPress: () => void shareWishlistNative() },
      { text: 'Email', onPress: () => void emailWishlist() },
      { text: 'Copy text', onPress: () => void copyWishlistText() },
    ]);
  }

  const openWishlistFabMenu = () => {
    const actions = [
      { label: 'Add From Link', onPress: () => navigation.navigate('AddItem', { quick: false, prefillStatus: 'wishlist' }) },
      { label: 'Quick Add (Manual)', onPress: () => navigation.navigate('AddItem', { quick: true, prefillStatus: 'wishlist' }) },
    ];
    showActionMenu({ title: 'Add to Wishlist', message: 'Choose how to add', actions });
  };

  const openWishlistCategoryMenu = useCallback(
    (category: CategoryFilter) => {
      if (!hideInbox || category === 'All') return;
      showActionMenu({
        title: closetLabel[category],
        message: 'Wishlist category options',
        actions: [
          {
            label: 'Rearrange Categories',
            onPress: () => {
              setFiltersExpanded(true);
              setShowCategoryLayoutEditor(true);
            },
          },
          {
            label: 'Hide in Wishlist',
            onPress: () => {
              void (async () => {
                const current = new Set(sanitizeHiddenCategories(settings.hiddenWishlistCategories, { includeOther: false }));
                current.add(category);
                await updateSettings({ hiddenWishlistCategories: Array.from(current) });
                if (categoryFilter === category) setCategoryFilter('All');
              })();
            },
          },
        ],
      });
    },
    [categoryFilter, hideInbox, settings.hiddenWishlistCategories, updateSettings],
  );

  const applyPreset = (presetId: string) => {
    const preset = filterPresets.find((entry) => entry.id === presetId);
    if (!preset) return;

    setChildId(preset.childId);
    setStatus(preset.status ?? 'All');
    setClothingType(preset.clothingType ?? 'All');
    setSortedFilter(preset.includeUnsorted ? 'Unsorted' : 'All');
    setBrandFilter('All');
    setWearFilter('All');
    setAddedDateFilter('All');
    setSizeBucketFilter('All');
    setSizeFilter('');
    setQuery(preset.query ?? '');
  };

  const saveCurrentPreset = async () => {
    if (!presetName.trim()) {
      Alert.alert('Name required', 'Give this preset a name first.');
      return;
    }

    await saveFilterPreset({
      name: presetName.trim(),
      childId,
      status: status === 'All' ? undefined : status,
      clothingType: clothingType === 'All' ? undefined : clothingType,
      includeUnsorted: sortedFilter === 'Unsorted',
      query: query.trim() || undefined,
    });
    setPresetName('');
  };

  const toggleSelected = useCallback((itemId: string) => {
    setSelectedItemIds((prev) => (prev.includes(itemId) ? prev.filter((entry) => entry !== itemId) : [...prev, itemId]));
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => !prev);
    setSelectedItemIds([]);
    setBulkTag('');
  }, []);

  const handleListRowPress = useCallback((itemId: string) => {
    if (selectionMode) {
      toggleSelected(itemId);
      return;
    }
    openItemDetail(itemId);
  }, [openItemDetail, selectionMode, toggleSelected]);

  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);

  const applyBulkStatus = async (nextStatus: ItemStatus) => {
    if (selectedItemIds.length === 0) {
      Alert.alert('No items selected', 'Select one or more items first.');
      return;
    }
    const targetIds = [...selectedItemIds];
    const previous = targetIds.map((id) => ({ id, status: items.find((item) => item.id === id)?.status })).filter((entry): entry is { id: string; status: ItemStatus } => Boolean(entry.status));
    await bulkUpdateItems(targetIds, { status: nextStatus });
    showToast({
      label: `Updated ${targetIds.length} Status${targetIds.length === 1 ? '' : 'es'}`,
      doUndo: async () => {
        for (const entry of previous) {
          await updateItem(entry.id, { status: entry.status, statusForChild: entry.status });
        }
      },
    });
    await recordMeaningfulActionAndMaybePrompt('bulk_status_updated', 'items_list_bulk_status');
    setSelectedItemIds([]);
  };

  const applyBulkTag = async () => {
    if (!bulkTag.trim() || selectedItemIds.length === 0) {
      Alert.alert('Missing info', 'Enter a tag and select at least one item.');
      return;
    }
    await bulkUpdateItems(selectedItemIds, { appendTag: bulkTag });
    await recordMeaningfulActionAndMaybePrompt('bulk_tag_applied', 'items_list_bulk_tag');
    setBulkTag('');
    setSelectedItemIds([]);
  };

  const applyBulkMoveChild = async () => {
    if (!bulkChildId || selectedItemIds.length === 0) {
      Alert.alert('Missing info', 'Choose a child and select items first.');
      return;
    }
    await bulkAssignChild(selectedItemIds, bulkChildId);
    await recordMeaningfulActionAndMaybePrompt('bulk_child_assigned', 'items_list_bulk_assign_child');
    setSelectedItemIds([]);
  };

  const applyBulkArchive = async () => {
    if (selectedItemIds.length === 0) {
      Alert.alert('No items selected', 'Select one or more items first.');
      return;
    }

    Alert.alert('Archive selected items', `${selectedItemIds.length} items will be archived.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          const targetIds = [...selectedItemIds];
          void archiveItems(targetIds).then(() => {
            setSelectedItemIds([]);
            void recordMeaningfulActionAndMaybePrompt('items_archived', 'items_list_bulk_archive');
            showToast({
              label: `Archived ${targetIds.length} Item${targetIds.length === 1 ? '' : 's'}`,
              doUndo: async () => {
                await restoreItems(targetIds);
              },
            });
          });
        },
      },
    ]);
  };

  return (
    <Screen
      scroll={false}
      style={styles.screen}
      overlay={(
        <FloatingActionButton
          onPress={() => {
            if (isWishlistScreen) {
              navigation.navigate('AddItem', { quick: false, prefillStatus: 'wishlist' });
              return;
            }
            navigation.navigate('AddItem');
          }}
          onLongPress={isWishlistScreen ? openWishlistFabMenu : undefined}
          accessibilityLabel={isWishlistScreen ? 'Add from link to wishlist' : 'Add item'}
          testID={isWishlistScreen ? 'wishlist-fab-add' : 'items-fab-add'}
        />
      )}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {!hideInbox ? (
          <Card>
            <Text style={styles.inboxTitle}>Quick Save Link</Text>
            <FormInput
              label="Paste Link"
              value={captureUrl}
              onChangeText={setCaptureUrl}
              placeholder="Paste product URL"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              keyboardType="url"
              textContentType="URL"
              contextMenuHidden={false}
            />
            <ChipSelector
              label="Child"
              options={children.map((child) => child.name)}
              value={children.find((child) => child.id === captureChildId)?.name}
              onChange={(name) => setCaptureChildId(children.find((c) => c.name === name)?.id ?? '')}
            />
            {children.length === 0 ? <Text style={styles.smallMuted}>Create a child first in the Kids tab to save links.</Text> : null}
            <ChipSelector label="Status" options={['wishlist', 'owned', 'for-sale', 'sold']} value={captureStatus} onChange={setCaptureStatus} />
            <PrimaryButton label={savingQuick ? 'Saving...' : 'Save Now'} onPress={quickSave} />
          </Card>
        ) : null}

        {hideInbox ? (
          <Pressable
            style={styles.filtersToggleRow}
            onPress={() => setFiltersExpanded((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={`${filtersExpanded ? 'Hide' : 'Show'} filters`}
          >
            <View style={styles.filtersToggleHeadRow}>
              <Text style={styles.filtersToggleTitle}>Filters</Text>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  if (!hasClosetPowerAccess) {
                    navigation.navigate('ProPaywall', { entryContext: 'closet_power' });
                    return;
                  }
                  setShowCategoryLayoutEditor((prev) => !prev);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Edit wishlist categories"
              >
                <Text style={styles.filtersEditLink}>{showCategoryLayoutEditor ? 'Done Editing' : 'Edit Categories'}</Text>
              </Pressable>
            </View>
            <View style={styles.filtersToggleMetaRow}>
              <Text numberOfLines={1} style={styles.filtersToggleMeta}>{filterSummary}</Text>
              <Text style={styles.filtersToggleChevron}>{filtersExpanded ? '▲' : '▼'}</Text>
            </View>
          </Pressable>
        ) : null}

        {(!hideInbox || filtersExpanded) ? (
          <>
            {hideInbox && showCategoryLayoutEditor ? (
              <Card>
                <DraggableCategoryPrefsEditor
                  title="Wishlist Categories"
                  ordered={wishlistCategoryOrderForEdit}
                  hidden={hiddenWishlistCategoriesForEdit}
                  onReorder={async (next) => updateSettings({ wishlistCategoryOrder: next })}
                  onToggleHidden={async (category) => {
                    const current = new Set(sanitizeHiddenCategories(settings.hiddenWishlistCategories, { includeOther: false }));
                    if (current.has(category)) current.delete(category);
                    else current.add(category);
                    await updateSettings({ hiddenWishlistCategories: Array.from(current) });
                  }}
                />
                <PrimaryButton label="Done" variant="secondary" onPress={() => setShowCategoryLayoutEditor(false)} />
              </Card>
            ) : null}

            {advancedUnlocked ? (
              <Card>
                <Text style={styles.inboxTitle}>Saved Presets</Text>
                <FormInput label="Preset name" value={presetName} onChangeText={setPresetName} placeholder="Kid A winter wishlist" />
                <PrimaryButton label="Save Current Filters" variant="secondary" onPress={saveCurrentPreset} />
                {filterPresets.length === 0 ? <Text style={styles.smallMuted}>No presets yet.</Text> : null}
                {filterPresets.map((preset) => (
                  <View key={preset.id} style={styles.presetRow}>
                    <Pressable style={styles.presetPill} onPress={() => applyPreset(preset.id)}>
                      <Text style={styles.presetText}>{preset.name}</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteFilterPreset(preset.id)}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  </View>
                ))}
              </Card>
            ) : (
              <View style={styles.advancedHintRow}>
                <Text style={styles.advancedHintText}>More filters unlock as you add items.</Text>
                <Pressable onPress={() => navigation.getParent()?.navigate('Settings' as never)} accessibilityRole="button" accessibilityLabel="Learn more about advanced filters">
                  <Text style={styles.advancedHintLink}>Learn more</Text>
                </Pressable>
              </View>
            )}

            <FormInput label="Search" value={query} onChangeText={setQuery} clearable placeholder="Search title, brand, brand tags, or tags" autoCapitalize="none" />

            {children.length > 0 ? (
              <ChipSelector label="Filter by kid" options={childOptions} value={activeChild ? activeChild.name : 'All'} onChange={chooseChild} />
            ) : null}
            <ChipSelector label="Filter by status" options={statusOptions} value={status} onChange={setStatus} />
            <ChipSelector label="Added Date" options={['All', 'Added today', 'Last 24h']} value={addedDateFilter} onChange={setAddedDateFilter} />
            <ChipSelector
              label="Filter by category"
              options={wishlistCategoryOptions.map((entry) => (entry === 'All' ? 'All' : closetLabel[entry]))}
              value={categoryFilter === 'All' ? 'All' : closetLabel[categoryFilter]}
              onOptionLongPress={(value) => {
                if (value === 'All') return;
                const found = wishlistCategoryOptions.find((entry) => entry !== 'All' && closetLabel[entry] === value);
                if (!found || found === 'All') return;
                openWishlistCategoryMenu(found);
              }}
              onChange={(value) => {
                if (value === 'All') {
                  setCategoryFilter('All');
                  return;
                }
                const found = wishlistCategoryOptions.find((entry) => entry !== 'All' && closetLabel[entry] === value);
                setCategoryFilter((found as ClosetCategory | undefined) ?? 'All');
              }}
            />
            <ChipSelector
              label={currentSizeText || nextSizeText ? `Size bucket${currentSizeText ? ` (Now ${currentSizeText}` : ''}${nextSizeText ? ` / Next ${nextSizeText})` : currentSizeText ? ')' : ''}` : 'Size bucket'}
              options={['All', 'now', 'next']}
              value={sizeBucketFilter}
              onChange={(value) => setSizeBucketFilter(value as 'All' | 'now' | 'next')}
            />
            <FormInput label="Filter by size" value={sizeFilter} onChangeText={setSizeFilter} placeholder="e.g. 3T" />
            <ChipSelector label="Filter by clothing type" options={clothingTypeOptions} value={clothingType} onChange={setClothingType} />
            {advancedUnlocked && brandOptions.length > 1 ? <ChipSelector label="Filter by brand tag" options={brandOptions} value={brandFilter} onChange={setBrandFilter} /> : null}
            {advancedUnlocked ? <ChipSelector label="Filter by sort state" options={sortedOptions} value={sortedFilter} onChange={setSortedFilter} /> : null}
            {advancedUnlocked ? <ChipSelector label="Wear insights" options={wearOptions} value={wearFilter} onChange={setWearFilter} /> : null}
          </>
        ) : null}

        <View style={styles.actionsRow}>
          {advancedUnlocked ? <PrimaryButton label={selectionMode ? 'Done Selecting' : 'Select Multiple'} variant="secondary" onPress={toggleSelectionMode} /> : null}
          {canShareWishlist ? <PrimaryButton label="Share Wishlist" variant="secondary" onPress={openShareSheet} /> : null}
        </View>

        {advancedUnlocked && selectionMode ? (
          <Card>
            <Text style={styles.inboxTitle}>Bulk Actions ({selectedItemIds.length} selected)</Text>
            <View style={styles.actionsRow}>
              <PrimaryButton label="Set Wishlist" variant="secondary" onPress={() => applyBulkStatus('wishlist')} />
              <PrimaryButton label="Set Owned" variant="secondary" onPress={() => applyBulkStatus('owned')} />
              <PrimaryButton label="Mark For Sale" variant="secondary" onPress={() => applyBulkStatus('for-sale')} />
            </View>
            <FormInput label="Add tag to selected" value={bulkTag} onChangeText={setBulkTag} placeholder="winter" />
            <PrimaryButton label="Apply Tag" variant="secondary" onPress={applyBulkTag} />
            <ChipSelector
              label="Move selected to child"
              options={children.map((child) => child.name)}
              value={children.find((entry) => entry.id === bulkChildId)?.name}
              onChange={(name) => setBulkChildId(children.find((entry) => entry.name === name)?.id ?? '')}
            />
            <PrimaryButton label="Move to Child" variant="secondary" onPress={applyBulkMoveChild} />
            <PrimaryButton label="Archive Selected" variant="danger" onPress={applyBulkArchive} />
          </Card>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            title={isWishlistScreen ? 'Wishlist is empty.' : 'No items yet.'}
            subtitle={
              isWishlistScreen
                ? 'Save a product link to start your wishlist.'
                : 'Add an item to start building your closet.'
            }
            actionLabel={isWishlistScreen ? 'Add From Link' : 'Quick Add'}
            onActionPress={() =>
              isWishlistScreen
                ? navigation.navigate('AddItem', { quick: false, prefillStatus: 'wishlist' })
                : navigation.navigate('AddItem', { quick: true, prefillStatus: 'owned' })
            }
            secondaryActionLabel={isWishlistScreen ? 'Quick Add' : undefined}
            onSecondaryActionPress={
              isWishlistScreen ? () => navigation.navigate('AddItem', { quick: true, prefillStatus: 'wishlist' }) : undefined
            }
          />
        ) : (
          filtered.map((item) => {
            const links = linksByItem.get(item.id) ?? [];
            const linkForDisplay = childId ? links.find((link) => link.childId === childId) : links[0];
            const child = children.find((entry) => entry.id === linkForDisplay?.childId);
            const assignedChildren = children.filter((entry) => item.childIds.includes(entry.id)).map((entry) => entry.name);
            const assignmentLabel = item.childIds.length > 1
              ? assignedChildren.length <= 2
                ? assignedChildren.join(' + ')
                : `${assignedChildren.length} kids`
              : undefined;
            const thumbUri = getItemDisplayImageUri(item);
            const thumbFallbackUri = getItemDisplayFallbackUri(item);
            const isSelected = selectedItemIdSet.has(item.id);

            return (
              <ItemListRow
                key={item.id}
                itemId={item.id}
                title={item.title}
                brand={item.brand}
                brandTags={item.brandTags}
                childName={child?.name ?? 'Unassigned'}
                assignmentLabel={assignmentLabel}
                quantity={item.quantity}
                sizeLabel={linkForDisplay?.sizeAtTime || item.size || 'N/A'}
                categoryLabel={formatItemCategoryLabel(item)}
                wornCount={item.wornCount}
                statusLabel={linkForDisplay?.statusForChild ?? item.status}
                isWishlist={item.status === 'wishlist'}
                isUnsorted={isUnsortedItem(item)}
                isSelected={isSelected}
                selectionMode={selectionMode}
                thumbUri={thumbUri}
                thumbFallbackUri={thumbFallbackUri}
                onPress={handleListRowPress}
              />
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 76,
  },
  inboxTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F1A17',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F1A17',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectionText: {
    fontSize: 12,
    color: '#716A63',
  },
  cardRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#F4EEE8',
  },
  thumbnailPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#F4EEE8',
    borderWidth: 1,
    borderColor: '#EAE1D8',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  meta: {
    fontSize: 13,
    color: '#716A63',
  },
  brand: {
    fontSize: 13,
    color: '#3F3833',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F6F1EC',
    borderWidth: 1,
    borderColor: '#EAE1D8',
  },
  badgeUnsorted: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fef3c7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3F3833',
    textTransform: 'capitalize',
  },
  actionsRow: {
    gap: 8,
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#EAE1D8',
    borderRadius: 999,
    backgroundColor: '#fff',
    flex: 1,
  },
  presetText: {
    color: '#1F1A17',
  },
  deleteText: {
    marginLeft: 10,
    color: '#991b1b',
    fontWeight: '600',
  },
  smallMuted: {
    color: '#716A63',
    fontSize: 13,
  },
  advancedHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  advancedHintText: {
    flex: 1,
    fontSize: 12,
    color: '#6b7280',
  },
  advancedHintLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  filtersToggleRow: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAE1D8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  filtersToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F1A17',
  },
  filtersToggleHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  filtersEditLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7FD7',
  },
  filtersToggleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filtersToggleMeta: {
    flex: 1,
    fontSize: 12,
    color: '#716A63',
  },
  filtersToggleChevron: {
    fontSize: 11,
    color: '#716A63',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.28)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    gap: 14,
    maxHeight: '80%',
  },
});
