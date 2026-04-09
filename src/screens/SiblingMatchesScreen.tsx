import React, { useCallback, useEffect, useMemo } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState } from '@/components/EmptyState';
import { SiblingMatchGroupCard } from '@/components/SiblingMatchGroupCard';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { hasProAccess } from '@/services/proAccess';
import { useAppTheme } from '@/theme';
import { splitSiblingMatchGroups, groupItemsByStyle, getSiblingMatchVisibleState } from '@/utils/siblingMatches';
import { StyleSheet, Text, View } from 'react-native';

type Props = NativeStackScreenProps<ClosetStackParamList, 'SiblingMatches'>;

export const SiblingMatchesScreen: React.FC<Props> = ({ navigation }) => {
  const theme = useAppTheme();
  const { children, items, settings, purchaseState, logEvent } = useData();
  const isPro = hasProAccess(settings, purchaseState);
  const visibleChildren = useMemo(() => children.filter((child) => !child.deletedAt), [children]);
  const siblingMatchingAvailable = visibleChildren.length >= 2;

  const allGroups = useMemo(() => groupItemsByStyle(items, children), [items, children]);
  const { visibleGroups, lockedGroups } = useMemo(() => getSiblingMatchVisibleState(allGroups, isPro, 3), [allGroups, isPro]);
  const sections = useMemo(() => splitSiblingMatchGroups(visibleGroups), [visibleGroups]);
  const hasVisiblePartialMatches = visibleChildren.length >= 3 && sections.missing.length > 0;
  const subtitle = hasVisiblePartialMatches
    ? "See matching prints across your kids — and who's missing one."
    : 'See matching prints and styles across your kids.';

  const styles = StyleSheet.create({
    section: {
      gap: 12,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
  });

  const openPaywall = useCallback(async () => {
    await logEvent('pro_gate_viewed_from_matches', { source: 'sibling_matches_screen' });
    navigation.navigate('ProPaywall', { source: 'sibling_matching', entryContext: 'sibling_matching' });
  }, [logEvent, navigation]);

  const addMissingToWishlist = useCallback(async (childId: string, itemId: string) => {
    await logEvent('missing_match_clicked', { childId, itemId, source: 'sibling_matches_screen' });
    navigation.navigate('AddItem', {
      duplicateFromItemId: itemId,
      prefillStatus: 'wishlist',
      prefillChildId: childId,
      shoppingMode: true,
    });
  }, [logEvent, navigation]);

  const openItemDetail = useCallback(async (itemId: string) => {
    await logEvent('sibling_match_item_opened', { itemId, source: 'sibling_matches_screen' });
    navigation.navigate('ItemDetail', { itemId });
  }, [logEvent, navigation]);

  useEffect(() => {
    if (siblingMatchingAvailable) return;
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation, siblingMatchingAvailable]);

  useEffect(() => {
    if (!siblingMatchingAvailable) return;
    void logEvent('sibling_matches_viewed', {
      childCount: visibleChildren.length,
      visibleGroupCount: visibleGroups.length,
      partialVisibleGroupCount: sections.missing.length,
      empty: visibleGroups.length === 0,
    });
  }, [logEvent, siblingMatchingAvailable, sections.missing.length, visibleChildren.length, visibleGroups.length]);

  useEffect(() => {
    if (!siblingMatchingAvailable || visibleGroups.length === 0) return;
    void logEvent('sibling_match_group_rendered', {
      count: visibleGroups.length,
      partialCount: sections.missing.length,
      fullCount: sections.complete.length,
    });
    if (sections.missing.length > 0) {
      void logEvent('sibling_partial_match_rendered', { count: sections.missing.length });
      void logEvent('sibling_gap_shown', {
        count: sections.missing.reduce((sum, group) => sum + group.missingChildren.length, 0),
      });
    }
  }, [logEvent, sections.complete.length, sections.missing, siblingMatchingAvailable, visibleGroups.length]);

  useEffect(() => {
    if (!siblingMatchingAvailable || allGroups.length > 0) return;
    void logEvent('sibling_match_empty_state_viewed', { childCount: visibleChildren.length });
  }, [allGroups.length, logEvent, siblingMatchingAvailable, visibleChildren.length]);

  if (!siblingMatchingAvailable) {
    return (
      <Screen>
        <View />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.section}>
        <Text style={styles.title}>Sibling matches</Text>
        <Text style={styles.body}>{subtitle}</Text>
      </View>

      {!allGroups.length ? (
        <EmptyState
          title="No sibling matches yet"
          subtitle="When two or more kids share a print or style, it'll show up here."
        />
      ) : null}

      {sections.complete.length ? (
        <View style={styles.section}>
          <Text style={styles.title}>Complete matches</Text>
          {sections.complete.map((group) => (
            <SiblingMatchGroupCard key={group.groupId} group={group} onOpenItem={openItemDetail} />
          ))}
        </View>
      ) : null}

      {sections.missing.length ? (
        <View style={styles.section}>
          <Text style={styles.title}>Missing matches</Text>
          {sections.missing.map((group) => (
            <SiblingMatchGroupCard
              key={group.groupId}
              group={group}
              showActions={isPro}
              onOpenItem={openItemDetail}
              onAddMissingToWishlist={(childId) => addMissingToWishlist(childId, group.representativeItemId)}
            />
          ))}
        </View>
      ) : null}

      {lockedGroups.map((group) => (
        <SiblingMatchGroupCard key={`${group.groupId}-locked`} group={group} locked onUnlock={openPaywall} showActions={false} />
      ))}
    </Screen>
  );
};
