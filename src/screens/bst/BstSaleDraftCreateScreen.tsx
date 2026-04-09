import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { FeatureOnboardingModal } from '@/components/FeatureOnboardingModal';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { useBstEntryOnboarding } from '@/hooks/useBstEntryOnboarding';
import { ClosetStackParamList } from '@/navigation/types';
import { trackBstCreateStarted } from '@/services/bst/bstAnalytics';
import { FREE_BST_ITEM_CARD_LIMIT } from '@/services/bst/bstLimits';
import { hasProAccess } from '@/services/proAccess';
import { getSpecialLocationIds } from '@/utils/closetViewInsights';
import { getItemDisplayImageUri } from '@/utils/itemMedia';
import { formatConditionLabel } from '@/utils/itemLabels';
import { useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<ClosetStackParamList, 'BstSaleDraftCreate'>;

export const BstSaleDraftCreateScreen: React.FC<Props> = ({ navigation, route }) => {
  const { children, items, childItems, storageLocations, brands, createSaleDraft, settings, purchaseState, logEvent } = useData();
  const theme = useAppTheme();
  const didLogOpenRef = useRef(false);
  const isPro = hasProAccess(settings, purchaseState);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [childFilter, setChildFilter] = useState<'All' | string>('All');
  const [brandFilter, setBrandFilter] = useState<'All' | string>('All');
  const [selectedIds, setSelectedIds] = useState(() => {
    const prefilled = route.params?.prefillItemIds ?? [];
    return Array.from(new Set(prefilled));
  });
  const bstEntryOnboarding = useBstEntryOnboarding(true);

  const childOptions = useMemo(() => ['All', ...children.map((child) => child.name)], [children]);
  const brandOptions = useMemo(() => ['All', ...brands], [brands]);
  const childNameById = useMemo(() => new Map(children.map((child) => [child.id, child.name])), [children]);
  const sellItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sellBinLocationIdsByChildId = new Map(children.map((child) => [child.id, getSpecialLocationIds(child.id, storageLocations).sellBinLocationId]));
    return items.filter((item) => {
      const itemLinks = childItems.filter((link) => link.itemId === item.id);
      if (itemLinks.length === 0) return false;
      const relevantLinks = childFilter === 'All'
        ? itemLinks
        : itemLinks.filter((link) => childNameById.get(link.childId) === childFilter);
      if (relevantLinks.length === 0) return false;

      const inSellBin = relevantLinks.some((link) => {
        const sellBinLocationId = sellBinLocationIdsByChildId.get(link.childId);
        if (sellBinLocationId) {
          return link.storageLocationId === sellBinLocationId;
        }
        return (link.statusForChild ?? item.status) === 'for-sale';
      });
      if (!inSellBin) return false;

      if (brandFilter !== 'All' && item.brand !== brandFilter && !item.brandTags.includes(brandFilter)) return false;
      if (normalizedQuery) {
        const haystack = [item.title, item.brand, item.printName, item.size].join(' ').toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [brandFilter, childFilter, childItems, childNameById, children, items, query, storageLocations]);
  const allVisibleSelected = sellItems.length > 0 && sellItems.every((item) => selectedIds.includes(item.id));

  const styles = StyleSheet.create({
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    thumb: {
      width: 60,
      height: 60,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
    },
    placeholder: {
      width: 60,
      height: 60,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      color: theme.colors.textSecondary,
      fontSize: 22,
    },
    itemTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    meta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    check: {
      marginLeft: 'auto',
      minWidth: 28,
      minHeight: 28,
      borderRadius: 999,
      backgroundColor: theme.colors.accentPeriwinkleSoft,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    checkText: {
      color: theme.colors.textPrimary,
      fontWeight: '700',
    },
    bulkRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
      marginTop: 4,
    },
    bulkAction: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
    },
    bulkActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
  });

  useEffect(() => {
    if (didLogOpenRef.current) return;
    didLogOpenRef.current = true;
    void trackBstCreateStarted(logEvent, {
      itemCount: route.params?.prefillItemIds?.length ?? 0,
      isPro,
      triggeredFrom: route.params?.prefillItemIds?.length ? 'sell_bin_prefill' : 'create_screen',
    });
  }, [isPro, logEvent, route.params?.prefillItemIds?.length]);

  const toggleItemSelection = (itemId: string) => {
    if (selectedIds.includes(itemId)) {
      setSelectedIds((current) => current.filter((id) => id !== itemId));
      return;
    }
    setSelectedIds((current) => [...current, itemId]);
  };
  const startFreePreview = () => {
    setSelectedIds(Array.from(new Set(sellItems.slice(0, FREE_BST_ITEM_CARD_LIMIT).map((item) => item.id))));
    bstEntryOnboarding.dismiss();
  };

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
        onPrimaryPress={startFreePreview}
        onSecondaryPress={bstEntryOnboarding.dismiss}
      />
      <Card>
        <Text style={styles.title}>New BST Sale Draft</Text>
        <Text style={styles.body}>{`Pick items to create your sale post\nWe’ll format everything for you — 2 cards free`}</Text>
        <FormInput label="Draft title (optional)" value={title} onChangeText={setTitle} placeholder="Spring Purge" />
        <FormInput label="Search sell items" value={query} onChangeText={setQuery} placeholder="Brand, title, size…" clearable />
        <ChipSelector label="Child" options={childOptions} value={childFilter} onChange={setChildFilter} accent="coral" />
        {brandOptions.length > 1 ? <ChipSelector label="Brand" options={brandOptions} value={brandFilter} onChange={setBrandFilter} accent="sage" /> : null}
      </Card>

      {sellItems.length === 0 ? (
        <EmptyState title="No sell-bin items found" subtitle="Mark items as for-sale first, then come back to build a BST draft." />
      ) : (
        <>
          <Card>
            <Text style={styles.itemTitle}>Pick items to create your sale post</Text>
            <Text style={styles.body}>{`Pick items to create your sale post\nWe’ll format everything for you — 2 cards free`}</Text>
            <View style={styles.bulkRow}>
              <Pressable
                style={styles.bulkAction}
                onPress={() => setSelectedIds(Array.from(new Set([...selectedIds, ...sellItems.map((item) => item.id)])))}
              >
                <Text style={styles.bulkActionText}>{allVisibleSelected ? 'Selected' : 'Select All'}</Text>
              </Pressable>
              <Pressable
                style={styles.bulkAction}
                onPress={() => setSelectedIds((current) => current.filter((id) => !sellItems.some((item) => item.id === id)))}
              >
                <Text style={styles.bulkActionText}>Clear All</Text>
              </Pressable>
            </View>
          </Card>
          {sellItems.map((item) => {
            const active = selectedIds.includes(item.id);
            const imageUri = getItemDisplayImageUri(item);
            return (
              <Pressable
                key={item.id}
                onPress={() => toggleItemSelection(item.id)}
              >
                <Card>
                  <View style={styles.row}>
                    {imageUri ? (
                      <Image source={{ uri: imageUri }} style={styles.thumb} />
                    ) : (
                      <View style={styles.placeholder}>
                        <Text style={styles.placeholderText}>•</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.meta}>{[item.brand, item.size, item.condition ? formatConditionLabel(item.condition) : undefined].filter(Boolean).join(' • ')}</Text>
                      {item.targetResalePrice !== undefined ? <Text style={styles.meta}>Target resale ${item.targetResalePrice.toFixed(2)}</Text> : null}
                    </View>
                    <View style={styles.check}>
                      <Text style={styles.checkText}>{active ? '✓' : '+'}</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}
          <Card>
            <PrimaryButton
              label={selectedIds.length ? `Create Draft (${selectedIds.length})` : 'Select Items to Continue'}
              onPress={async () => {
                if (!selectedIds.length) return;
                const draft = await createSaleDraft({ title, itemIds: selectedIds });
                if (!draft) return;
                navigation.replace('BstSaleDraftEditor', { draftId: draft.id });
              }}
            />
          </Card>
        </>
      )}
    </Screen>
  );
};
