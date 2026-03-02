import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { RemoteImage } from '@/components/RemoteImage';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClothingType } from '@/models';
import { ClosetStackParamList } from '@/navigation/types';
import { ClosetSizeMode, closetCategoryForItem, getSizeAnchors } from '@/utils/closetViewInsights';
import { ClosetCategory, closetCategoryToClothingType, closetLabel } from '@/utils/categories';
import { isAdvancedUnlocked } from '@/utils/featureUnlock';
import { categoryForItem, getChildItems, getDuplicateAdjacentGroups, getSizeUpCounts, getWearingNowByCategory, sizeToNumber } from '@/utils/fitInsights';
import { normalizePrintName } from '@/utils/printName';
import { normalizeStyleName } from '@/utils/styleName';
import { formatSizeDisplay, getChildCurrentSizeText, getChildNextSizeText } from '@/utils/sizes';
import { useAppTheme } from '@/theme';
import { cacheRemoteImage } from '@/utils/imageCache';
import { getItemDisplayImageUri } from '@/utils/itemMedia';
import { getSizeChipTransitionOnTap, normalizeSizeLabel, uniqueSortedSizeEntries } from '@/utils/sizeOrder';

type Props = NativeStackScreenProps<ClosetStackParamList, 'CategorySnapshot'>;

type CategoryGridCardProps = {
  itemId: string;
  title: string;
  size: string;
  uri?: string;
  compact?: boolean;
  onPress: (itemId: string) => void;
};

