import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProComingSoonModal } from '@/components/ProComingSoonModal';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { trackBstSecondDraftBlocked } from '@/services/bst/bstAnalytics';
import { countActiveSaleDrafts, FREE_BST_DRAFT_LIMIT } from '@/services/bst/bstLimits';
import { buildSaleDraftName } from '@/services/bst/draft';
import { canCreateMultipleDrafts, hasProAccess } from '@/services/proAccess';
import { useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<ClosetStackParamList, 'BstSaleDraftList'>;

export const BstSaleDraftListScreen: React.FC<Props> = ({ navigation }) => {
  const { saleDrafts, saleDraftItems, settings, purchaseState, logEvent } = useData();
  const theme = useAppTheme();
  const [showProModal, setShowProModal] = useState(false);
  const canCreateMoreDrafts = canCreateMultipleDrafts(settings, purchaseState);
  const isPro = hasProAccess(settings, purchaseState);
  const activeDraftCount = countActiveSaleDrafts(saleDrafts);
  const draftCards = useMemo(
    () => saleDrafts.map((draft) => ({
      draft,
      itemCount: saleDraftItems.filter((item) => item.saleDraftId === draft.id && item.included).length,
    })),
    [saleDraftItems, saleDrafts],
  );

  const styles = StyleSheet.create({
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    body: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    lockedTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    draftTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    meta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
  });

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>BST Sale Drafts</Text>
        <Text style={styles.body}>Sell Bin holds items you might sell. BST Sale Drafts are the actual purge posts you are preparing right now.</Text>
        {!canCreateMoreDrafts ? (
          <Text style={styles.body}>
            Free includes {FREE_BST_DRAFT_LIMIT} active BST draft at a time. If you want to start another, unlock Pro for unlimited drafts.
          </Text>
        ) : null}
        {!canCreateMoreDrafts ? (
          <Text style={styles.body}>
            Free drafts are meant to stay in progress while you prep your sale. Draft deletion is available on Pro.
          </Text>
        ) : null}
        <PrimaryButton
          label="New BST Sale Draft"
          onPress={() => {
            if (!canCreateMoreDrafts && activeDraftCount >= FREE_BST_DRAFT_LIMIT) {
              void trackBstSecondDraftBlocked(logEvent, {
                itemCount: activeDraftCount,
                isPro,
                triggeredFrom: 'draft_list',
              });
              navigation.navigate('ProPaywall', { source: 'bst_draft_limit' });
              return;
            }
            navigation.navigate('BstSaleDraftCreate');
          }}
        />
        {!canCreateMoreDrafts ? <PrimaryButton label="See Pro options" variant="secondary" onPress={() => navigation.navigate('ProPaywall', { source: 'bst_draft_limit' })} /> : null}
      </Card>

      {draftCards.length === 0 ? (
        <EmptyState title="No BST sale drafts yet" subtitle="Choose items from your Sell Bin to create a dedicated BST draft for a specific purge or post." />
      ) : (
        draftCards.map(({ draft, itemCount }) => (
          <Pressable
            key={draft.id}
            onPress={() => navigation.navigate('BstSaleDraftEditor', { draftId: draft.id })}
          >
            <Card>
              <Text style={styles.draftTitle}>{buildSaleDraftName(draft)}</Text>
              <Text style={styles.meta}>{itemCount} item{itemCount === 1 ? '' : 's'} included</Text>
              <Text style={styles.meta}>Updated {new Date(draft.updatedAt).toLocaleString()}</Text>
            </Card>
          </Pressable>
        ))
      )}

      <ProComingSoonModal visible={showProModal} onClose={() => setShowProModal(false)} onFeedback={undefined} />
    </Screen>
  );
};
