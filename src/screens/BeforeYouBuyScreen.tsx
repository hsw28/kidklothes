import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClothingType } from '@/models';
import { ClosetStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme';
import { getSpecialLocationIds, topBrands } from '@/utils/closetViewInsights';
import { isAdvancedUnlocked } from '@/utils/featureUnlock';
import { getChildItems, getDuplicateAdjacentGroups, getSizeUpCounts, getWearingNowByCategory, sizeToNumber } from '@/utils/fitInsights';
import { formatSizeDisplay } from '@/utils/sizes';
import { formatItemCategoryLabel } from '@/utils/itemLabels';

type Props = NativeStackScreenProps<ClosetStackParamList, 'BeforeYouBuy'>;

type QuickChip = { label: string; type: ClothingType };
const quickChips: QuickChip[] = [
  { label: 'Pants', type: 'bottom' },
  { label: 'Tops', type: 'top' },
  { label: 'PJs', type: 'sleeper' },
  { label: 'Outerwear', type: 'outerwear' },
  { label: 'Shoes', type: 'shoes' },
];
const sizeCheckTypeOptions = quickChips.map((chip) => ({ label: chip.label, value: chip.type }));

const sizeChoices = ['2T', '3T', '4T', '5T', '6T'];
const normalize = (value: string) => value.toLowerCase().trim();

export const BeforeYouBuyScreen: React.FC<Props> = ({ route, navigation }) => {
  const { children, items, childItems, storageLocations, settings, updateSettings, archiveItems, logEvent } = useData();
  const [childId, setChildId] = useState(route.params?.childId ?? settings.lastShoppingChildId ?? children[0]?.id ?? '');
  const [brandId, setBrandId] = useState<string>('All');
  const [binType, setBinType] = useState<ClothingType>(settings.lastShoppingType ?? 'bottom');
  const [binSize, setBinSize] = useState<string>('3T');
  const [showLocationCounts, setShowLocationCounts] = useState(false);
  const advancedUnlocked = isAdvancedUnlocked(settings, children, childItems, items);
  const showLocationUi = advancedUnlocked || storageLocations.length > 0;
  const theme = useAppTheme();

  const selectedChild = children.find((child) => child.id === childId);

  const styles = StyleSheet.create({
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 14,
    },
    mixedSizesHint: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
      opacity: 0.9,
    },
    section: {
      fontSize: 18,
      fontWeight: '500',
      color: theme.colors.textPrimary,
    },
    meta: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    pillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    locationPill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    locationPillText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.accentPeriwinkle,
    },
    quickChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.chipBg,
    },
    quickChipText: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    binPrompt: {
      color: theme.colors.textPrimary,
      fontWeight: '600',
      marginTop: 8,
      fontSize: 14,
    },
    binResult: {
      color: theme.colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    recentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    thumb: {
      width: 46,
      height: 46,
      borderRadius: 10,
      backgroundColor: theme.colors.chipBg,
    },
    thumbPlaceholder: {
      width: 46,
      height: 46,
      borderRadius: 10,
      backgroundColor: theme.colors.chipBg,
    },
    recentTitle: {
      fontSize: 14,
      color: theme.colors.textPrimary,
      fontWeight: '600',
    },
    undoBtn: {
      backgroundColor: theme.colors.chipBg,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    undoText: {
      color: theme.colors.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    headerAction: {
      color: theme.colors.accentPeriwinkle,
      fontSize: 14,
      fontWeight: '700',
    },
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('DropPrep', { childId: childId || undefined })}>
          <Text style={styles.headerAction}>Drop Prep</Text>
        </Pressable>
      ),
    });
  }, [navigation, childId, theme.colors.accentPeriwinkle]);

  useEffect(() => {
    logEvent('shopping_mode_open', { childId: childId || null });
    logEvent('before_you_buy_used', { childId: childId || null, action: 'open' });
  }, []);

  useEffect(() => {
    if (!childId && children[0]?.id) setChildId(children[0].id);
  }, [childId, children]);

  const summary = useMemo(() => {
    if (!selectedChild) return undefined;
    const matchesBrand = (brandValue?: string, brandTags: string[] = []) => {
      if (brandId === 'All') return true;
      if (brandTags.includes(brandId)) return true;
      return normalize(brandValue ?? '') === normalize(brandId);
    };
    const childData = getChildItems(selectedChild, items, childItems);
    const brandFiltered = childData.items.filter((item) => matchesBrand(item.brand, item.brandTags));
    const owned = brandFiltered.filter((item) => item.status === 'owned');
    const wearingNow = getWearingNowByCategory(owned, selectedChild);
    const sizeUps = getSizeUpCounts(owned, wearingNow, selectedChild);
    const duplicates = getDuplicateAdjacentGroups(brandFiltered);
    return { childData, brandFiltered, owned, wearingNow, sizeUps, duplicates };
  }, [selectedChild, items, childItems, brandId]);

  const brandOptions = useMemo(() => {
    if (!selectedChild || !advancedUnlocked) return ['All'];
    return ['All', ...topBrands(selectedChild.id, 'both', items, childItems, 5, selectedChild)];
  }, [selectedChild, advancedUnlocked, items, childItems]);

  const recentToday = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const scoped = items
      .filter((item) => item.createdAt >= start)
      .filter((item) => (!childId ? true : item.childIds.includes(childId)))
      .filter((item) =>
        brandId === 'All'
          ? true
          : item.brandTags.includes(brandId) || (item.brand ?? '').toLowerCase().trim() === brandId.toLowerCase().trim(),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
    return scoped;
  }, [items, childId, brandId]);

  const sizeUpBinCount = useMemo(() => {
    if (!summary) return 0;
    return summary.owned.filter((item) => item.clothingType === binType && item.size.toUpperCase().trim() === binSize.toUpperCase().trim()).length;
  }, [summary, binType, binSize]);

  const sizeUpNearCount = useMemo(() => {
    if (!summary) return 0;
    const target = sizeToNumber(binSize);
    if (target === undefined) return 0;
    return summary.owned.filter((item) => {
      if (item.clothingType !== binType) return false;
      const n = sizeToNumber(item.size);
      return n !== undefined && Math.abs(n - target) <= 8;
    }).length;
  }, [summary, binType, binSize]);

  const countsByLocation = useMemo(() => {
    if (!summary || !selectedChild) return [];
    const childLinkRows = childItems.filter((link) => link.childId === selectedChild.id);
    const locationIdByItem = new Map(childLinkRows.map((link) => [link.itemId, link.storageLocationId ?? '']));
    const locationNameById = new Map(
      storageLocations
        .filter((location) => !location.childId || location.childId === selectedChild.id)
        .map((location) => [location.id, location.name]),
    );
    const counts = new Map<string, number>();
    summary.owned.forEach((item) => {
      const locationId = locationIdByItem.get(item.id) ?? '';
      const name = locationId ? (locationNameById.get(locationId) ?? 'Unknown') : 'Unassigned';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [summary, selectedChild, childItems, storageLocations]);

  const specialBinPills = useMemo(() => {
    if (!summary || !selectedChild) {
      return {
        nextSizeCount: 0,
        nextSizeLocationId: undefined as string | undefined,
        sellCount: 0,
        sellLocationId: undefined as string | undefined,
      };
    }

    const { sizeUpLocationId, sellBinLocationId } = getSpecialLocationIds(selectedChild.id, storageLocations);
    const linksForChild = childItems.filter((link) => link.childId === selectedChild.id);
    const itemIdToLink = new Map(linksForChild.map((link) => [link.itemId, link]));
    const visibleItems = summary.brandFiltered;

    const nextSizeFallbackCount = Array.from(summary.sizeUps.values()).reduce((sum, count) => sum + count, 0);
    const nextSizeLocationCount = sizeUpLocationId
      ? visibleItems.filter((item) => itemIdToLink.get(item.id)?.storageLocationId === sizeUpLocationId).length
      : 0;
    const nextSizeCount = sizeUpLocationId ? nextSizeLocationCount : nextSizeFallbackCount;

    const sellLocationCount = sellBinLocationId
      ? visibleItems.filter((item) => itemIdToLink.get(item.id)?.storageLocationId === sellBinLocationId).length
      : 0;
    const sellFallbackCount = visibleItems.filter((item) => (itemIdToLink.get(item.id)?.statusForChild ?? item.status) === 'for-sale').length;
    const sellCount = sellBinLocationId ? sellLocationCount : sellFallbackCount;

    return {
      nextSizeCount,
      nextSizeLocationId: sizeUpLocationId,
      sellCount,
      sellLocationId: sellBinLocationId,
    };
  }, [summary, selectedChild, storageLocations, childItems]);

  const handleQuickAdd = async (type: ClothingType) => {
    await updateSettings({ lastShoppingType: type, lastShoppingChildId: childId || undefined });
    await logEvent('before_you_buy_used', { childId: childId || null, action: 'quick_add', type, brandId: brandId === 'All' ? null : brandId });
    navigation.navigate('AddItem', { quick: true, prefillType: type, prefillBrand: brandId === 'All' ? undefined : brandId, shoppingMode: true });
  };

  const handleUndo = async (itemId: string) => {
    await archiveItems([itemId]);
    await logEvent('before_you_buy_used', { childId: childId || null, action: 'undo_recent_addition', itemId });
    Alert.alert('Undone', 'Recent item was archived.');
  };

  if (children.length === 0) {
    return (
      <Screen>
        <EmptyState title="No child yet" subtitle="Add a child first to run a shopping check." />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Going Shopping?</Text>
        <Text style={styles.subtitle}>Use this quick loop to avoid duplicates and overbuying.</Text>
        {selectedChild?.currentSize?.code ? (
          <Text style={styles.subtitle}>
            Wearing now: {formatSizeDisplay(selectedChild.currentSize.code, selectedChild.currentSize.otherText ?? null)}
            {selectedChild.nextSize?.code || selectedChild.currentSize?.code
              ? ` • Next: ${formatSizeDisplay(selectedChild.nextSize?.code ?? null, selectedChild.nextSize?.otherText ?? null) || 'Auto'}`
              : ''}
          </Text>
        ) : null}
        {selectedChild?.usesMixedSizes ? (
          <Text style={styles.mixedSizesHint}>Mixed sizes is on, so this view combines current and next-size context.</Text>
        ) : null}
      </Card>

      <ChipSelector
        label="Child"
        options={children.map((entry) => entry.name)}
        value={selectedChild?.name}
        onChange={async (name) => {
          const nextId = children.find((entry) => entry.name === name)?.id ?? '';
          setChildId(nextId);
          setBrandId('All');
          await updateSettings({ lastShoppingChildId: nextId || undefined });
        }}
        accent="coral"
      />
      <ChipSelector label="Brand" options={brandOptions} value={brandId} onChange={setBrandId} accent="sage" />

      <Card>
        <Text style={styles.section}>Quick Add</Text>
        <View style={styles.chipsRow}>
          {quickChips.map((chip) => (
            <Pressable key={chip.label} onPress={() => void handleQuickAdd(chip.type)} style={styles.quickChip} accessibilityRole="button" accessibilityLabel={`Quick Add ${chip.label}`}>
              <Text style={styles.quickChipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label="Open Drop Prep" variant="secondary" onPress={() => navigation.navigate('DropPrep', { childId: selectedChild?.id })} />
      </Card>

      {!summary ? (
        <EmptyState title="Pick a child" subtitle="Select a child to load inventory." />
      ) : (
        <>
          <Card>
            <Text style={styles.section}>Current Size Inventory</Text>
            {Array.from(summary.wearingNow.entries()).map(([category, size]) => (
              <Text key={category} style={styles.meta}>
                {category}: {size}
              </Text>
            ))}
          </Card>

          <Card>
            <Text style={styles.section}>Size-Ups Bin</Text>
            {Array.from(summary.sizeUps.entries()).map(([category, count]) => (
              <Text key={category} style={styles.meta}>
                {category}: {count}
              </Text>
            ))}

            <Text style={styles.binPrompt}>Do I already have this?</Text>
            <ChipSelector
              label="Type"
              options={sizeCheckTypeOptions.map((option) => option.label)}
              value={sizeCheckTypeOptions.find((option) => option.value === binType)?.label ?? sizeCheckTypeOptions[0].label}
              onChange={(label) => setBinType(sizeCheckTypeOptions.find((option) => option.label === label)?.value ?? binType)}
            />
            <ChipSelector label="Size" options={sizeChoices} value={binSize} onChange={setBinSize} />
            <Text style={styles.binResult}>{binSize} {binType}: {sizeUpBinCount} items</Text>
            <Text style={styles.meta}>Nearby sizes: {sizeUpNearCount}</Text>
          </Card>

          <Card>
            <Text style={styles.section}>Similar Items Owned</Text>
            <Text style={styles.meta}>Duplicates in adjacent sizes: {summary.duplicates}</Text>
          </Card>

          <Card>
            <Text style={styles.section}>Quick Bins</Text>
            <View style={styles.pillsRow}>
              {specialBinPills.nextSizeCount > 0 ? (
                <Pressable
                  style={styles.locationPill}
                  onPress={() =>
                    navigation.navigate('ItemsList', {
                      initialChildId: childId || undefined,
                      initialSizeBucket: 'next',
                      initialStorageLocationId: specialBinPills.nextSizeLocationId,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Next-size bin, ${specialBinPills.nextSizeCount} items`}
                >
                  <Text style={styles.locationPillText}>Next-size bin: {specialBinPills.nextSizeCount}</Text>
                </Pressable>
              ) : null}
              {specialBinPills.sellCount > 0 ? (
                <Pressable
                  style={styles.locationPill}
                  onPress={() =>
                    navigation.navigate('ItemsList', {
                      initialChildId: childId || undefined,
                      initialStorageLocationId: specialBinPills.sellLocationId,
                      initialStatus: specialBinPills.sellLocationId ? undefined : 'for-sale',
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Sell bin, ${specialBinPills.sellCount} items`}
                >
                  <Text style={styles.locationPillText}>Sell bin: {specialBinPills.sellCount}</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>

          {showLocationUi ? (
            <Card>
              <Pressable onPress={() => setShowLocationCounts((prev) => !prev)}>
                <Text style={styles.section}>Counts by Location {showLocationCounts ? 'Hide' : 'Show'}</Text>
              </Pressable>
              {showLocationCounts ? (
                countsByLocation.length > 0 ? (
                  countsByLocation.map((entry) => (
                    <Text key={entry.name} style={styles.meta}>
                      {entry.name}: {entry.count}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.meta}>No location counts yet.</Text>
                )
              ) : null}
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <Text style={styles.section}>Recent Additions Today</Text>
        {recentToday.length === 0 ? <Text style={styles.meta}>No additions yet today.</Text> : null}
        {recentToday.map((item) => (
          <View key={item.id} style={styles.recentRow}>
            {item.cachedImageUri || item.imageUrls[0] || item.imageUrl ? (
              <Image source={{ uri: item.cachedImageUri || item.imageUrls[0] || item.imageUrl }} style={styles.thumb} />
            ) : (
              <View style={styles.thumbPlaceholder} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.recentTitle}>{item.title}</Text>
              <Text style={styles.meta}>{item.size || 'N/A'} • {formatItemCategoryLabel(item)}</Text>
            </View>
            <Pressable onPress={() => void handleUndo(item.id)} style={styles.undoBtn} accessibilityRole="button" accessibilityLabel={`Undo recent addition ${item.title}`}>
              <Text style={styles.undoText}>Undo</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      <PrimaryButton
        label="Done Shopping Check"
        variant="secondary"
        onPress={async () => {
          await logEvent('before_you_buy_used', { childId: childId || null, action: 'complete' });
          navigation.goBack();
        }}
      />
    </Screen>
  );
};
