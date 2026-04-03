import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { appConfig } from '@/config';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { resolvePaywallTrigger, trackProPaywallViewed, trackProPurchaseCompleted, trackProPurchaseFailed, trackProPurchaseRestored, trackProPurchaseStarted } from '@/services/bst/bstAnalytics';
import { FREE_BST_ITEM_CARD_LIMIT } from '@/services/bst/bstLimits';
import { ProPaywallOption, getBstProPaywallOptions, purchasePackage, restorePurchases } from '@/services/purchases';
import { hasProAccess } from '@/services/proAccess';
import { useAppTheme } from '@/theme';
import { getItemDisplayImageUri } from '@/utils/itemMedia';

type Props = NativeStackScreenProps<ClosetStackParamList, 'ProPaywall'>;

export const ProPaywallScreen: React.FC<Props> = ({ navigation, route }) => {
  const theme = useAppTheme();
  const { refreshPurchaseState, logEvent, settings, purchaseState, saleDrafts, saleDraftItems, items } = useData();
  const [options, setOptions] = useState<ProPaywallOption[]>([]);
  const [selectedKind, setSelectedKind] = useState<ProPaywallOption['kind']>('yearly');
  const [loading, setLoading] = useState(false);
  const isPro = hasProAccess(settings, purchaseState);
  const didLogViewRef = React.useRef(false);
  const trigger = resolvePaywallTrigger(route.params?.source);
  const paywallDraft = saleDrafts.find((entry) => entry.id === route.params?.draftId);
  const paywallDraftItems = useMemo(
    () => (paywallDraft ? saleDraftItems.filter((entry) => entry.saleDraftId === paywallDraft.id && entry.included).sort((a, b) => a.listingOrder - b.listingOrder) : []),
    [paywallDraft, saleDraftItems],
  );
  const previewItems = useMemo(
    () =>
      paywallDraftItems.map((draftItem) => {
        const item = items.find((entry) => entry.id === draftItem.itemId);
        return item
          ? {
              draftItemId: draftItem.id,
              itemNumber: draftItem.itemNumber,
              imageUri: draftItem.selectedPhotoUri || getItemDisplayImageUri(item),
              locked: draftItem.itemNumber > FREE_BST_ITEM_CARD_LIMIT,
            }
          : null;
      }).filter(Boolean) as Array<{ draftItemId: string; itemNumber: number; imageUri?: string; locked: boolean }>,
    [items, paywallDraftItems],
  );

  useEffect(() => {
    void (async () => {
      const next = await getBstProPaywallOptions();
      setOptions(next);
    })();
  }, []);

  useEffect(() => {
    if (didLogViewRef.current) return;
    didLogViewRef.current = true;
    void trackProPaywallViewed(logEvent, {
      isPro,
      triggeredFrom: route.params?.source ?? 'unknown',
      source: route.params?.source,
      trigger,
    });
  }, [isPro, logEvent, route.params?.source, trigger]);

  const selectedOption = useMemo(
    () => options.find((entry) => entry.kind === selectedKind) ?? {
      kind: 'yearly' as const,
      title: 'Yearly',
      subtitle: '$1.67/month • Save ~45%',
      priceString: '$19.99 / year',
      badge: 'Most popular',
      available: false,
    },
    [options, selectedKind],
  );
  const isPhotoPaywall = route.params?.source === 'item_multi_photo';
  const isBstCardUnlockPaywall = route.params?.source === 'bst_locked_card' || route.params?.source === 'bst_save_all_cards' || route.params?.source === 'bst_save_collage_locked';
  const totalItems = route.params?.totalItems ?? paywallDraftItems.length ?? 0;
  const headline = 'Unlock Pro';
  const subtext = isPhotoPaywall
    ? 'Free includes 1 photo per item.\nPro features coming soon'
    : isBstCardUnlockPaywall
      ? `Get all ${totalItems} items and export clean images`
      : 'Generate cards for all items, create unlimited drafts, and add multiple photos per item.';
  const selectedCtaLabel = loading
    ? 'Please wait…'
    : selectedKind === 'monthly'
      ? 'Start monthly plan'
      : selectedKind === 'yearly'
        ? 'Get yearly plan'
        : 'Unlock forever';
  const bstDisplayCopyByKind: Record<ProPaywallOption['kind'], { title: string; price: string; subtitle: string; badge?: string }> = {
    monthly: {
      title: 'Monthly',
      price: '$2.99 / month',
      subtitle: 'Cancel anytime',
    },
    yearly: {
      title: 'Yearly',
      price: '$19.99 / year',
      subtitle: '$1.67/month • Save ~45%',
      badge: 'Most popular',
    },
    lifetime: {
      title: 'Lifetime',
      price: '$29.99 one-time',
      subtitle: 'Pay once, use forever',
      badge: 'Limited time',
    },
  };

  const styles = StyleSheet.create({
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    body: {
      fontSize: 15,
      lineHeight: 21,
      color: theme.colors.textSecondary,
    },
    heroTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    heroSubheading: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    dynamicLine: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    bullet: {
      fontSize: 15,
      lineHeight: 21,
      color: theme.colors.textPrimary,
    },
    previewGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    previewCell: {
      width: '31%',
      aspectRatio: 0.78,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceMuted,
      position: 'relative',
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted,
    },
    previewNumber: {
      position: 'absolute',
      top: 8,
      left: 8,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: 'rgba(17,24,39,0.76)',
    },
    previewNumberText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '800',
    },
    previewLockedOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(17,24,39,0.34)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewLockedText: {
      fontSize: 22,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    options: {
      gap: 12,
    },
    optionCard: {
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    optionCardActive: {
      borderColor: theme.colors.accentCoral,
      backgroundColor: theme.colors.accentCoralSoft,
    },
    optionCardFeatured: {
      borderColor: theme.colors.accentPrimary,
      backgroundColor: theme.colors.background,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    optionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    optionPrice: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    optionMeta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    badge: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    ctaNote: {
      fontSize: 13,
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    comingSoonTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    comingSoonText: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
      opacity: 0.9,
    },
    restoreButton: {
      alignItems: 'center',
      paddingVertical: 8,
    },
  });

  const handleUnlock = async () => {
    await logEvent('bst_paywall_unlock_tapped', { source: route.params?.source, selectedKind: selectedOption.kind });
    await trackProPurchaseStarted(logEvent, {
      isPro,
      triggeredFrom: route.params?.source ?? 'paywall',
      source: route.params?.source,
      trigger,
      productId: selectedOption.productId,
      packageIdentifier: selectedOption.packageIdentifier,
    });
    if (!selectedOption.available || !selectedOption.packageIdentifier || !appConfig.monetizationEnabled) {
      await trackProPurchaseFailed(logEvent, {
        isPro,
        triggeredFrom: route.params?.source ?? 'paywall',
        source: route.params?.source,
        trigger,
        reason: 'purchases_not_ready',
      });
      Alert.alert('Purchases not ready', 'This build is showing the BST Pro paywall, but purchases are not configured yet.');
      return;
    }
    setLoading(true);
    const result = await purchasePackage(selectedOption.packageIdentifier);
    await refreshPurchaseState();
    setLoading(false);
    if (result.status === 'success') {
      await trackProPurchaseCompleted(logEvent, {
        isPro: true,
        triggeredFrom: route.params?.source ?? 'paywall',
        source: route.params?.source,
        trigger,
        productId: selectedOption.productId,
        packageIdentifier: selectedOption.packageIdentifier,
      });
      Alert.alert('Pro unlocked', 'BST Pro is now available on this device.');
      navigation.goBack();
      return;
    }
    if (result.status === 'cancelled') return;
    await trackProPurchaseFailed(logEvent, {
      isPro,
      triggeredFrom: route.params?.source ?? 'paywall',
      source: route.params?.source,
      trigger,
      productId: selectedOption.productId,
      packageIdentifier: selectedOption.packageIdentifier,
      reason: result.errorCode || result.errorMessage || 'purchase_failed',
    });
    Alert.alert('Purchase failed', result.errorMessage || 'Please try again.');
  };

  const handleRestore = async () => {
    setLoading(true);
    const result = await restorePurchases();
    await refreshPurchaseState();
    setLoading(false);
    if (result.status === 'success') {
      await trackProPurchaseRestored(logEvent, {
        isPro: result.entitlementActive,
        triggeredFrom: route.params?.source ?? 'paywall',
        source: route.params?.source,
        trigger,
      });
      Alert.alert('Restore complete', 'Purchases restored.');
      navigation.goBack();
      return;
    }
    await trackProPurchaseFailed(logEvent, {
      isPro,
      triggeredFrom: route.params?.source ?? 'paywall',
      source: route.params?.source,
      trigger,
      reason: result.errorCode || result.errorMessage || 'restore_failed',
    });
    Alert.alert('Restore failed', result.errorMessage || 'Please try again.');
  };

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>{headline}</Text>
        {!isBstCardUnlockPaywall ? <Text style={styles.body}>{subtext}</Text> : null}
      </Card>

      {isBstCardUnlockPaywall ? (
        <Card>
          <Text style={styles.heroTitle}>Finish your post</Text>
          <Text style={styles.heroSubheading}>{`Get all ${totalItems} items and export clean images`}</Text>
          <Text style={styles.body}>You’ve already built your post — unlock the rest to finish it</Text>
        </Card>
      ) : null}

      {!isBstCardUnlockPaywall ? (
        <Card>
          <Text style={styles.dynamicLine}>Finish your BST post in seconds</Text>
          <Text style={styles.body}>{subtext}</Text>
        </Card>
      ) : null}

      {isBstCardUnlockPaywall && previewItems.length ? (
        <Card>
          <View style={styles.previewGrid}>
            {previewItems.map((entry) => (
              <View key={entry.draftItemId} style={styles.previewCell}>
                {entry.imageUri ? (
                  <Image source={{ uri: entry.imageUri }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <View style={styles.previewFallback} />
                )}
                <View style={styles.previewNumber}>
                  <Text style={styles.previewNumberText}>#{entry.itemNumber}</Text>
                </View>
                {entry.locked ? (
                  <View style={styles.previewLockedOverlay}>
                    <Text style={styles.previewLockedText}>🔒</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        {isBstCardUnlockPaywall ? (
          <>
            <Text style={styles.bullet}>• All item cards</Text>
            <Text style={styles.bullet}>• Clean, watermark-free images</Text>
            <Text style={styles.bullet}>• Post-ready in seconds</Text>
          </>
        ) : (
          <>
            <Text style={styles.bullet}>• Cards for every item</Text>
            <Text style={styles.bullet}>• Unlimited sale drafts</Text>
            <Text style={styles.bullet}>• Add multiple photos per item</Text>
          </>
        )}
      </Card>

      {!isBstCardUnlockPaywall ? (
        <Card>
          <Text style={styles.comingSoonTitle}>Coming soon</Text>
          <Text style={styles.comingSoonText}>• Match outfits across siblings</Text>
          <Text style={styles.comingSoonText}>• Find wardrobe gaps automatically</Text>
        </Card>
      ) : null}

      <View style={styles.options}>
        {options.map((option) => {
          const active = option.kind === selectedKind;
          const featured = option.kind === 'yearly';
          const display = isBstCardUnlockPaywall
            ? bstDisplayCopyByKind[option.kind]
            : {
                title: option.title,
                price: option.priceString,
                subtitle: option.subtitle ?? '',
                badge: option.badge,
              };
          return (
            <Pressable key={option.kind} onPress={() => setSelectedKind(option.kind)}>
              <Card style={[styles.optionCard, featured ? styles.optionCardFeatured : undefined, active ? styles.optionCardActive : undefined]}>
                {display.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{display.badge}</Text>
                  </View>
                ) : null}
                <Text style={styles.optionTitle}>{display.title}</Text>
                <Text style={styles.optionPrice}>{display.price}</Text>
                <Text style={styles.optionMeta}>{display.subtitle}</Text>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <PrimaryButton label={isBstCardUnlockPaywall ? selectedCtaLabel : loading ? 'Please wait…' : 'Unlock Pro'} onPress={() => void handleUnlock()} disabled={loading} />
        {isBstCardUnlockPaywall ? <Text style={styles.ctaNote}>Unlock instantly</Text> : null}
        <PrimaryButton label="Not now" variant="secondary" onPress={() => navigation.goBack()} disabled={loading} />
        <Pressable style={styles.restoreButton} onPress={() => void handleRestore()} disabled={loading}>
          <Text style={styles.optionMeta}>Restore purchases</Text>
        </Pressable>
      </Card>
    </Screen>
  );
};
