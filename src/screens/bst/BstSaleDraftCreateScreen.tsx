import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { trackBstCreateStarted, trackBstSecondDraftBlocked } from '@/services/bst/bstAnalytics';
import { countActiveSaleDrafts, FREE_BST_DRAFT_LIMIT } from '@/services/bst/bstLimits';
import { canCreateMultipleDrafts, hasProAccess } from '@/services/proAccess';
import { getItemDisplayImageUri } from '@/utils/itemMedia';
import { useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<ClosetStackParamList, 'BstSaleDraftCreate'>;

export const BstSaleDraftCreateScreen: React.FC<Props> = ({ navigation, route }) => {
  const { children, items, childItems, brands, createSaleDraft, settings, purchaseState, saleDrafts, logEvent } = useData();
  const theme = useAppTheme();
  const didLogOpenRef = useRef(false);
  const canCreateMoreDrafts = canCreateMultipleDrafts(settings, purchaseState);
  const isPro = hasProAccess(settings, purchaseState);
  const activeDraftCount = countActiveSaleDrafts(saleDrafts);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [childFilter, setChildFilter] = useState<'All' | string>('All');
  const [brandFilter, setBrandFilter] = useState<'All' | string>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>(route.params?.prefillItemIds ?? []);

  const childOptions = useMemo(() => ['All', ...children.map((child) => child.name)], [children]);
  const brandOptions = useMemo(() => ['All', ...brands], [brands]);
  const sellItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (item.status !== 'for-sale') return false;
      if (childFilter !== 'All') {
        const linked = childItems.some((link) => link.itemId === item.id && children.find((child) => child.id === link.childId)?.name === childFilter);
        if (!linked) return false;
      }
      if (brandFilter !== 'All' && item.brand !== brandFilter && !item.brandTags.includes(brandFilter)) return false;
      if (normalizedQuery) {
        const haystack = [item.title, item.brand, item.printName, item.size].join(' ').toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [brandFilter, childFilter, childItems, children, items, query]);

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

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>New BST Sale Draft</Text>
        <Text style={styles.body}>Pick which sell-bin items belong in this purge. You can tune pricing, notes, and image choices after the draft is created.</Text>
        {!canCreateMoreDrafts ? (
          <Text style={styles.body}>
            Free includes {FREE_BST_DRAFT_LIMIT} active BST draft at a time. Collages are unlimited, and item cards are free for up to 2 chosen items in each draft.
          </Text>
        ) : null}
        {!canCreateMoreDrafts && activeDraftCount >= FREE_BST_DRAFT_LIMIT ? (
          <Text style={styles.body}>Your free draft slot is currently in use. You can keep editing that draft, or unlock Pro to create another.</Text>
        ) : null}
        <FormInput label="Draft title (optional)" value={title} onChangeText={setTitle} placeholder="Spring Purge" />
        <FormInput label="Search sell items" value={query} onChangeText={setQuery} placeholder="Brand, title, size…" clearable />
        <ChipSelector label="Child" options={childOptions} value={childFilter} onChange={setChildFilter} accent="coral" />
        {brandOptions.length > 1 ? <ChipSelector label="Brand" options={brandOptions} value={brandFilter} onChange={setBrandFilter} accent="sage" /> : null}
        <PrimaryButton
          label={selectedIds.length ? `Create Draft (${selectedIds.length})` : 'Select Items to Continue'}
          onPress={async () => {
            if (!selectedIds.length) return;
            if (!canCreateMoreDrafts && activeDraftCount >= FREE_BST_DRAFT_LIMIT) {
              void trackBstSecondDraftBlocked(logEvent, {
                itemCount: activeDraftCount,
                isPro,
                triggeredFrom: 'draft_create',
              });
              navigation.navigate('ProPaywall', { source: 'bst_draft_limit' });
              return;
            }
            const draft = await createSaleDraft({ title, itemIds: selectedIds });
            if (!draft) return;
            navigation.replace('BstSaleDraftEditor', { draftId: draft.id });
          }}
        />
      </Card>

      {sellItems.length === 0 ? (
        <EmptyState title="No sell-bin items found" subtitle="Mark items as for-sale first, then come back to build a BST draft." />
      ) : (
        sellItems.map((item) => {
          const active = selectedIds.includes(item.id);
          const imageUri = getItemDisplayImageUri(item);
          return (
            <Pressable
              key={item.id}
              onPress={() => setSelectedIds((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))}
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
                    <Text style={styles.meta}>{[item.brand, item.size, item.condition].filter(Boolean).join(' • ')}</Text>
                    {item.targetResalePrice !== undefined ? <Text style={styles.meta}>Target resale ${item.targetResalePrice.toFixed(2)}</Text> : null}
                  </View>
                  <View style={styles.check}>
                    <Text style={styles.checkText}>{active ? '✓' : '+'}</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
};
