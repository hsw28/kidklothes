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
import { formatSizeDisplay } from '@/utils/sizes';
import { useAppTheme } from '@/theme';
import { getItemDisplayImageUri } from '@/utils/itemMedia';

type Props = NativeStackScreenProps<ClosetStackParamList, 'CategorySnapshot'>;

type CategoryGridCardProps = {
  itemId: string;
  title: string;
  size: string;
  uri?: string;
  onPress: (itemId: string) => void;
};

const CategoryGridCardComponent: React.FC<CategoryGridCardProps> = ({ itemId, title, size, uri, onPress }) => {
  const theme = useAppTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.gridCard,
        pressed ? { opacity: 0.95, backgroundColor: theme.colors.surfaceMuted } : null,
      ]}
      onPress={() => onPress(itemId)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${size || 'size unknown'}`}
    >
      <RemoteImage uri={uri} style={styles.gridImage} fallbackLabel={title} />
      <View style={styles.gridTextWrap}>
        <Text numberOfLines={1} style={[styles.gridTitle, { fontFamily: theme.fonts.serif }]}>{title}</Text>
        <Text numberOfLines={1} style={styles.gridMeta}>{size || 'Size not set'}</Text>
      </View>
    </Pressable>
  );
};

const CategoryGridCard = React.memo(CategoryGridCardComponent);

export const CategorySnapshotScreen: React.FC<Props> = ({ route, navigation }) => {
  const theme = useAppTheme();
  const { children, items, childItems, storageLocations, settings } = useData();
  const child = children.find((entry) => entry.id === route.params.childId);
  const category = route.params.category as ClosetCategory;
  const [sizeModeFilter, setSizeModeFilter] = useState<ClosetSizeMode>(route.params.sizeMode ?? 'both');
  const [brandFilter, setBrandFilter] = useState<string>(route.params.brandId ?? 'All');
  const season = route.params.season;
  const [binType, setBinType] = useState<ClothingType>('bottom');
  const [binSize, setBinSize] = useState('3T');
  const [showPrintDuplicates, setShowPrintDuplicates] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showSizeUps, setShowSizeUps] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string>('All');
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
    { label: 'Both', value: 'both' },
  ];

  const categoryBaseItems = useMemo(() => {
    if (!child) return null;
    const childData = getChildItems(child, items, childItems);
    const linkMap = new Map(childItems.filter((link) => link.childId === child.id).map((link) => [link.itemId, link.storageLocationId ?? '']));
    const owned = childData.items.filter((item) => item.status === 'owned' && closetCategoryForItem(item) === category);
    return { childData, linkMap, owned };
  }, [child, items, childItems, category]);

  const availableBrandOptions = useMemo(() => {
    if (!categoryBaseItems || !child) return ['All'];
    const anchors = getSizeAnchors(categoryBaseItems.owned, child);
    const scopedByLocation = categoryBaseItems.owned.filter((item) => {
      if (locationFilter === 'All') return true;
      const locationId = categoryBaseItems.linkMap.get(item.id) ?? '';
      if (locationFilter === 'Unassigned') return !locationId;
      const location = childLocations.find((entry) => entry.id === locationId);
      return location?.name === locationFilter;
    });
    const scopedBySize = scopedByLocation.filter((item) => {
      if (sizeModeFilter === 'both') return true;
      const current = anchors.currentByCategory.get(category);
      const next = anchors.nextByCategory.get(category);
      if (sizeModeFilter === 'now') return Boolean(current && item.size.toLowerCase().trim() === current.toLowerCase().trim());
      return Boolean(next && item.size.toLowerCase().trim() === next.toLowerCase().trim());
    });
    const scopedBySeason = season
      ? scopedBySize.filter((item) => item.seasonTags.some((tag) => tag.toLowerCase().trim() === season.toLowerCase().trim()))
      : scopedBySize;
    const names = new Set<string>();
    scopedBySeason.forEach((item) => {
      (item.brand ?? '').trim() && names.add((item.brand ?? '').trim());
      item.brandTags.forEach((tag) => tag.trim() && names.add(tag.trim()));
    });
    return ['All', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [categoryBaseItems, child, childLocations, locationFilter, sizeModeFilter, category, season]);

  useEffect(() => {
    if (!availableBrandOptions.includes(brandFilter)) {
      setBrandFilter('All');
    }
  }, [availableBrandOptions, brandFilter]);

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
    const sizeFiltered = owned.filter((item) => {
      if (sizeModeFilter === 'both') return true;
      const current = anchors.currentByCategory.get(closetCategoryForItem(item));
      const next = anchors.nextByCategory.get(closetCategoryForItem(item));
      if (sizeModeFilter === 'now') return Boolean(current && item.size.toLowerCase().trim() === current.toLowerCase().trim());
      return Boolean(next && item.size.toLowerCase().trim() === next.toLowerCase().trim());
    });
    const brandFiltered = brandFilter !== 'All'
      ? sizeFiltered.filter((item) => item.brandTags.includes(brandFilter) || (item.brand ?? '').toLowerCase().trim() === brandFilter.toLowerCase().trim())
      : sizeFiltered;
    const seasonFiltered = season
      ? brandFiltered.filter((item) => item.seasonTags.some((tag) => tag.toLowerCase().trim() === season.toLowerCase().trim()))
      : brandFiltered;
    const wearingNowAll = getWearingNowByCategory(childData.items.filter((item) => item.status === 'owned'), child);
    const currentSize = wearingNowAll.get(category);
    const nextSize = anchors.nextByCategory.get(category);
    const currentCount = currentSize ? seasonFiltered.filter((item) => item.size === currentSize).length : 0;
    const sizeUpsCount = nextSize
      ? seasonFiltered.filter((item) => item.size.toLowerCase().trim() === nextSize.toLowerCase().trim()).length
      : currentSize
      ? seasonFiltered.filter((item) => {
          const n = sizeToNumber(item.size);
          const c = sizeToNumber(currentSize);
          return n !== undefined && c !== undefined && n > c;
        }).length
      : 0;
    const duplicates = getDuplicateAdjacentGroups(seasonFiltered);
    const sortedByWorn = [...seasonFiltered].sort((a, b) => (b.wornCount ?? 0) - (a.wornCount ?? 0));
    return {
      items: seasonFiltered.slice().sort((a, b) => b.createdAt - a.createdAt),
      currentSize: currentSize ?? 'N/A',
      currentCount,
      sizeUpsCount,
      duplicates,
      mostWorn: sortedByWorn[0],
      leastWorn: sortedByWorn.length ? sortedByWorn[sortedByWorn.length - 1] : undefined,
    };
  }, [child, categoryBaseItems, category, locationFilter, childLocations, sizeModeFilter, brandFilter, season]);

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
  }, [childData.items, category, season]);

  const gridItems = summary.items;
  const openItemDetail = useCallback((itemId: string) => {
    navigation.navigate('ItemDetail', { itemId });
  }, [navigation]);
  const sizeModeLabel = sizeModeOptions.find((option) => option.value === sizeModeFilter)?.label ?? 'Both';
  const addCategoryFromSnapshot = useCallback(() => {
    navigation.navigate('AddItem', {
      quick: true,
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
          <ChipSelector
            label="Size"
            options={sizeModeOptions.map((option) => option.label)}
            value={sizeModeOptions.find((option) => option.value === sizeModeFilter)?.label ?? 'Both'}
            onChange={(label) => setSizeModeFilter(sizeModeOptions.find((option) => option.label === label)?.value ?? 'both')}
          />
          <ChipSelector
            label="Brand"
            options={availableBrandOptions}
            value={brandFilter}
            onChange={setBrandFilter}
          />
          {showLocationUi ? <ChipSelector label="Location" options={locationOptions} value={locationFilter} onChange={setLocationFilter} /> : null}
        </View>
        {gridItems.length === 0 ? (
          <View style={{ marginTop: 12 }}>
            <EmptyState
              title={`No ${closetLabel[category]} in ${sizeModeLabel}`}
              subtitle="Add your first item for this category."
              actionLabel={`Add ${closetLabel[category]}`}
              onActionPress={addCategoryFromSnapshot}
            />
          </View>
        ) : (
          <View style={styles.grid}>
            {gridItems.map((item) => {
              return (
                <CategoryGridCard
                  key={item.id}
                  itemId={item.id}
                  title={item.title}
                  size={item.size}
                  uri={getItemDisplayImageUri(item)}
                  onPress={openItemDetail}
                />
              );
            })}
          </View>
        )}
      </Card>

      <Card>
        <Pressable onPress={() => setShowInsights((prev) => !prev)} style={styles.sectionToggle}>
          <Text style={[styles.sectionToggleText, { fontFamily: theme.fonts.serif }]}>Insights {showInsights ? 'Hide' : 'Show'}</Text>
        </Pressable>
        {showInsights ? (
          <View style={styles.sectionContent}>
            {child.currentSize.code ? <Text style={styles.meta}>Current Size (Profile): {formatSizeDisplay(child.currentSize.code, child.currentSize.otherText ?? null)}</Text> : null}
            {brandFilter !== 'All' ? <Text style={styles.meta}>Brand Filter: {brandFilter}</Text> : null}
            {season ? <Text style={styles.meta}>Season: {season}</Text> : null}
            <Text style={styles.meta}>Current Size Count ({summary.currentSize}): {summary.currentCount}</Text>
            <Text style={styles.meta}>Size-Ups Count: {summary.sizeUpsCount}</Text>
            <Text style={styles.meta}>Duplicates: {summary.duplicates}</Text>
            <Text style={styles.meta}>Most Worn: {summary.mostWorn?.title ?? 'N/A'}</Text>
            <Text style={styles.meta}>Least Worn: {summary.leastWorn?.title ?? 'N/A'}</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Pressable onPress={() => setShowSizeUps((prev) => !prev)} style={styles.sectionToggle}>
          <Text style={[styles.sectionToggleText, { fontFamily: theme.fonts.serif }]}>Size Ups {showSizeUps ? 'Hide' : 'Show'}</Text>
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
            Duplicates ({printDuplicateGroups.length}) {showPrintDuplicates ? 'Hide' : 'Show'}
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
    gap: 8,
    marginTop: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
    columnGap: 10,
    marginTop: 14,
  },
  gridCard: {
    width: '48.5%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#EAE1D8',
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  gridImage: {
    width: '100%',
    aspectRatio: 1.08,
    borderRadius: 12,
    backgroundColor: '#F4EEE8',
  },
  gridTextWrap: {
    gap: 2,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  gridTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F1A17',
  },
  gridMeta: {
    fontSize: 11,
    color: '#716A63',
    fontWeight: '600',
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
