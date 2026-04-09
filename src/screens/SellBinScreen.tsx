import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { FeatureOnboardingModal } from '@/components/FeatureOnboardingModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { useBstEntryOnboarding } from '@/hooks/useBstEntryOnboarding';
import { Item } from '@/models';
import { ClosetStackParamList } from '@/navigation/types';
import { FREE_BST_DRAFT_LIMIT, FREE_BST_ITEM_CARD_LIMIT } from '@/services/bst/bstLimits';
import { trackSellBinOpened } from '@/services/bst/bstAnalytics';
import { shouldSuppressFoundingOffer } from '@/services/foundingOffer';
import { getFoundingMemberYearlyOffer } from '@/services/purchases';
import { hasProAccess } from '@/services/proAccess';
import { useAppTheme } from '@/theme';
import { getSpecialLocationIds } from '@/utils/closetViewInsights';
import { makeId } from '@/utils/id';
import { formatConditionLabel } from '@/utils/itemLabels';

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
    if (item.condition) parts.push(formatConditionLabel(item.condition));
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

export const SellBinScreen: React.FC<Props> = ({ navigation }) => {
  const { children, items, childItems, storageLocations, brands, updateItem, logEvent, getEventCount, settings, purchaseState } = useData();
  const theme = useAppTheme();
  const didLogOpenRef = useRef(false);
  const lastFocusLoggedAtRef = useRef(0);
  const [childFilter, setChildFilter] = useState<string>('All');
  const [brandFilter, setBrandFilter] = useState<string>('All');
  const [listedFilter, setListedFilter] = useState<ListedFilter>('All');
  const [foundingOfferVisible, setFoundingOfferVisible] = useState(false);

  const childOptions = useMemo(() => ['All', ...children.map((child) => child.name)], [children]);
  const brandOptions = useMemo(() => ['All', ...brands], [brands]);
  const listedOptions: ListedFilter[] = ['All', 'Unlisted', 'Listed'];
  const childNameById = useMemo(() => new Map(children.map((child) => [child.id, child.name])), [children]);
  const sellStatusByItemId = useMemo(() => {
    const sellBinLocationIdsByChildId = new Map(children.map((child) => [child.id, getSpecialLocationIds(child.id, storageLocations).sellBinLocationId]));
    const next = new Map<string, 'for-sale' | 'sold'>();
    items.forEach((item) => {
      const itemLinks = childItems.filter((link) => link.itemId === item.id);
      if (itemLinks.length === 0) return;

      const relevantLinks = childFilter === 'All'
        ? itemLinks
        : itemLinks.filter((link) => childNameById.get(link.childId) === childFilter);
      if (relevantLinks.length === 0) return;

      let resolved: 'for-sale' | 'sold' | null = null;
      relevantLinks.forEach((link) => {
        const effectiveStatus = link.statusForChild ?? item.status;
        const sellBinLocationId = sellBinLocationIdsByChildId.get(link.childId);
        if (sellBinLocationId && link.storageLocationId === sellBinLocationId) {
          resolved = effectiveStatus === 'sold' ? 'sold' : 'for-sale';
          return;
        }
        if (effectiveStatus === 'for-sale') {
          resolved = 'for-sale';
          return;
        }
        if (!resolved && effectiveStatus === 'sold') {
          resolved = 'sold';
        }
      });

      if (resolved) {
        next.set(item.id, resolved);
      }
    });
    return next;
  }, [childFilter, childItems, childNameById, children, items, storageLocations]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (!sellStatusByItemId.has(item.id)) return false;

      const brandPass = brandFilter === 'All' || item.brandTags.includes(brandFilter) || normalize(item.brand ?? '') === normalize(brandFilter);
      if (!brandPass) return false;

      if (listedFilter === 'Listed' && !item.listedAt) return false;
      if (listedFilter === 'Unlisted' && item.listedAt) return false;
      return true;
    });
  }, [brandFilter, items, listedFilter, sellStatusByItemId]);

  const forSale = filtered.filter((item) => sellStatusByItemId.get(item.id) === 'for-sale');
  const sold = filtered.filter((item) => sellStatusByItemId.get(item.id) === 'sold');
  const purchaseTotal = forSale.reduce((sum, item) => sum + (item.purchasePrice ?? 0), 0);
  const estimatedResaleTotal = forSale.reduce((sum, item) => sum + (item.targetResalePrice ?? 0), 0);
  const soldTotal = sold.reduce((sum, item) => sum + (item.soldPrice ?? 0), 0);
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
  const isPro = hasProAccess(settings, purchaseState);
  const bstEntryOnboarding = useBstEntryOnboarding(Boolean(settings.developerModeEnabled));

  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      if (didLogOpenRef.current && now - lastFocusLoggedAtRef.current < 15000) {
        return undefined;
      }
      didLogOpenRef.current = true;
      lastFocusLoggedAtRef.current = now;
      void trackSellBinOpened(logEvent, {
        itemCount: forSale.length,
        isPro,
        triggeredFrom: 'sell_bin_focus',
      });
      return undefined;
    }, [forSale.length, isPro, logEvent]),
  );

  useEffect(() => {
    if (didLogOpenRef.current) return;
    void trackSellBinOpened(logEvent, {
      itemCount: forSale.length,
      isPro,
      triggeredFrom: 'sell_bin',
    });
    didLogOpenRef.current = true;
    lastFocusLoggedAtRef.current = Date.now();
  }, [forSale.length, isPro, logEvent]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const foundingSummary = await getFoundingMemberYearlyOffer();
      if (cancelled) return;
      setFoundingOfferVisible(
        foundingSummary.status === 'available'
        && !isPro
        && !shouldSuppressFoundingOffer(settings, purchaseState),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isPro,
    purchaseState?.isEntitled,
    settings.guidedOnboarding,
    settings.guidedOnboardingCompleted,
    settings.developerModeEnabled,
    settings.developerForceProAccessEnabled,
  ]);

  const openBstDraftCreate = () => {
    navigation.navigate('BstSaleDraftCreate');
  };
  const startBstWithFreePreview = () => {
    const prefillItemIds = forSale.slice(0, FREE_BST_ITEM_CARD_LIMIT).map((item) => item.id);
    bstEntryOnboarding.dismiss();
    navigation.navigate('BstSaleDraftCreate', prefillItemIds.length ? { prefillItemIds } : undefined);
  };

  const markListed = async (item: Item) => {
    if (item.listedAt) return;
    const nowIso = new Date().toISOString();
    await updateItem(item.id, { listedAt: nowIso });
    await logEvent('sell_bin_mark_listed', { itemId: item.id });
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
    sectionHeadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
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
    soldBadge: {
      marginLeft: 'auto',
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      backgroundColor: theme.colors.surfaceMuted,
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
    ctaSubtext: {
      marginTop: 8,
      fontSize: 12,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    summaryCard: {
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    readyBanner: {
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    bstActions: {
      gap: 12,
      marginTop: 12,
    },
  });

  return (
    <Screen>
      <FeatureOnboardingModal
        visible={bstEntryOnboarding.visible}
        title="Sell in minutes, not hours"
        body="Turn your closet into ready-to-post listings"
        bullets={[
          'Create BST-ready collages',
          'Generate comment cards automatically',
          'Copy your full post in one tap',
        ]}
        primaryLabel="Create your first post"
        note={`Free preview includes up to ${FREE_BST_ITEM_CARD_LIMIT} items`}
        onPrimaryPress={startBstWithFreePreview}
        onSecondaryPress={bstEntryOnboarding.dismiss}
      />
      {foundingOfferVisible ? (
        <Card>
          <Text style={styles.summary}>Founding Member pricing available</Text>
          <Text style={styles.meta}>Unlock unlimited BST posts and clean exports.</Text>
          <PrimaryButton
            label="Get 50% off Pro"
            variant="secondary"
            onPress={() => navigation.navigate('ProPaywall', { entryContext: 'bst', source: 'sell_bin' })}
          />
          <Text style={styles.ctaSubtext}>Then $19.99/year after</Text>
        </Card>
      ) : null}
      {settings.developerModeEnabled ? (
        <Card>
          <Text style={styles.summary}>Create BST post</Text>
          <Text style={styles.meta}>Generate your listing, images, and captions in one tap.</Text>
          <View style={styles.bstActions}>
            <PrimaryButton
              label="Create BST post"
              onPress={openBstDraftCreate}
            />
            {!isPro ? <Text style={styles.ctaSubtext}>Start free • unlock full post with Pro</Text> : null}
            <PrimaryButton
              label="View drafts"
              variant="secondary"
              onPress={() => navigation.navigate('BstSaleDraftList')}
            />
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.title}>Sell Bin</Text>
        <Text style={styles.meta}>Track what is listed and what already sold.</Text>
        <ChipSelector label="Child" options={childOptions} value={childFilter} onChange={setChildFilter} accent="coral" />
        {brandOptions.length > 1 ? <ChipSelector label="Brand" options={brandOptions} value={brandFilter} onChange={setBrandFilter} accent="sage" /> : null}
        <ChipSelector label="Listed" options={listedOptions} value={listedFilter} onChange={(value) => setListedFilter(value as ListedFilter)} />
      </Card>

      {forSale.length > 1 ? (
        <Card style={styles.readyBanner}>
          <Text style={styles.summary}>You have {forSale.length} items ready to sell</Text>
          <Text style={styles.meta}>Ready to post these? Create a BST post.</Text>
        </Card>
      ) : null}

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

      {forSale.length === 0 ? (
        <EmptyState title="No items in Sell Bin" subtitle="Mark owned items as for-sale first so you can track what is ready to list and what already sold." />
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
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {sellStatusByItemId.get(item.id) === 'sold' ? (
                    <Text style={styles.soldBadge}>Sold</Text>
                  ) : item.listedAt ? (
                    <Text style={styles.listedBadge}>Previously listed</Text>
                  ) : null}
                </View>
                <Text style={styles.meta}>{[item.brand, item.size].filter(Boolean).join(' • ') || 'Brand and size not set'}</Text>
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