const CategoryGridCardComponent: React.FC<CategoryGridCardProps> = ({ itemId, title, size, uri, compact = false, onPress }) => {
  const theme = useAppTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.gridCard,
        compact ? styles.gridCardCompact : null,
        pressed ? { opacity: 0.95, backgroundColor: theme.colors.surfaceMuted } : null,
      ]}
      onPress={() => onPress(itemId)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${size || 'size unknown'}`}
    >
      <RemoteImage uri={uri} style={[styles.gridImage, compact ? styles.gridImageCompact : null]} fallbackLabel={title} />
      <View style={styles.gridTextWrap}>
        <Text numberOfLines={compact ? 2 : 1} style={[styles.gridTitle, compact ? styles.gridTitleCompact : null, { fontFamily: theme.fonts.serif }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.gridMeta, compact ? styles.gridMetaCompact : null]}>{size || 'Size not set'}</Text>
      </View>
    </Pressable>
  );
};

const CategoryGridCard = React.memo(CategoryGridCardComponent);

export const CategorySnapshotScreen: React.FC<Props> = ({ route, navigation }) => {
  const theme = useAppTheme();
  const { children, items, childItems, storageLocations, settings, updateItemCachedImage } = useData();
  const child = children.find((entry) => entry.id === route.params.childId);
  const category = route.params.category as ClosetCategory;
  const [sizeModeFilter, setSizeModeFilter] = useState<ClosetSizeMode>(route.params.sizeMode ?? 'both');
  const [selectedSizeChip, setSelectedSizeChip] = useState<string | null>(null);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>(route.params.brandIds?.length ? route.params.brandIds : route.params.brandId ? [route.params.brandId] : []);
  const [styleFilter, setStyleFilter] = useState<string>('All');
  const [warmedImageUris, setWarmedImageUris] = useState<Record<string, { source: string; cached: string }>>({});
  const season = route.params.season;
  const [binType, setBinType] = useState<ClothingType>('bottom');
  const [binSize, setBinSize] = useState('3T');
  const [showPrintDuplicates, setShowPrintDuplicates] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showSizeUps, setShowSizeUps] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [compactGrid, setCompactGrid] = useState(false);
  const sizeCheckTypeOptions: Array<{ label: string; value: ClothingType }> = [
    { label: 'Pants', value: 'bottom' },
    { label: 'Tops', value: 'top' },
    { label: 'PJs', value: 'sleeper' },
    { label: 'Outerwear', value: 'outerwear' },
    { label: 'Shoes', value: 'shoes' },
  ];
  const advancedUnlocked = isAdvancedUnlocked(settings, children, childItems, items);
  const showLocationUi = advancedUnlocked || storageLocations.length > 0;
  const childLocations = storageLocations.filter((location) => !location.childId || location.childId === route.params.childId);
  const locationOptions = ['All', 'Unassigned', ...childLocations.map((location) => location.name)];
  const sizeModeOptions: Array<{ label: string; value: ClosetSizeMode }> = [
    { label: 'Now', value: 'now' },
    { label: 'Next', value: 'next' },
    { label: 'All', value: 'both' },
  ];
  const currentSizeLabel = getChildCurrentSizeText(child);
  const nextSizeLabel = getChildNextSizeText(child);
  const currentSizeNormalized = normalizeSizeLabel(currentSizeLabel || '');
  const nextSizeNormalized = normalizeSizeLabel(nextSizeLabel || '');
  const sizeSelection = useMemo(
    () => ({
      now: sizeModeFilter === 'now' || sizeModeFilter === 'both',
      next: sizeModeFilter === 'next' || sizeModeFilter === 'both',
    }),
    [sizeModeFilter],
  );
  const toggleSizeSelection = useCallback(
    (key: 'now' | 'next') => {
      const next = { ...sizeSelection, [key]: !sizeSelection[key] };
      let nextMode: ClosetSizeMode = 'both';
      if (next.now && next.next) nextMode = 'both';
      else if (next.now) nextMode = 'now';
      else if (next.next) nextMode = 'next';
      setSizeModeFilter(nextMode);
      if (nextMode === 'now') setSelectedSizeChip(currentSizeNormalized || null);
      else if (nextMode === 'next') setSelectedSizeChip(nextSizeNormalized || null);
      else setSelectedSizeChip(null);
    },
    [sizeSelection, currentSizeNormalized, nextSizeNormalized],
  );
  const selectAllSizes = useCallback(() => { setSelectedSizeChip(null); setSizeModeFilter('both'); }, []);

  const selectSpecificSizeChip = useCallback((value: string) => {
    const transition = getSizeChipTransitionOnTap({ tapped: value, currentSize: currentSizeNormalized, nextSize: nextSizeNormalized });
    setSizeModeFilter(transition.mode);
    setSelectedSizeChip(transition.selectedSizeChip || null);
  }, [currentSizeNormalized, nextSizeNormalized]);

  const categoryBaseItems = useMemo(() => {
    if (!child) return null;
    const childData = getChildItems(child, items, childItems);
    const linkMap = new Map(childItems.filter((link) => link.childId === child.id).map((link) => [link.itemId, link.storageLocationId ?? '']));
    const owned = childData.items.filter((item) => item.status === 'owned' && closetCategoryForItem(item) === category);
    return { childData, linkMap, owned };
  }, [child, items, childItems, category]);

  const locationScopedOwnedCategoryItems = useMemo(() => {
    if (!categoryBaseItems) return [] as typeof items;
    return categoryBaseItems.owned.filter((item) => {
      if (locationFilter === 'All') return true;
      const locationId = categoryBaseItems.linkMap.get(item.id) ?? '';
      if (locationFilter === 'Unassigned') return !locationId;
      const location = childLocations.find((entry) => entry.id === locationId);
      return location?.name === locationFilter;
    });
  }, [categoryBaseItems, locationFilter, childLocations]);

  const seasonScopedOwnedCategoryItems = useMemo(() => (
    season
      ? locationScopedOwnedCategoryItems.filter((item: (typeof items)[number]) => item.seasonTags.some((tag: string) => tag.toLowerCase().trim() === season.toLowerCase().trim()))
      : locationScopedOwnedCategoryItems
  ), [locationScopedOwnedCategoryItems, season]);

  const presentSizeEntries = useMemo(
    () => uniqueSortedSizeEntries(seasonScopedOwnedCategoryItems.map((item) => item.sizeNormalized || item.size)),
    [seasonScopedOwnedCategoryItems],
  );

  const activeSizeEntries = useMemo(
    () => uniqueSortedSizeEntries([currentSizeLabel, nextSizeLabel]),
    [currentSizeLabel, nextSizeLabel],
  );

  const visibleExactSizeEntries = useMemo(() => {
    if (sizeModeFilter === 'both') return presentSizeEntries;
    return activeSizeEntries.length > 0 ? activeSizeEntries : presentSizeEntries;
  }, [sizeModeFilter, activeSizeEntries, presentSizeEntries]);

  const activeSizeNormalizedSet = useMemo(() => new Set(activeSizeEntries.map((entry) => entry.normalized)), [activeSizeEntries]);

  useEffect(() => {
    if (!selectedSizeChip) return;
    const allowed = new Set([...presentSizeEntries, ...activeSizeEntries].map((entry) => entry.normalized));
    if (!allowed.has(selectedSizeChip)) setSelectedSizeChip(null);
  }, [selectedSizeChip, presentSizeEntries, activeSizeEntries]);

  useEffect(() => {
    if (sizeModeFilter === 'now') {
      setSelectedSizeChip(currentSizeNormalized || null);
      return;
    }
    if (sizeModeFilter === 'next') {
      setSelectedSizeChip(nextSizeNormalized || null);
    }
  }, [sizeModeFilter, currentSizeNormalized, nextSizeNormalized]);

  const matchesSnapshotSizeFilter = useCallback((item: { size: string; sizeNormalized?: string }) => {
    const itemSize = normalizeSizeLabel(item.sizeNormalized || item.size || '');
    if (!itemSize) return sizeModeFilter === 'both' && !selectedSizeChip;
    if (selectedSizeChip) return itemSize === selectedSizeChip;
    if (sizeModeFilter === 'both') return true;
    if (sizeModeFilter === 'now') {
      if (child?.usesMixedSizes && activeSizeNormalizedSet.size > 0) return activeSizeNormalizedSet.has(itemSize);
      return Boolean(currentSizeNormalized && itemSize === currentSizeNormalized);
    }
    return Boolean(nextSizeNormalized && itemSize === nextSizeNormalized);
  }, [sizeModeFilter, selectedSizeChip, child?.usesMixedSizes, activeSizeNormalizedSet, currentSizeNormalized, nextSizeNormalized]);
  const normalizeBrandFilterKey = useCallback((value: string) => value.toLowerCase().trim(), []);
  const matchesSelectedBrands = useCallback((item: { brand?: string | null; brandTags: string[] }, brands: string[]) => {
    if (brands.length === 0) return true;
    const itemBrand = normalizeBrandFilterKey(item.brand ?? '');
    const itemBrandTags = new Set(item.brandTags.map((tag) => normalizeBrandFilterKey(tag)));
    return brands.some((brand) => {
      const key = normalizeBrandFilterKey(brand);
      return itemBrand === key || itemBrandTags.has(key);
    });
  }, [normalizeBrandFilterKey]);
  const toggleBrandSelection = useCallback((option: string) => {
    if (option === 'All') {
      setSelectedBrandIds([]);
      return;
    }
    setSelectedBrandIds((current) => {
      const exists = current.some((entry) => normalizeBrandFilterKey(entry) === normalizeBrandFilterKey(option));
      if (exists) return current.filter((entry) => normalizeBrandFilterKey(entry) !== normalizeBrandFilterKey(option));
      return [...current, option];
    });
  }, [normalizeBrandFilterKey]);

  const availableBrandOptions = useMemo(() => {
    if (!categoryBaseItems || !child) return ['All'];
    const scopedByLocation = categoryBaseItems.owned.filter((item) => {
      if (locationFilter === 'All') return true;
      const locationId = categoryBaseItems.linkMap.get(item.id) ?? '';
      if (locationFilter === 'Unassigned') return !locationId;
      const location = childLocations.find((entry) => entry.id === locationId);
      return location?.name === locationFilter;
    });
    const scopedBySize = scopedByLocation.filter((item) => matchesSnapshotSizeFilter(item));
    const scopedBySeason = season
      ? scopedBySize.filter((item) => item.seasonTags.some((tag) => tag.toLowerCase().trim() === season.toLowerCase().trim()))
      : scopedBySize;
    const names = new Map<string, string>();
    const addName = (raw: string) => {
      const candidate = raw.trim();
      if (!candidate) return;
      const key = candidate.toLowerCase();
      const current = names.get(key);
      if (!current || (current === current.toLowerCase() && candidate !== candidate.toLowerCase())) names.set(key, candidate);
    };
    scopedBySeason.forEach((item) => {
      addName(item.brand ?? '');
      item.brandTags.forEach((tag) => addName(tag));
    });
    return ['All', ...Array.from(names.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
  }, [categoryBaseItems, child, childLocations, locationFilter, sizeModeFilter, category, season, matchesSnapshotSizeFilter]);

  useEffect(() => {
    setSelectedBrandIds((current) => current.filter((brand) => availableBrandOptions.includes(brand)));
  }, [availableBrandOptions]);

  const availableStyleOptions = useMemo(() => {
    if (!categoryBaseItems || !child) return ['All'];
    const scopedByLocation = categoryBaseItems.owned.filter((item) => {
      if (locationFilter === 'All') return true;
      const locationId = categoryBaseItems.linkMap.get(item.id) ?? '';
      if (locationFilter === 'Unassigned') return !locationId;
      const location = childLocations.find((entry) => entry.id === locationId);
      return location?.name === locationFilter;
    });
    const scopedBySize = scopedByLocation.filter((item) => matchesSnapshotSizeFilter(item));
    const scopedBySeason = season
      ? scopedBySize.filter((item) => item.seasonTags.some((tag) => tag.toLowerCase().trim() === season.toLowerCase().trim()))
      : scopedBySize;
    const scopedByBrand = scopedBySeason.filter((item) => matchesSelectedBrands(item, selectedBrandIds));
    const names = new Map<string, string>();
    scopedByBrand.forEach((item) => {
      const candidate = (item.styleName ?? '').trim();
      if (!candidate) return;
      const key = candidate.toLowerCase();
      const current = names.get(key);
      if (!current || (current === current.toLowerCase() && candidate !== candidate.toLowerCase())) names.set(key, candidate);
    });
    return ['All', ...Array.from(names.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
  }, [categoryBaseItems, child, childLocations, locationFilter, season, selectedBrandIds, matchesSnapshotSizeFilter, matchesSelectedBrands]);

  useEffect(() => {
    if (!availableStyleOptions.includes(styleFilter)) {
      setStyleFilter('All');
    }
  }, [availableStyleOptions, styleFilter]);

  const summary = useMemo(() => {
    if (!child || !categoryBaseItems) return undefined;
    const { childData, linkMap } = categoryBaseItems;
    const owned = childData.items.filter((item) => {
      if (item.status !== 'owned') return false;
      if (closetCategoryForItem(item) !== category) return false;
      if (locationFilter === 'All') return true;
      const locationId = linkMap.get(item.id) ?? '';
      if (locationFilter === 'Unassigned') return !locationId;
      const location = childLocations.find((entry) => entry.id === locationId);
      return location?.name === locationFilter;
    });
    const anchors = getSizeAnchors(owned, child);
    const sizeFiltered = owned.filter((item) => matchesSnapshotSizeFilter(item));
    const brandFiltered = sizeFiltered.filter((item) => matchesSelectedBrands(item, selectedBrandIds));
    const seasonFiltered = season
      ? brandFiltered.filter((item) => item.seasonTags.some((tag) => tag.toLowerCase().trim() === season.toLowerCase().trim()))
      : brandFiltered;
    const styleFiltered = styleFilter !== 'All'
      ? seasonFiltered.filter((item) => normalizeStyleName(item.styleName) === normalizeStyleName(styleFilter))
      : seasonFiltered;
    const wearingNowAll = getWearingNowByCategory(childData.items.filter((item) => item.status === 'owned'), child);
    const currentSize = wearingNowAll.get(category);
    const nextSize = anchors.nextByCategory.get(category);
    const currentCount = currentSize ? styleFiltered.filter((item) => item.size === currentSize).length : 0;
    const sizeUpsCount = nextSize
      ? styleFiltered.filter((item) => item.size.toLowerCase().trim() === nextSize.toLowerCase().trim()).length
      : currentSize
      ? styleFiltered.filter((item) => {
          const n = sizeToNumber(item.size);
          const c = sizeToNumber(currentSize);
          return n !== undefined && c !== undefined && n > c;
        }).length
      : 0;
    const duplicates = getDuplicateAdjacentGroups(styleFiltered);
    const sortedByWorn = [...styleFiltered].sort((a, b) => (b.wornCount ?? 0) - (a.wornCount ?? 0));
    return {
      items: styleFiltered.slice().sort((a, b) => b.createdAt - a.createdAt),
      currentSize: currentSize ?? 'N/A',
      currentCount,
      sizeUpsCount,
      duplicates,
      mostWorn: sortedByWorn[0],
      leastWorn: sortedByWorn.length ? sortedByWorn[sortedByWorn.length - 1] : undefined,
    };
  }, [child, categoryBaseItems, category, locationFilter, childLocations, selectedBrandIds, styleFilter, season, matchesSnapshotSizeFilter, matchesSelectedBrands]);

  if (!child || !summary) {
    return (
      <Screen>
        <EmptyState title="Snapshot unavailable" subtitle="Try again from Closet home." />
      </Screen>
    );
  }

  const childData = getChildItems(child, items, childItems);
  const sizeUpBinCount = childData.items.filter(
    (item) => item.status === 'owned' && item.clothingType === binType && item.size.toUpperCase().trim() === binSize.toUpperCase().trim(),
  ).length;

  const printDuplicateGroups = useMemo(() => {
    const groups = new Map<string, { printName: string; sizes: Set<string>; count: number }>();
    childData.items
      .filter((item) => item.status === 'owned' && closetCategoryForItem(item) === category && (item.printNameNorm || item.printName?.trim()))
      .filter((item) => matchesSelectedBrands(item, selectedBrandIds))
      .filter((item) => (styleFilter === 'All' ? true : normalizeStyleName(item.styleName) === normalizeStyleName(styleFilter)))
      .filter((item) => (season ? item.seasonTags.some((tag) => tag.toLowerCase().trim() === season.toLowerCase().trim()) : true))
      .forEach((item) => {
        const key = item.printNameNorm || normalizePrintName(item.printName ?? '');
        if (!key) return;
        const prev = groups.get(key) ?? { printName: item.printName?.trim() || key, sizes: new Set<string>(), count: 0 };
        prev.sizes.add(item.size);
        prev.count += 1;
        groups.set(key, prev);
      });

    return Array.from(groups.values())
      .filter((entry) => entry.sizes.size > 1)
      .map((entry) => ({
        printName: entry.printName,
        sizes: Array.from(entry.sizes),
        count: entry.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [childData.items, category, selectedBrandIds, styleFilter, season, matchesSelectedBrands]);

  const gridItems = summary.items;
  useEffect(() => {
    let cancelled = false;
    const warmVisibleImages = async () => {
      const candidates = gridItems
        .filter((item) => !item.cachedImageUri)
        .map((item) => ({ id: item.id, source: getItemDisplayImageUri(item) || '' }))
        .filter((entry) => /^https?:\/\//i.test(entry.source))
        .filter((entry) => {
          const warmed = warmedImageUris[entry.id];
          return !warmed || warmed.source !== entry.source;
        })
        .slice(0, 18);

      for (const candidate of candidates) {
        if (cancelled) return;
        try {
          const cached = await cacheRemoteImage(candidate.id, candidate.source);
          if (!cached || cancelled) continue;
          setWarmedImageUris((current) => ({ ...current, [candidate.id]: { source: candidate.source, cached } }));
          await updateItemCachedImage(candidate.id, cached);
        } catch {
          // Best-effort warm cache for faster category images.
        }
      }
    };
    void warmVisibleImages();
    return () => {
      cancelled = true;
    };
  }, [gridItems, warmedImageUris, updateItemCachedImage]);
  const openItemDetail = useCallback((itemId: string) => {
    navigation.navigate('ItemDetail', { itemId });
  }, [navigation]);
  const sizeModeLabel = sizeModeOptions.find((option) => option.value === sizeModeFilter)?.label ?? 'All';
  const addCategoryFromSnapshot = useCallback(() => {
    navigation.navigate('AddItem', {
      prefillStatus: 'owned',
      prefillChildId: child.id,
      prefillCategory: category,
      prefillType: closetCategoryToClothingType(category),
    });
  }, [navigation, child?.id, category]);

  return (
    <Screen>
      <Card>
        <Text style={[styles.title, { fontFamily: theme.fonts.serif }]}>{child.name} {closetLabel[category]}</Text>
        <View style={styles.filtersBlock}>
          <View style={styles.sizeToggleWrap}>
            <Text style={styles.metaLabel}>Size</Text>
            <View style={styles.sizeToggleRow}>
              <Pressable style={[styles.sizeChip, sizeSelection.now ? styles.sizeChipActive : null]} onPress={() => toggleSizeSelection('now')}>
                <Text style={[styles.sizeChipText, sizeSelection.now ? styles.sizeChipTextActive : null]}>Now</Text>
              </Pressable>
              <Pressable style={[styles.sizeChip, sizeSelection.next ? styles.sizeChipActive : null]} onPress={() => toggleSizeSelection('next')}>
                <Text style={[styles.sizeChipText, sizeSelection.next ? styles.sizeChipTextActive : null]}>Next</Text>
              </Pressable>
              <Pressable style={[styles.sizeChip, sizeModeFilter === 'both' && !selectedSizeChip ? styles.sizeChipActive : null]} onPress={selectAllSizes}>
                <Text style={[styles.sizeChipText, sizeModeFilter === 'both' && !selectedSizeChip ? styles.sizeChipTextActive : null]}>All</Text>
              </Pressable>
              <Pressable style={[styles.sizeChip, compactGrid ? styles.sizeChipActive : null]} onPress={() => setCompactGrid((prev) => !prev)}>
                <Text style={[styles.sizeChipText, compactGrid ? styles.sizeChipTextActive : null]}>{compactGrid ? 'Comfortable Grid' : 'Compact Grid'}</Text>
              </Pressable>
            </View>
            {visibleExactSizeEntries.length > 0 ? (
              <View style={styles.sizeToggleRow}>
                {visibleExactSizeEntries.slice(0, 16).map((entry) => {
                  const active = selectedSizeChip === entry.normalized;
                  return (
                    <Pressable key={`snapshot-size-${entry.normalized}`} style={[styles.sizeChip, active ? styles.sizeChipActive : null]} onPress={() => selectSpecificSizeChip(entry.label)}>
                      <Text style={[styles.sizeChipText, active ? styles.sizeChipTextActive : null]}>{entry.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
          <ChipSelector
            label="Brand"
            options={availableBrandOptions}
            value={selectedBrandIds.length === 0 ? 'All' : undefined}
            selectedValues={selectedBrandIds}
            onChange={toggleBrandSelection}
          />
          <ChipSelector
            label="Style"
            options={availableStyleOptions}
            value={styleFilter}
            onChange={setStyleFilter}
          />
          {showLocationUi ? <ChipSelector label="Location" options={locationOptions} value={locationFilter} onChange={setLocationFilter} /> : null}
        </View>
        {gridItems.length === 0 ? (
          <View style={{ marginTop: 12 }}>
            <EmptyState
              title={`No ${closetLabel[category]} in ${sizeModeLabel}`}
              subtitle="Try another filter or add your first item for this category."
              actionLabel={`Add ${closetLabel[category]}`}
              onActionPress={addCategoryFromSnapshot}
            />
          </View>
        ) : (
          <View style={[styles.grid, compactGrid ? styles.gridCompact : null]}>
            {gridItems.map((item) => {
              const sourceUri = getItemDisplayImageUri(item) ?? '';
              const warmed = warmedImageUris[item.id];
              const displayUri = warmed && warmed.source === sourceUri ? warmed.cached : sourceUri || undefined;
              return (
                <CategoryGridCard
                  key={item.id}
                  itemId={item.id}
                  title={item.title}
                  size={item.size}
                  uri={displayUri}
                  compact={compactGrid}
                  onPress={openItemDetail}
                />
              );
            })}
          </View>
        )}
      </Card>

      <Card>
        <Pressable onPress={() => setShowInsights((prev) => !prev)} style={styles.sectionToggle}>
          <Text style={[styles.sectionToggleText, { fontFamily: theme.fonts.serif }]}>Insights {showInsights ? '▾' : '▸'}</Text>
        </Pressable>
        {showInsights ? (
          <View style={styles.sectionContent}>
            {child.currentSize.code ? <Text style={styles.meta}>Current Size (Profile): {formatSizeDisplay(child.currentSize.code, child.currentSize.otherText ?? null)}</Text> : null}
            {selectedBrandIds.length === 1 ? <Text style={styles.meta}>Brand Filter: {selectedBrandIds[0]}</Text> : null}
            {selectedBrandIds.length > 1 ? <Text style={styles.meta}>Brand Filter: {selectedBrandIds.length} brands</Text> : null}
            {styleFilter !== 'All' ? <Text style={styles.meta}>Style Filter: {styleFilter}</Text> : null}
            {season ? <Text style={styles.meta}>Season: {season}</Text> : null}
            <Text style={styles.meta}>Items in Current Size ({summary.currentSize}): {summary.currentCount}</Text>
            <Text style={styles.meta}>Size-Ups Count: {summary.sizeUpsCount}</Text>
            <Text style={styles.meta}>Duplicates: {summary.duplicates}</Text>
            <Text style={styles.meta}>Most Worn: {summary.mostWorn?.title ?? 'N/A'}</Text>
            <Text style={styles.meta}>Least Worn: {summary.leastWorn?.title ?? 'N/A'}</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Pressable onPress={() => setShowSizeUps((prev) => !prev)} style={styles.sectionToggle}>
          <Text style={[styles.sectionToggleText, { fontFamily: theme.fonts.serif }]}>Size Ups {showSizeUps ? '▾' : '▸'}</Text>
        </Pressable>
        {showSizeUps ? (
          <View style={styles.sectionContent}>
            <Text style={styles.meta}>Size-Up Bin Check</Text>
            <ChipSelector
              label="Type"
              options={sizeCheckTypeOptions.map((option) => option.label)}
              value={sizeCheckTypeOptions.find((option) => option.value === binType)?.label ?? sizeCheckTypeOptions[0].label}
              onChange={(label) => setBinType(sizeCheckTypeOptions.find((option) => option.label === label)?.value ?? binType)}
            />
            <ChipSelector label="Size" options={['2T', '3T', '4T', '5T']} value={binSize} onChange={setBinSize} />
            <Text style={styles.meta}>Do I Have {binSize} {binType}? {sizeUpBinCount} owned</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Pressable onPress={() => setShowPrintDuplicates((prev) => !prev)} style={styles.sectionToggle}>
          <Text style={[styles.sectionToggleText, { fontFamily: theme.fonts.serif }]}>
            Duplicates ({printDuplicateGroups.length}) {showPrintDuplicates ? '▾' : '▸'}
          </Text>
        </Pressable>
        {showPrintDuplicates ? (
          <View style={[styles.printGroupWrap, styles.sectionContent]}>
            {printDuplicateGroups.length === 0 ? <Text style={styles.meta}>No print duplicates found in this category.</Text> : null}
            {printDuplicateGroups.map((entry) => (
              <Text key={`${entry.printName}-${entry.sizes.join('|')}`} style={styles.meta}>
                {entry.printName}: {entry.sizes.join(', ')}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1F1A17',
  },
  meta: {
    fontSize: 14,
    color: '#716A63',
  },
  filtersBlock: {
    gap: 6,
    marginTop: 10,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F1A17',
  },
  sizeToggleWrap: {
    gap: 6,
  },
  sizeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  sizeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FAF5F1',
    borderWidth: 1,
    borderColor: '#EAE1D8',
  },
  sizeChipActive: {
    backgroundColor: '#F7E4DE',
    borderColor: '#E89C8A',
  },
  sizeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F1A17',
  },
  sizeChipTextActive: {
    color: '#1F1A17',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 8,
    marginTop: 8,
  },
  gridCompact: {
    justifyContent: 'flex-start',
  },
  gridCard: {
    width: '48.5%',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    padding: 5,
    gap: 6,
    borderWidth: 1,
    borderColor: '#EAE1D8',
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  gridCardCompact: {
    width: '31%',
    padding: 4,
    gap: 4,
  },
  gridImage: {
    width: '100%',
    aspectRatio: 0.96, borderRadius: 10,
    backgroundColor: '#F4EEE8',
  },
  gridImageCompact: {
    aspectRatio: 0.9,
    borderRadius: 8,
  },
  gridTextWrap: {
    gap: 1,
    paddingHorizontal: 1,
  },
  gridTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F1A17',
  },
  gridTitleCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  gridMeta: {
    fontSize: 11,
    color: '#716A63',
    fontWeight: '600',
  },
  gridMetaCompact: {
    fontSize: 10,
  },
  sectionToggle: {
    marginTop: 4,
  },
  sectionToggleText: {
    fontSize: 14,
    color: '#1d4ed8',
    fontWeight: '700',
  },
  printGroupWrap: {
    gap: 4,
  },
  sectionContent: {
    gap: 6,
    marginTop: 6,
  },
});
