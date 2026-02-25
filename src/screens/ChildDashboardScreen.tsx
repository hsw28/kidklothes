import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { canPromoteChildSize, usePromoteChildSize } from '@/hooks/usePromoteChildSize';
import { KidsStackParamList } from '@/navigation/types';
import { ClothingType } from '@/models';
import { closetCategoryForItem, getVisibleClosetCategories } from '@/utils/closetViewInsights';
import { ClosetCategory, closetCategories, closetLabel } from '@/utils/categories';
import { isAdvancedUnlocked } from '@/utils/featureUnlock';
import { getChildItems, getDuplicateAdjacentGroups, getSizeUpCounts, getWearingNowByCategory } from '@/utils/fitInsights';
import { formatSizeDisplay } from '@/utils/sizes';
import { useAppTheme } from '@/theme';
import { getItemDisplayImageUri } from '@/utils/itemMedia';

type Props = NativeStackScreenProps<KidsStackParamList, 'ChildDashboard'>;

export const ChildDashboardScreen: React.FC<Props> = ({ route, navigation }) => {
  const theme = useAppTheme();
  const { children, items, childItems, storageLocations, settings, createStorageLocation, updateChild, logEvent } = useData();
  const { openPromote, promoteModal } = usePromoteChildSize();
  const child = children.find((entry) => entry.id === route.params.childId);
  const [binType, setBinType] = useState<ClothingType>('bottom');
  const [binSize, setBinSize] = useState('3T');
  const [manageLocations, setManageLocations] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationType, setLocationType] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const [showInsights, setShowInsights] = useState(false);
  const advancedUnlocked = isAdvancedUnlocked(settings, children, childItems, items);
  const hasLocation = storageLocations.length > 0;
  const showLocationUi = advancedUnlocked || hasLocation || manageLocations;

  const data = useMemo(() => {
    if (!child) return undefined;
    const childData = getChildItems(child, items, childItems);
    const owned = childData.items.filter((item) => item.status === 'owned');
    const wearingNow = getWearingNowByCategory(owned, child);
    const sizeUpCounts = getSizeUpCounts(owned, wearingNow, child);
    const duplicatesAdjacent = getDuplicateAdjacentGroups(childData.items);
    const mostWorn = [...owned].sort((a, b) => (b.wornCount ?? 0) - (a.wornCount ?? 0))[0];
    const leastWorn = [...owned].sort((a, b) => (a.wornCount ?? 0) - (b.wornCount ?? 0))[0];
    const categoryCounts = owned.reduce((acc, item) => {
      const key = closetCategoryForItem(item);
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<ClosetCategory, number>());
    const categoryHero = owned.reduce((acc, item) => {
      const key = closetCategoryForItem(item);
      if (acc.has(key)) return acc;
      const uri = getItemDisplayImageUri(item) || '';
      if (uri) acc.set(key, uri);
      return acc;
    }, new Map<ClosetCategory, string>());
    return { childData, owned, wearingNow, sizeUpCounts, duplicatesAdjacent, mostWorn, leastWorn, categoryCounts, categoryHero };
  }, [child, items, childItems]);

  useEffect(() => {
    void logEvent('kids_dashboard_opened');
  }, [logEvent]);

  if (!child || !data) {
    return (
      <Screen>
        <EmptyState title="Child not found" subtitle="Go back and try again." />
      </Screen>
    );
  }

  const topsNow = data.wearingNow.get('tops') ?? 'N/A';
  const topsCurrentNum = topsNow === 'N/A' ? undefined : data.owned.find((item) => item.clothingType === 'top' && item.size === topsNow);
  const size3T = data.owned.filter((item) => item.clothingType === 'top' && item.size.toUpperCase().trim() === '3T').length;
  const size4T = data.owned.filter((item) => item.clothingType === 'top' && item.size.toUpperCase().trim() === '4T').length;
  const sizeUpBinCount = data.owned.filter(
    (item) => item.clothingType === binType && item.size.toUpperCase().trim() === binSize.toUpperCase().trim(),
  ).length;
  const childLocations = storageLocations.filter((location) => !location.childId || location.childId === child.id);
  const hiddenCategories = new Set((child.hiddenClosetCategories ?? []).map((entry) => entry.trim()).filter(Boolean));
  const visibleCategories = getVisibleClosetCategories(child);
  const toggleClosetCategory = async (categoryKey: ClosetCategory) => {
    const next = new Set(hiddenCategories);
    if (next.has(categoryKey)) {
      next.delete(categoryKey);
    } else {
      next.add(categoryKey);
    }
    await updateChild(child.id, { hiddenClosetCategories: Array.from(next) });
  };

  const openCategory = (categoryKey: ClosetCategory) => {
    void logEvent('kid_category_tile_clicked', { childId: child.id, category: categoryKey });
    (navigation.getParent() as any)?.navigate('Closet', {
      screen: 'CategorySnapshot',
      params: { childId: child.id, category: categoryKey, sizeMode: 'both' },
    });
  };

  const runBeforeYouBuy = () => {
    const currentInventory = Array.from(data.wearingNow.entries())
      .map(([category, size]) => `${category}: ${size}`)
      .join(', ');
    const sizeUps = Array.from(data.sizeUpCounts.entries())
      .map(([category, count]) => `${category}: ${count}`)
      .join(', ');

    const message = [
      'Current size counts',
      currentInventory || 'No data yet',
      '',
      'Size-up inventory',
      sizeUps || 'No size-ups tracked',
      '',
      `Similar items in adjacent sizes: ${data.duplicatesAdjacent}`,
    ].join('\n');

    Alert.alert('Before You Buy Check', message);
  };

  return (
    <Screen>
      <Card>
        <View style={styles.kidHeaderRow}>
          {child.photoUri ? (
            <Image source={{ uri: child.photoUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{(child.name.trim()[0] || '?').toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { fontFamily: theme.fonts.serif }]}>{child.name}</Text>
            <Text style={styles.meta}>
              Now: {child.currentSize.code ? formatSizeDisplay(child.currentSize.code, child.currentSize.otherText ?? null) : 'Not set'} • Next:{' '}
              {child.nextSize.code ? formatSizeDisplay(child.nextSize.code, child.nextSize.otherText ?? null) : 'Not set'}
            </Text>
            {child.usesMixedSizes ? (
              <View style={styles.mixedSizesBadge}>
                <Text style={styles.mixedSizesBadgeText}>Mixed sizes</Text>
              </View>
            ) : null}
            {canPromoteChildSize(child) ? (
              <View style={styles.promoteRow}>
                <Text style={styles.promoteMeta}>
                  Wearing {child.currentSize.code ? formatSizeDisplay(child.currentSize.code, child.currentSize.otherText ?? null) : 'Not set'} → Next{' '}
                  {child.nextSize.code ? formatSizeDisplay(child.nextSize.code, child.nextSize.otherText ?? null) : 'Not set'}
                </Text>
                <PrimaryButton label="Promote" variant="secondary" onPress={() => openPromote({ child })} />
              </View>
            ) : null}
          </View>
          <PrimaryButton label="Edit" variant="secondary" onPress={() => navigation.navigate('KidForm', { childId: child.id })} />
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { fontFamily: theme.fonts.serif }]}>Closet Overview</Text>
        <View style={styles.grid}>
          {visibleCategories.map((categoryKey) => (
            <Pressable
              key={categoryKey}
              style={styles.gridTile}
              onPress={() => openCategory(categoryKey)}
              accessibilityRole="button"
              accessibilityLabel={`${closetLabel[categoryKey]} category, ${data.categoryCounts.get(categoryKey) ?? 0}`}
            >
              {data.categoryHero.get(categoryKey) ? (
                <Image source={{ uri: data.categoryHero.get(categoryKey)! }} style={styles.gridTileImage} />
              ) : (
                <View style={styles.gridTilePlaceholder}>
                  <Text style={styles.gridTilePlaceholderText}>{closetLabel[categoryKey][0]}</Text>
                </View>
              )}
              <Text style={[styles.gridTileLabel, { fontFamily: theme.fonts.serif }]} numberOfLines={1}>{closetLabel[categoryKey]}</Text>
              <Text style={styles.gridTileCount}>{data.categoryCounts.get(categoryKey) ?? 0}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <Pressable onPress={() => setShowInsights((prev) => !prev)} style={styles.insightsToggle}>
          <Text style={[styles.sectionTitle, { fontFamily: theme.fonts.serif }]}>Insights {showInsights ? '▾' : '▸'}</Text>
        </Pressable>
        {showInsights ? (
          <View style={styles.insightsBlock}>
            <Text style={styles.meta}>Wearing now: {topsNow} tops</Text>
            <Text style={styles.meta}>Already owned in 3T: {size3T} items</Text>
            <Text style={styles.meta}>Already owned in 4T: {size4T} items</Text>
            <Text style={styles.meta}>Duplicates in adjacent sizes: {data.duplicatesAdjacent}</Text>
            <Text style={styles.meta}>Size-ups owned: {Array.from(data.sizeUpCounts.values()).reduce((sum, count) => sum + count, 0)}</Text>
            <Text style={styles.meta}>Storage locations: {childLocations.length}</Text>
            <Text style={styles.meta}>Most worn: {data.mostWorn?.title ?? 'N/A'}</Text>
            <Text style={styles.meta}>Least worn: {data.leastWorn?.title ?? 'N/A'}</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { fontFamily: theme.fonts.serif }]}>Before You Buy</Text>
        <Text style={styles.meta}>Going to a drop? Check what you already have first.</Text>
        <PrimaryButton label="Run Check Mode" variant="secondary" onPress={runBeforeYouBuy} />
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { fontFamily: theme.fonts.serif }]}>Manage Storage Locations</Text>
        {!showLocationUi ? (
          <>
            <Text style={styles.meta}>Add your first location manually to start using location-aware counts.</Text>
            <PrimaryButton label="Manage Storage Locations" variant="secondary" onPress={() => setManageLocations(true)} />
          </>
        ) : (
          <>
            {childLocations.length === 0 ? <Text style={styles.meta}>No locations yet.</Text> : null}
            {childLocations.map((location) => (
              <Text key={location.id} style={styles.meta}>
                {location.name}
              </Text>
            ))}
            <FormInput label="Location name" value={locationName} onChangeText={setLocationName} placeholder="Size-Up Bin" />
            <FormInput label="Type (optional)" value={locationType} onChangeText={setLocationType} placeholder="bin, drawer, closet" />
            <FormInput label="Notes (optional)" value={locationNotes} onChangeText={setLocationNotes} placeholder="Optional" />
            <PrimaryButton
              label="Add Location"
              variant="secondary"
              onPress={async () => {
                if (!locationName.trim()) return;
                await createStorageLocation({
                  childId: child.id,
                  name: locationName.trim(),
                  type: locationType.trim() || undefined,
                  notes: locationNotes.trim() || undefined,
                });
                setLocationName('');
                setLocationType('');
                setLocationNotes('');
              }}
            />
          </>
        )}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { fontFamily: theme.fonts.serif }]}>Closet Categories</Text>
        <Text style={styles.meta}>Hide categories for this kid (for example, Dresses & Skirts).</Text>
        {closetCategories.map((category) => {
          const hidden = hiddenCategories.has(category);
          return (
            <PrimaryButton
              key={category}
              label={hidden ? `Show ${closetLabel[category]}` : `Hide ${closetLabel[category]}`}
              variant="secondary"
              onPress={() => toggleClosetCategory(category)}
            />
          );
        })}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { fontFamily: theme.fonts.serif }]}>Size-Ups</Text>
        {Array.from(data.sizeUpCounts.entries()).map(([category, count]) => (
          <Text key={category} style={styles.meta}>
            {category}: {count}
          </Text>
        ))}
        <Text style={[styles.sectionTitle, { fontFamily: theme.fonts.serif }]}>Size-up bin</Text>
        <ChipSelector label="Type" options={['bottom', 'top', 'sleeper', 'outerwear', 'shoes']} value={binType} onChange={setBinType} />
        <ChipSelector label="Size" options={['2T', '3T', '4T', '5T']} value={binSize} onChange={setBinSize} />
        <Text style={styles.meta}>Do I have {binSize} {binType}? {sizeUpBinCount} owned</Text>
      </Card>
      {promoteModal}
    </Screen>
  );
};

const styles = StyleSheet.create({
  kidHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e5e7eb',
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#eef0f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#6b7280',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  meta: {
    color: '#4b5563',
    fontSize: 14,
  },
  mixedSizesBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#EEF3EE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mixedSizesBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4E6452',
  },
  promoteRow: {
    marginTop: 8,
    gap: 8,
  },
  promoteMeta: {
    color: '#6b7280',
    fontSize: 12,
  },
  grid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridTile: {
    width: '31%',
    backgroundColor: '#f8fafb',
    borderRadius: 14,
    padding: 8,
    gap: 4,
  },
  gridTileImage: {
    width: '100%',
    aspectRatio: 1.1,
    borderRadius: 10,
    backgroundColor: '#eef0f3',
  },
  gridTilePlaceholder: {
    width: '100%',
    aspectRatio: 1.1,
    borderRadius: 10,
    backgroundColor: '#eef0f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTilePlaceholderText: {
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 16,
  },
  gridTileLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
  gridTileCount: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '700',
  },
  insightsToggle: {
    paddingVertical: 2,
  },
  insightsBlock: {
    marginTop: 8,
    gap: 4,
  },
});
