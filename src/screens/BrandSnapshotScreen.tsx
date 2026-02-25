import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { FormInput } from '@/components/FormInput';
import { Screen } from '@/components/Screen';
import { UpsellModal } from '@/components/UpsellModal';
import { appConfig } from '@/config';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme';
import { categoryCounts, getDuplicatePrintGroups, getVisibleClosetCategories, topBrands } from '@/utils/closetViewInsights';
import { ClosetCategory, closetCategories, closetCategoryToClothingType, closetLabel } from '@/utils/categories';
import { ClosetSizeMode } from '@/utils/closetViewInsights';
import { formatItemCategoryLabel } from '@/utils/itemLabels';
import { isAdvancedUnlocked } from '@/utils/featureUnlock';

type Props = NativeStackScreenProps<ClosetStackParamList, 'BrandSnapshot'>;

export const BrandSnapshotScreen: React.FC<Props> = ({ navigation, route }) => {
  const { children, items, childItems, settings, purchaseState, logEvent, getEventCount, updateSettings } = useData();
  const defaultChild = route.params?.childId ?? settings.lastShoppingChildId ?? children[0]?.id;
  const [childId, setChildId] = useState(defaultChild ?? '');
  const [sizeMode, setSizeMode] = useState<ClosetSizeMode>('both');
  const [brandSearch, setBrandSearch] = useState('');
  const [brandId, setBrandId] = useState('All');
  const [showDupes, setShowDupes] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const advancedUnlocked = isAdvancedUnlocked(settings, children, childItems, items);
  const theme = useAppTheme();

  const selectedChild = children.find((child) => child.id === childId) ?? children[0];

  const allBrands = useMemo(() => {
    if (!selectedChild) return [];
    const set = new Set<string>();
    items
      .filter((item) => item.childIds.includes(selectedChild.id))
      .forEach((item) => {
        if (item.brand?.trim()) set.add(item.brand.trim());
        item.brandTags.forEach((tag) => tag.trim() && set.add(tag.trim()));
      });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [selectedChild, items]);

  const brandList = useMemo(() => {
    const q = brandSearch.toLowerCase().trim();
    if (!q) return allBrands;
    return allBrands.filter((brand) => brand.toLowerCase().includes(q));
  }, [allBrands, brandSearch]);

  const topBrandChips = useMemo(() => {
    if (!selectedChild) return ['All'];
    return ['All', ...topBrands(selectedChild.id, sizeMode, items, childItems, 5, selectedChild)];
  }, [selectedChild, sizeMode, items, childItems]);

  const nowCounts = useMemo(
    () => (selectedChild ? categoryCounts(selectedChild.id, 'now', brandId === 'All' ? undefined : brandId, items, childItems, selectedChild) : undefined),
    [selectedChild, brandId, items, childItems],
  );
  const nextCounts = useMemo(
    () => (selectedChild ? categoryCounts(selectedChild.id, 'next', brandId === 'All' ? undefined : brandId, items, childItems, selectedChild) : undefined),
    [selectedChild, brandId, items, childItems],
  );
  const bothCounts = useMemo(
    () => (selectedChild ? categoryCounts(selectedChild.id, 'both', brandId === 'All' ? undefined : brandId, items, childItems, selectedChild) : undefined),
    [selectedChild, brandId, items, childItems],
  );

  const recentItems = useMemo(() => {
    if (!selectedChild) return [];
    return items
      .filter((item) => item.childIds.includes(selectedChild.id) && item.status === 'owned')
      .filter((item) => (brandId === 'All' ? true : item.brandTags.includes(brandId) || (item.brand ?? '').toLowerCase().trim() === brandId.toLowerCase().trim()))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 8);
  }, [selectedChild, items, brandId]);

  const printDupes = useMemo(() => {
    if (!selectedChild || brandId === 'All') return [];
    return getDuplicatePrintGroups(selectedChild.id, items, childItems, 30).filter((group) =>
      items.some((item) => item.childIds.includes(selectedChild.id) && (item.brandTags.includes(brandId) || (item.brand ?? '').toLowerCase().trim() === brandId.toLowerCase().trim()) && (item.printName ?? '').toLowerCase().trim() === group.printName.toLowerCase().trim()),
    );
  }, [selectedChild, brandId, items, childItems]);
  const visibleCategories = useMemo(() => getVisibleClosetCategories(selectedChild), [selectedChild]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        const now = Date.now();
        await logEvent('brand_snapshot_viewed', { childId: selectedChild?.id ?? null, brandId: brandId === 'All' ? null : brandId });
        const count = await getEventCount('brand_snapshot_viewed', now - 14 * 24 * 60 * 60 * 1000);
        if (!active) return;
        setUsageCount(count);
        if (!appConfig.monetizationEnabled) return;
        const shownRecently = Boolean(settings.lastUpsellShownAt && now - settings.lastUpsellShownAt < 24 * 60 * 60 * 1000);
        if (count >= appConfig.upsellTriggerCount && !purchaseState?.isEntitled && !shownRecently) {
          await updateSettings({ lastUpsellShownAt: now });
          await logEvent('upsell_shown', {
            context: 'brand_snapshot',
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
    }, [brandId, getEventCount, logEvent, purchaseState?.isEntitled, selectedChild?.id, settings.lastUpsellShownAt, updateSettings]),
  );

  if (!selectedChild || !nowCounts || !nextCounts || !bothCounts) {
    return (
      <Screen>
        <EmptyState title="No data yet" subtitle="Add a child and some items first." />
      </Screen>
    );
  }

  const activeCounts = sizeMode === 'now' ? nowCounts : sizeMode === 'next' ? nextCounts : bothCounts;
  const styles = StyleSheet.create({
    sectionTitle: {
      fontSize: 18,
      fontWeight: '500',
      color: theme.colors.textPrimary,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    label: {
      fontSize: 16,
      color: theme.colors.textPrimary,
    },
    count: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    meta: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    metaActive: {
      color: theme.colors.textPrimary,
      fontWeight: '700',
    },
    recentWrap: {
      gap: 10,
    },
    recentItem: {
      borderRadius: 14,
      padding: 10,
      backgroundColor: theme.colors.chipBg,
    },
    recentTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
  });

  return (
    <Screen>
      <Card>
        <ChipSelector
          label="Child"
          options={children.map((child) => child.name)}
          value={selectedChild.name}
          onChange={(name) => {
            const nextId = children.find((child) => child.name === name)?.id ?? selectedChild.id;
            setChildId(nextId);
            setBrandId('All');
          }}
        />
        <ChipSelector label="Size range" options={['Now', 'Next', 'Both']} value={sizeMode === 'now' ? 'Now' : sizeMode === 'next' ? 'Next' : 'Both'} onChange={(value) => setSizeMode(value.toLowerCase() as ClosetSizeMode)} accent="coral" />
        {advancedUnlocked ? <ChipSelector label="Top brands" options={topBrandChips} value={brandId} onChange={setBrandId} accent="sage" /> : <ChipSelector label="Brand" options={['All']} value="All" onChange={() => setBrandId('All')} />}
        {advancedUnlocked ? <FormInput label="Brand search" value={brandSearch} onChangeText={setBrandSearch} placeholder="Search brand..." autoCapitalize="none" /> : null}
      </Card>

      {advancedUnlocked ? (
        <Card>
          <Text style={styles.sectionTitle}>Brand list</Text>
          {brandList.slice(0, 20).map((brand) => (
            <Pressable key={brand} onPress={() => setBrandId(brand)}>
              <Text style={[styles.meta, brandId === brand && styles.metaActive]}>{brand}</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>Counts by type</Text>
        {visibleCategories.map((category) => (
          <Pressable
            key={category}
            style={styles.row}
            onPress={() =>
              navigation.navigate('ItemsList', {
                hideInbox: true,
                initialChildId: selectedChild.id,
                initialStatus: 'owned',
                initialBrandId: brandId === 'All' ? undefined : brandId,
                initialClothingType: closetCategoryToClothingType(category) as any,
                initialSizeBucket: sizeMode === 'both' ? 'All' : sizeMode,
              })
            }
          >
            <Text style={styles.label}>{closetLabel[category]}</Text>
            <Text style={styles.count}>{activeCounts[category]}</Text>
          </Pressable>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Recent items</Text>
        <View style={styles.recentWrap}>
          {recentItems.length === 0 ? <Text style={styles.meta}>No recent items</Text> : null}
          {recentItems.map((item) => (
            <View key={item.id} style={styles.recentItem}>
              <Text style={styles.recentTitle}>{item.title}</Text>
              <Text style={styles.meta}>{item.size || 'N/A'} • {formatItemCategoryLabel(item)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Pressable onPress={() => setShowDupes((prev) => !prev)}>
          <Text style={styles.sectionTitle}>Print duplicates within brand {showDupes ? '(Hide)' : '(Show)'}</Text>
        </Pressable>
        {showDupes ? (
          printDupes.length ? (
            printDupes.map((group) => (
              <Text key={`${group.printName}-${group.sizes.join('|')}`} style={styles.meta}>
                {group.printName}: {group.sizes.join(', ')}
              </Text>
            ))
          ) : (
            <Text style={styles.meta}>No print duplicate groups for this brand.</Text>
          )
        ) : null}
      </Card>
      <UpsellModal visible={showUpsell} context="brand_snapshot" usageCount={usageCount} onClose={() => setShowUpsell(false)} />
    </Screen>
  );
};
