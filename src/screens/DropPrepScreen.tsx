import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { UpsellModal } from '@/components/UpsellModal';
import { appConfig } from '@/config';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { hasProAccess } from '@/services/proAccess';
import { useAppTheme } from '@/theme';
import { categoryCounts, getOwnedItemsForChild, getVisibleClosetCategories, topBrands } from '@/utils/closetViewInsights';
import { closetCategories, closetCategoryToClothingType, closetLabel } from '@/utils/categories';
import { getDropPrepSummary } from '@/utils/dropPrepInsights';
import { isAdvancedUnlocked } from '@/utils/featureUnlock';
import { formatPieceCount } from '@/utils/formatCounts';
import { normalizePrintName } from '@/utils/printName';
import { normalizeStyleName } from '@/utils/styleName';

type Props = NativeStackScreenProps<ClosetStackParamList, 'DropPrep'>;

export const DropPrepScreen: React.FC<Props> = ({ route, navigation }) => {
  const { children, childItems, items, storageLocations, settings, purchaseState, logEvent, getEventCount, updateSettings } = useData();
  const defaultChildId = route.params?.childId ?? settings.lastShoppingChildId ?? children[0]?.id;
  const [childId, setChildId] = useState(defaultChildId ?? '');
  const [sizeBucket, setSizeBucket] = useState<'now' | 'next' | 'both'>('now');
  const [brandId, setBrandId] = useState<string>('All');
  const [dropName, setDropName] = useState('');
  const [showUpsell, setShowUpsell] = useState(false);
  const [showDupPrints, setShowDupPrints] = useState(false);
  const [showDupStyles, setShowDupStyles] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const didLogBrandChangeRef = useRef(false);
  const didLogSizeBucketChangeRef = useRef(false);
  const sizeBucketOverridesRef = useRef<Record<string, 'now' | 'next' | 'both'>>({});
  const lastDefaultedChildRef = useRef<string>('');
  const screenScrollRef = useRef<ScrollView | null>(null);
  const sectionYRef = useRef<{ dupPrints?: number; dupStyles?: number }>({});
  const theme = useAppTheme();

  const selectedChild = children.find((child) => child.id === childId) ?? children[0];
  const advancedUnlocked = isAdvancedUnlocked(settings, children, childItems, items);
  const proAccessEnabled = hasProAccess(settings, purchaseState);
  const brandOptions = useMemo(() => (selectedChild ? ['All', ...topBrands(selectedChild.id, 'both', items, childItems, 5, selectedChild)] : ['All']), [
    selectedChild,
    items,
    childItems,
  ]);

  const summary = useMemo(
    () => (selectedChild ? getDropPrepSummary(selectedChild.id, items, childItems, storageLocations, brandId === 'All' ? undefined : brandId, selectedChild) : undefined),
    [selectedChild, items, childItems, storageLocations, brandId],
  );
  const snapshotCounts = useMemo(
    () =>
      selectedChild
        ? categoryCounts(selectedChild.id, sizeBucket, brandId === 'All' ? undefined : brandId, items, childItems, selectedChild)
        : undefined,
    [selectedChild, sizeBucket, brandId, items, childItems],
  );
  const visibleCategories = useMemo(() => getVisibleClosetCategories(selectedChild), [selectedChild]);
  const ownedForDupes = useMemo(() => {
    if (!selectedChild) return [];
    const normalize = (value: string) => value.toLowerCase().trim();
    const target = brandId === 'All' ? '' : normalize(brandId);
    return getOwnedItemsForChild(selectedChild.id, items, childItems).filter((item) => {
      if (!target) return true;
      if (normalize(item.brand ?? '') === target) return true;
      return item.brandTags.some((tag) => normalize(tag) === target);
    });
  }, [selectedChild, items, childItems, brandId]);
  const duplicatePrintGroups = useMemo(() => {
    const groups = new Map<string, { printName: string; sizes: Set<string>; count: number; itemIds: Set<string>; sizeCounts: Record<string, number> }>();
    ownedForDupes
      .filter((item) => item.printNameNorm || item.printName?.trim())
      .forEach((item) => {
        const key = item.printNameNorm || normalizePrintName(item.printName ?? '');
        if (!key) return;
        const sizeLabel = (item.size || '').trim() || 'N/A';
        const prev = groups.get(key) ?? { printName: item.printName?.trim() || key, sizes: new Set<string>(), count: 0, itemIds: new Set<string>(), sizeCounts: {} };
        prev.sizes.add(item.size);
        prev.count += 1;
        prev.itemIds.add(item.id);
        prev.sizeCounts[sizeLabel] = (prev.sizeCounts[sizeLabel] ?? 0) + 1;
        groups.set(key, prev);
      });
    return Array.from(groups.values())
      .filter((entry) => entry.count > 1)
      .sort((a, b) => b.count - a.count)
      .map((entry) => ({
        printName: entry.printName,
        sizes: Array.from(entry.sizes),
        count: entry.count,
        itemIds: Array.from(entry.itemIds),
        sizeCounts: entry.sizeCounts,
      }));
  }, [ownedForDupes]);
  const duplicateStyleGroups = useMemo(() => {
    const normalize = (value: string) => value.toLowerCase().trim();
    const groups = new Map<string, { label: string; brand?: string; sizes: Set<string>; count: number; itemIds: Set<string>; sizeCounts: Record<string, number> }>();
    ownedForDupes.forEach((item) => {
      const styleLabel = (item.styleName || item.title || '').trim();
      if (!styleLabel) return;
      const styleKey = normalizeStyleName(styleLabel);
      if (!styleKey) return;
      const brandLabel = (item.brand || item.brandTags[0] || '').trim();
      const key = `${styleKey}|${normalize(brandLabel)}|${item.clothingType}`;
      const sizeLabel = (item.size || '').trim() || 'N/A';
      const prev = groups.get(key) ?? { label: styleLabel, brand: brandLabel || undefined, sizes: new Set<string>(), count: 0, itemIds: new Set<string>(), sizeCounts: {} };
      prev.sizes.add(item.size);
      prev.count += 1;
      prev.itemIds.add(item.id);
      prev.sizeCounts[sizeLabel] = (prev.sizeCounts[sizeLabel] ?? 0) + 1;
      groups.set(key, prev);
    });
    return Array.from(groups.values())
      .filter((entry) => entry.count > 1)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .map((entry) => ({
        label: entry.label,
        brand: entry.brand,
        sizes: Array.from(entry.sizes),
        count: entry.count,
        itemIds: Array.from(entry.itemIds),
        sizeCounts: entry.sizeCounts,
      }));
  }, [ownedForDupes]);

  useEffect(() => {
    if (!selectedChild) return;
    const override = sizeBucketOverridesRef.current[selectedChild.id];
    const defaultBucket: 'now' | 'next' | 'both' = selectedChild.usesMixedSizes ? 'both' : 'now';
    if (override) {
      if (sizeBucket !== override) setSizeBucket(override);
      lastDefaultedChildRef.current = selectedChild.id;
      return;
    }
    if (lastDefaultedChildRef.current !== selectedChild.id || sizeBucket !== defaultBucket) {
      setSizeBucket(defaultBucket);
      lastDefaultedChildRef.current = selectedChild.id;
    }
  }, [selectedChild?.id, selectedChild?.usesMixedSizes]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        const now = Date.now();
        await logEvent('drop_prep_viewed', { childId: selectedChild?.id ?? null, brandId: brandId === 'All' ? null : brandId });
        await logEvent('drop_prep_opened', { childId: selectedChild?.id ?? null, brandId: brandId === 'All' ? null : brandId });
        const count = await getEventCount('drop_prep_viewed', now - 14 * 24 * 60 * 60 * 1000);
        if (!active) return;
        setUsageCount(count);
        if (!appConfig.monetizationEnabled) return;
        const shownRecently = Boolean(settings.lastUpsellShownAt && now - settings.lastUpsellShownAt < 24 * 60 * 60 * 1000);
        if (count >= appConfig.upsellTriggerCount && !proAccessEnabled && !shownRecently) {
          await updateSettings({ lastUpsellShownAt: now });
          await logEvent('upsell_shown', {
            context: 'drop_prep',
            count,
            threshold: appConfig.upsellTriggerCount,
          });
          if (active) setShowUpsell(true);
        }
      };
      void run();
      return () => {
        active = false;
      };
    }, [brandId, getEventCount, logEvent, proAccessEnabled, selectedChild?.id, settings.lastUpsellShownAt, updateSettings]),
  );

  useEffect(() => {
    if (!selectedChild) return;
    if (!didLogBrandChangeRef.current) {
      didLogBrandChangeRef.current = true;
      return;
    }
    void logEvent('drop_prep_brand_filter_changed', { childId: selectedChild.id, brandId: brandId === 'All' ? null : brandId });
  }, [brandId, selectedChild?.id]);

  useEffect(() => {
    if (!selectedChild) return;
    if (!didLogSizeBucketChangeRef.current) {
      didLogSizeBucketChangeRef.current = true;
      return;
    }
    void logEvent('drop_prep_size_bucket_changed', { childId: selectedChild.id, sizeBucket });
  }, [sizeBucket, selectedChild?.id]);

  const jumpToDupSection = useCallback((section: 'prints' | 'styles') => {
    if (section === 'prints') setShowDupPrints(true);
    if (section === 'styles') setShowDupStyles(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const y = section === 'prints' ? sectionYRef.current.dupPrints : sectionYRef.current.dupStyles;
        if (typeof y !== 'number') return;
        screenScrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      });
    });
  }, []);

  const styles = StyleSheet.create({
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    manageBrands: {
      fontSize: 13,
      color: theme.colors.accentPeriwinkle,
      fontWeight: '700',
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 12,
    },
    summaryCard: {
      width: '48%',
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.colors.card,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
      gap: 6,
    },
    summaryLabel: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontWeight: '500',
    },
    summaryValue: {
      fontSize: 20,
      color: theme.colors.textPrimary,
      fontWeight: '600',
    },
    categoryCard: {
      borderRadius: 18,
      padding: 16,
      backgroundColor: theme.colors.card,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
      gap: 10,
    },
    categoryTitle: {
      fontSize: 18,
      fontWeight: '500',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    metricRow: {
      flexDirection: 'row',
      gap: 10,
    },
    metricPill: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: theme.colors.chipBg,
    },
    nowPill: {
      backgroundColor: theme.colors.accentCoralSoft,
    },
    nextPill: {
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    metricText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    tileGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 12,
    },
    tile: {
      width: '48%',
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.colors.card,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
      gap: 6,
    },
    tileLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    tileCount: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    sectionToggle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    meta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    sectionContent: {
      marginTop: 8,
      gap: 6,
    },
    duplicateLinkRow: {
      minHeight: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    duplicateLinkText: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.textPrimary,
      fontWeight: '600',
    },
    duplicateLinkChevron: {
      fontSize: 14,
      color: theme.colors.accentPeriwinkle,
      fontWeight: '700',
    },
  });

  if (!selectedChild || !summary) {
    return (
      <Screen>
        <EmptyState title="No child selected" subtitle="Add a child to use Drop Prep." />
      </Screen>
    );
  }

  return (
    <Screen scrollRef={screenScrollRef}>
      <Card>
        <Text style={styles.title}>Drop Prep</Text>
        <FormInput label="Preparing for (optional)" value={dropName} onChangeText={setDropName} placeholder="Saturday drop" />
        <ChipSelector
          label="Child"
          options={children.map((child) => child.name)}
          value={selectedChild.name}
          onChange={(name) => {
            const id = children.find((child) => child.name === name)?.id ?? selectedChild.id;
            setChildId(id);
            setBrandId('All');
          }}
          accent="coral"
        />
        <ChipSelector
          label="Size Bucket"
          options={['Now', 'Next', 'Both']}
          value={sizeBucket === 'now' ? 'Now' : sizeBucket === 'next' ? 'Next' : 'Both'}
          onChange={(value) => {
            const nextBucket = value.toLowerCase() as 'now' | 'next' | 'both';
            setSizeBucket(nextBucket);
            if (selectedChild?.id) sizeBucketOverridesRef.current[selectedChild.id] = nextBucket;
          }}
        />
        {advancedUnlocked ? <ChipSelector label="Brand Mode" options={brandOptions} value={brandId} onChange={setBrandId} accent="sage" /> : null}
        {advancedUnlocked ? (
          <Pressable onPress={() => navigation.navigate('BrandSnapshot', { childId: selectedChild.id })} accessibilityRole="button" accessibilityLabel="Manage brands">
            <Text style={styles.manageBrands}>More Brands</Text>
          </Pressable>
        ) : null}
      </Card>

      <View style={styles.summaryGrid}>
        <Pressable
          style={styles.summaryCard}
          onPress={() =>
            navigation.navigate('ItemsList', {
              hideInbox: true,
              initialChildId: selectedChild.id,
              initialStatus: 'owned',
              initialBrandId: brandId === 'All' ? undefined : brandId,
              initialSizeBucket: 'next',
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Size-Ups Owned, ${summary.sizeUpsTotal}`}
        >
          <Text style={styles.summaryLabel}>Size-Ups Owned</Text>
          <Text style={styles.summaryValue}>{summary.sizeUpsTotal}</Text>
        </Pressable>
        <Pressable onPress={() => jumpToDupSection('prints')} style={styles.summaryCard} accessibilityRole="button" accessibilityLabel={`Print Duplicates, ${duplicatePrintGroups.length}. Jump to duplicate prints section`}>
          <Text style={styles.summaryLabel}>Print Duplicates</Text>
          <Text style={styles.summaryValue}>{duplicatePrintGroups.length}</Text>
        </Pressable>
        <Pressable onPress={() => jumpToDupSection('styles')} style={styles.summaryCard} accessibilityRole="button" accessibilityLabel={`Style Duplicates, ${duplicateStyleGroups.length}. Jump to duplicate styles section`}>
          <Text style={styles.summaryLabel}>Style Duplicates</Text>
          <Text style={styles.summaryValue}>{duplicateStyleGroups.length}</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('SellBin')} style={styles.summaryCard} accessibilityRole="button" accessibilityLabel={`For-Sale Bin, ${summary.forSaleCount}`}>
          <Text style={styles.summaryLabel}>For-Sale Bin</Text>
          <Text style={styles.summaryValue}>{summary.forSaleCount}</Text>
        </Pressable>
      </View>

      <Card>
        <Text style={styles.categoryTitle}>Snapshot</Text>
        <View style={styles.tileGrid}>
          {visibleCategories.map((category) => {
            const count = snapshotCounts?.[category] ?? 0;
            return (
              <Pressable
                key={category}
                style={styles.tile}
                onPress={() =>
                  navigation.navigate('ItemsList', {
                    hideInbox: true,
                    initialChildId: selectedChild.id,
                    initialStatus: 'owned',
                    initialCategory: category,
                    initialClothingType: closetCategoryToClothingType(category) as any,
                    initialBrandId: brandId === 'All' ? undefined : brandId,
                    initialSizeBucket: sizeBucket === 'both' ? 'All' : sizeBucket,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`${closetLabel[category]}, ${formatPieceCount(count)}`}
              >
                <Text style={styles.tileLabel}>{closetLabel[category]}</Text>
                <Text style={styles.tileCount}>{formatPieceCount(count)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View
        onLayout={(event) => {
          sectionYRef.current.dupPrints = event.nativeEvent.layout.y;
        }}
      >
        <Card>
          <Pressable onPress={() => setShowDupPrints((prev) => !prev)} accessibilityRole="button" accessibilityLabel="Toggle duplicate prints across sizes">
            <Text style={styles.sectionToggle}>Duplicate prints across sizes {showDupPrints ? '▾' : '▸'}</Text>
          </Pressable>
          {showDupPrints ? (
            <View style={styles.sectionContent}>
              {duplicatePrintGroups.length ? (
                duplicatePrintGroups.map((group) => (
                  <Pressable
                    key={`${group.printName}-${group.sizes.join('|')}`}
                    onPress={() =>
                      navigation.navigate('ItemsList', {
                        hideInbox: true,
                        initialChildId: selectedChild.id,
                        initialStatus: 'owned',
                        initialBrandId: brandId === 'All' ? undefined : brandId,
                        initialItemIds: group.itemIds,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Open duplicate print group ${group.printName}`}
                    style={({ pressed }) => [
                      styles.duplicateLinkRow,
                      pressed ? { opacity: 0.9 } : null,
                    ]}
                  >
                    <Text style={styles.duplicateLinkText}>
                      {group.printName}: {group.sizes.map((size) => `${size} (${group.sizeCounts[(size || '').trim() || 'N/A'] ?? 0})`).join(', ')}
                    </Text>
                    <Text style={styles.duplicateLinkChevron}>›</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.meta}>No duplicate print groups yet.</Text>
              )}
            </View>
          ) : null}
        </Card>
      </View>

      <View
        onLayout={(event) => {
          sectionYRef.current.dupStyles = event.nativeEvent.layout.y;
        }}
      >
        <Card>
          <Pressable onPress={() => setShowDupStyles((prev) => !prev)} accessibilityRole="button" accessibilityLabel="Toggle duplicate styles across sizes">
            <Text style={styles.sectionToggle}>Duplicate styles across sizes {showDupStyles ? '▾' : '▸'}</Text>
          </Pressable>
          {showDupStyles ? (
            <View style={styles.sectionContent}>
              {duplicateStyleGroups.length ? (
                duplicateStyleGroups.map((group) => (
                  <Pressable
                    key={`${group.brand ?? ''}|${group.label}|${group.sizes.join('|')}`}
                    onPress={() =>
                      navigation.navigate('ItemsList', {
                        hideInbox: true,
                        initialChildId: selectedChild.id,
                        initialStatus: 'owned',
                        initialBrandId: brandId === 'All' ? undefined : brandId,
                        initialItemIds: group.itemIds,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Open duplicate style group ${group.label}`}
                    style={({ pressed }) => [
                      styles.duplicateLinkRow,
                      pressed ? { opacity: 0.9 } : null,
                    ]}
                  >
                    <Text style={styles.duplicateLinkText}>
                      {group.brand ? `${group.brand} • ` : ''}{group.label}: {group.sizes.map((size) => `${size} (${group.sizeCounts[(size || '').trim() || 'N/A'] ?? 0})`).join(', ')}
                    </Text>
                    <Text style={styles.duplicateLinkChevron}>›</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.meta}>No duplicate style groups yet.</Text>
              )}
            </View>
          ) : null}
        </Card>
      </View>

      <Card>
        <Text style={styles.categoryTitle}>Quick Actions</Text>
        <PrimaryButton
          label="Quick Add to Wishlist"
          variant="secondary"
          onPress={async () => {
            await updateSettings({ lastShoppingChildId: selectedChild.id });
            await logEvent('drop_prep_quick_add_clicked', { childId: selectedChild.id, status: 'wishlist', brandId: brandId === 'All' ? null : brandId });
            navigation.navigate('AddItem', { quick: true, shoppingMode: true, prefillBrand: brandId === 'All' ? undefined : brandId, prefillStatus: 'wishlist' });
          }}
        />
        <PrimaryButton
          label="Quick Add Owned"
          variant="secondary"
          onPress={async () => {
            await updateSettings({ lastShoppingChildId: selectedChild.id });
            await logEvent('drop_prep_quick_add_clicked', { childId: selectedChild.id, status: 'owned', brandId: brandId === 'All' ? null : brandId });
            navigation.navigate('AddItem', { quick: true, shoppingMode: true, prefillBrand: brandId === 'All' ? undefined : brandId, prefillStatus: 'owned' });
          }}
        />
      </Card>

      <PrimaryButton label="Before You Buy" onPress={() => navigation.navigate('BeforeYouBuy', { childId: selectedChild.id })} />
      <UpsellModal visible={showUpsell} context="drop_prep" usageCount={usageCount} onClose={() => setShowUpsell(false)} />
    </Screen>
  );
};
