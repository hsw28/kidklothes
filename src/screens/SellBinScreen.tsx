import React, { useMemo, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { Item } from '@/models';
import { ClosetStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme';
import { makeId } from '@/utils/id';

type Props = NativeStackScreenProps<ClosetStackParamList, 'SellBin'>;
type ListedFilter = 'All' | 'Unlisted' | 'Listed';

const asCurrency = (value: number) => `$${value.toFixed(2)}`;
const normalize = (value: string) => value.toLowerCase().trim();

const buildBstExportText = (rows: Item[], title: string) => {
  const lines: string[] = [title, ''];
  const total = rows.reduce((sum, item) => sum + (item.targetResalePrice ?? 0), 0);
  rows.forEach((item, idx) => {
    const parts: string[] = [];
    if (item.printName) parts.push(item.printName);
    if (item.brand) parts.push(item.brand);
    parts.push(item.size || 'N/A');
    if (item.condition) parts.push(item.condition);
    if (item.targetResalePrice !== undefined) parts.push(asCurrency(item.targetResalePrice));
    const link = item.outboundUrl || item.url || '';
    lines.push(`${idx + 1}. ${parts.join(' • ')}`);
    if (link) lines.push(`   ${link}`);
  });
  lines.push('');
  lines.push(`Total items: ${rows.length}`);
  lines.push(`Total target: ${asCurrency(total)}`);
  return lines.join('\n');
};

export const SellBinScreen: React.FC<Props> = () => {
  const { children, items, childItems, brands, updateItem, logEvent } = useData();
  const theme = useAppTheme();
  const [childFilter, setChildFilter] = useState<string>('All');
  const [brandFilter, setBrandFilter] = useState<string>('All');
  const [listedFilter, setListedFilter] = useState<ListedFilter>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const childOptions = useMemo(() => ['All', ...children.map((child) => child.name)], [children]);
  const brandOptions = useMemo(() => ['All', ...brands], [brands]);
  const listedOptions: ListedFilter[] = ['All', 'Unlisted', 'Listed'];

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const childPass =
        childFilter === 'All' ||
        childItems.some((link) => link.itemId === item.id && children.find((child) => child.id === link.childId)?.name === childFilter);
      if (!childPass) return false;

      const brandPass = brandFilter === 'All' || item.brandTags.includes(brandFilter) || normalize(item.brand ?? '') === normalize(brandFilter);
      if (!brandPass) return false;
      if (item.status !== 'for-sale' && item.status !== 'sold') return false;
      if (listedFilter === 'Listed' && !item.listedAt) return false;
      if (listedFilter === 'Unlisted' && item.listedAt) return false;
      return true;
    });
  }, [brandFilter, childFilter, children, childItems, items, listedFilter]);

  const forSale = filtered.filter((item) => item.status === 'for-sale');
  const sold = filtered.filter((item) => item.status === 'sold');
  const purchaseTotal = forSale.reduce((sum, item) => sum + (item.purchasePrice ?? 0), 0);
  const estimatedResaleTotal = forSale.reduce((sum, item) => sum + (item.targetResalePrice ?? 0), 0);
  const soldTotal = sold.reduce((sum, item) => sum + (item.soldPrice ?? 0), 0);
  const selectedItems = filtered.filter((item) => selectedIds.includes(item.id));
  const bundleSummaries = useMemo(() => {
    const grouped = new Map<string, { count: number; estimatedTotal: number }>();
    forSale.forEach((item) => {
      if (!item.bundleId) return;
      const prev = grouped.get(item.bundleId) ?? { count: 0, estimatedTotal: 0 };
      prev.count += 1;
      prev.estimatedTotal += item.targetResalePrice ?? 0;
      grouped.set(item.bundleId, prev);
    });
    return Array.from(grouped.entries()).map(([bundleId, summary]) => ({ bundleId, ...summary }));
  }, [forSale]);

  const toggleSelected = (itemId: string) => {
    setSelectedIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
  };

  const markListed = async (item: Item) => {
    if (item.listedAt) return;
    const nowIso = new Date().toISOString();
    await updateItem(item.id, { listedAt: nowIso });
    await logEvent('sell_bin_mark_listed', { itemId: item.id });
  };

  const createBundleFromSelected = async () => {
    if (selectedItems.length === 0) return;
    const bundleId = `bundle-${makeId().slice(0, 8)}`;
    await Promise.all(selectedItems.map((item) => updateItem(item.id, { bundleId })));
    await logEvent('sell_bin_bundle_created', { bundleId, count: selectedItems.length });
    setSelectedIds([]);
  };

  const shareSelected = async () => {
    if (selectedItems.length === 0) return;
    const message = buildBstExportText(selectedItems, 'Kidklothes BST Draft');
    await Share.share({ title: 'BST Draft', message });
    await logEvent('sell_bin_export_shared', { count: selectedItems.length });
  };

  const shareBundle = async (bundleId: string) => {
    const rows = forSale.filter((item) => item.bundleId === bundleId);
    if (rows.length === 0) return;
    const message = buildBstExportText(rows, `Kidklothes Bundle ${bundleId}`);
    await Share.share({ title: `Bundle ${bundleId}`, message });
    await logEvent('sell_bin_bundle_export_shared', { bundleId, count: rows.length });
  };

  const styles = StyleSheet.create({
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    summary: {
      fontSize: 18,
      fontWeight: '500',
      color: theme.colors.textPrimary,
    },
    itemTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.colors.textPrimary,
      flex: 1,
    },
    itemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    itemRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: theme.colors.chipBg,
    },
    thumbPlaceholder: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: theme.colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbDot: {
      color: theme.colors.textSecondary,
      fontSize: 16,
    },
    actionsRow: {
      gap: 8,
    },
    selectBox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      backgroundColor: theme.colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectBoxActive: {
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    selectText: {
      color: theme.colors.accentPeriwinkle,
      fontWeight: '800',
    },
    listedBadge: {
      marginLeft: 'auto',
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.mutedBadgeText,
      backgroundColor: theme.colors.mutedBadgeBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    listedAction: {
      marginTop: 8,
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.chipBg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
    },
    actionText: {
      color: theme.colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    bundleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    meta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    summaryCard: {
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
  });

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Sell Bin</Text>
        <Text style={styles.meta}>Track what is listed and what already sold.</Text>
        <ChipSelector label="Child" options={childOptions} value={childFilter} onChange={setChildFilter} accent="coral" />
        {brandOptions.length > 1 ? <ChipSelector label="Brand" options={brandOptions} value={brandFilter} onChange={setBrandFilter} accent="sage" /> : null}
        <ChipSelector label="Listed" options={listedOptions} value={listedFilter} onChange={(value) => setListedFilter(value as ListedFilter)} />
      </Card>

      <Card style={styles.summaryCard}>
        <Text style={styles.summary}>For sale items: {forSale.length}</Text>
        <Text style={styles.meta}>Total purchase cost: {asCurrency(purchaseTotal)}</Text>
        <Text style={styles.meta}>Estimated resale total: {asCurrency(estimatedResaleTotal)}</Text>
        <Text style={styles.meta}>Sold summary: {asCurrency(soldTotal)}</Text>
      </Card>

      {bundleSummaries.length > 0 ? (
        <Card>
          <Text style={styles.summary}>Bundles</Text>
          {bundleSummaries.map((bundle) => (
            <View key={bundle.bundleId} style={styles.bundleRow}>
              <Text style={styles.meta}>{bundle.bundleId}: {bundle.count} items • {asCurrency(bundle.estimatedTotal)}</Text>
              <Pressable onPress={() => void shareBundle(bundle.bundleId)}>
                <Text style={styles.actionText}>Export</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}

      {filtered.length > 0 ? (
        <Card>
          <Text style={styles.summary}>Selection</Text>
          <Text style={styles.meta}>{selectedItems.length} selected</Text>
          <View style={styles.actionsRow}>
            <PrimaryButton label="Export Selected" variant="secondary" onPress={() => void shareSelected()} />
            <PrimaryButton label="Create Bundle" variant="secondary" onPress={() => void createBundleFromSelected()} />
          </View>
        </Card>
      ) : null}

      {forSale.length === 0 ? (
        <EmptyState title="Nothing in sell bin" subtitle="Mark owned items as for-sale from the items list bulk actions." />
      ) : (
        forSale.map((item) => (
          <Card key={item.id}>
            <View style={styles.itemRow}>
              {item.cachedImageUri || item.imageUrls[0] || item.imageUrl ? (
                <Image source={{ uri: item.cachedImageUri || item.imageUrls[0] || item.imageUrl }} style={styles.thumb} />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <Text style={styles.thumbDot}>•</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.itemHeader}>
                  <Pressable onPress={() => toggleSelected(item.id)} style={[styles.selectBox, selectedIds.includes(item.id) ? styles.selectBoxActive : undefined]}>
                    <Text style={styles.selectText}>{selectedIds.includes(item.id) ? '✓' : ''}</Text>
                  </Pressable>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {item.listedAt ? <Text style={styles.listedBadge}>Listed</Text> : null}
                </View>
                {item.bundleId ? <Text style={styles.meta}>Bundle: {item.bundleId}</Text> : null}
                {item.printName ? <Text style={styles.meta}>Print: {item.printName}</Text> : null}
                <Text style={styles.meta}>Brand: {item.brand ?? 'N/A'}</Text>
                <Text style={styles.meta}>Size: {item.size || 'N/A'}</Text>
                <Text style={styles.meta}>Condition: {item.condition ?? 'N/A'}</Text>
                <Text style={styles.meta}>Purchase: {item.purchasePrice !== undefined ? asCurrency(item.purchasePrice) : 'N/A'}</Text>
                <Text style={styles.meta}>Target resale: {item.targetResalePrice !== undefined ? asCurrency(item.targetResalePrice) : 'N/A'}</Text>
                {!item.listedAt ? (
                  <Pressable style={styles.listedAction} onPress={() => void markListed(item)}>
                    <Text style={styles.actionText}>Mark listed</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
};

