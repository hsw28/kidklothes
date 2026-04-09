import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { FoundingOfferSurface, getFoundingOfferEligibility, isEligibleForFoundingOffer } from '@/services/foundingOffer';
import { FoundingMemberOfferSummary, ProPaywallOption, getBstProPaywallOptions, getFoundingMemberYearlyOffer, purchasePackage, restorePurchases } from '@/services/purchases';
import { hasProAccess } from '@/services/proAccess';
import { useAppTheme } from '@/theme';
import { getItemDisplayImageUri } from '@/utils/itemMedia';

type Props = NativeStackScreenProps<ClosetStackParamList, 'ProPaywall'>;

type PaywallEntryContext = 'bst' | 'sibling_matching' | 'photo_expansion' | 'closet_power' | 'tag_power' | 'generic_pro';

type PaywallContent = {
  badge?: string;
  title: string;
  subtitle: string;
  primaryBullets: string[];
  secondaryHeader?: string;
  secondaryBullets: string[];
  optionalComingSoon?: {
    header: string;
    bullets: string[];
  };
  ctaSubtext?: string;
};

const paywallContent: Record<PaywallEntryContext, PaywallContent> = {
  bst: {
    title: 'Unlock Pro',
    subtitle: 'Generate cards for all items, create unlimited drafts, and add multiple photos per item.',
    primaryBullets: [
      'Cards for every item',
      'Unlimited sale drafts',
      'Add multiple photos per item',
    ],
    secondaryBullets: [],
    ctaSubtext: 'Unlock selling tools and more',
  },
  sibling_matching: {
    title: 'See matching outfits across kids',
    subtitle: 'See shared prints and styles in one place.',
    primaryBullets: [
      'See matching outfits across siblings',
      'Spot shared prints and styles in one place',
      'Add missing items straight to wishlist',
    ],
    secondaryHeader: 'Everything you unlock with Pro',
    secondaryBullets: [
      'Create your own categories',
      'Sell items with ready-to-post BST listings',
      'See matching outfits across kids',
      'Add multiple photos per item',
      'Keep preset tags and unlock custom ones',
    ],
    ctaSubtext: 'Unlock matching and more',
  },
  photo_expansion: {
    title: 'Add more photos to every item',
    subtitle: 'Show more detail and improve your listings',
    primaryBullets: [
      'Multiple photos per item',
      'More item detail',
      'Stronger sale posts',
    ],
    secondaryHeader: 'Everything you unlock with Pro',
    secondaryBullets: [
      'Create your own categories',
      'Sell items with ready-to-post BST listings',
      'See matching outfits across kids',
      'Add multiple photos per item',
      'Keep preset tags and unlock custom ones',
    ],
  },
  closet_power: {
    title: 'Create your own categories',
    subtitle: 'Organize your closet with categories like Sports, Uniforms, Dance, Holiday, or Hand-me-downs.',
    primaryBullets: [
      'Custom categories',
      'Advanced tags and filters',
      'Faster item search',
    ],
    secondaryHeader: 'Everything you unlock with Pro',
    secondaryBullets: [
      'Create your own categories',
      'Sell items with ready-to-post BST listings',
      'See matching outfits across kids',
      'Add multiple photos per item',
      'Keep preset tags and unlock custom ones',
    ],
  },
  generic_pro: {
    title: 'Unlock Pro',
    subtitle: 'Get more out of your closet with tools that help you organize faster and sell with less work.',
    primaryBullets: [
      'Create your own categories',
      'Sell items with ready-to-post BST listings',
      'See matching outfits across kids',
    ],
    secondaryHeader: 'Everything you unlock with Pro',
    secondaryBullets: [
      'Create your own categories',
      'Sell items with ready-to-post BST listings',
      'See matching outfits across kids',
      'Add multiple photos per item',
      'Keep preset tags and unlock custom ones',
    ],
  },
  tag_power: {
    title: 'Find anything in seconds',
    subtitle: 'Create your own tags so you can instantly pull up outfits for school, travel, photos, and more.',
    primaryBullets: [
      'Create custom tags that fit your family',
      'Reuse tags across items',
      'Keep special-use outfits easy to find',
    ],
    secondaryHeader: 'Everything you unlock with Pro',
    secondaryBullets: [
      'Create your own categories',
      'Sell items with ready-to-post BST listings',
      'See matching outfits across kids',
      'Add multiple photos per item',
      'Keep preset tags and unlock custom ones',
    ],
  },
};

const foundingPaywallContent: PaywallContent = {
  badge: 'Founding Member pricing',
  title: 'Become a Founding Member',
  subtitle: 'Get early access to Pro at a special rate while Layette Out is still growing.',
  primaryBullets: [
    'Create your own categories',
    'Sell items with ready-to-post BST listings',
    'See matching outfits across kids',
    'Add multiple photos per item',
    'Unlock custom tags and stronger filters',
  ],
  ctaSubtext: 'Founder price $9.99 first year',
  secondaryHeader: 'Everything you unlock with Pro',
  secondaryBullets: [
    'Create your own categories',
    'Sell items with ready-to-post BST listings',
    'See matching outfits across kids',
    'Add multiple photos per item',
    'Keep preset tags and unlock custom ones',
  ],
};

export const ProPaywallScreen: React.FC<Props> = ({ navigation, route }) => {
  const theme = useAppTheme();
  const { refreshPurchaseState, logEvent, getEventCount, updateSettings, settings, purchaseState, saleDrafts, saleDraftItems, items } = useData();
  const [options, setOptions] = useState<ProPaywallOption[]>([]);
  const [foundingOffer, setFoundingOffer] = useState<FoundingMemberOfferSummary>({ status: 'inactive' });
  const [foundingEligible, setFoundingEligible] = useState(false);
  const [selectedKind, setSelectedKind] = useState<ProPaywallOption['kind']>('yearly');
  const [loading, setLoading] = useState(false);
  const isPro = hasProAccess(settings, purchaseState);
  const didLogViewRef = React.useRef(false);
  const didLogFoundingViewRef = React.useRef(false);
  const didLogFoundingCheckedRef = React.useRef(false);
  const trigger = resolvePaywallTrigger(route.params?.source);
  const entryContext: PaywallEntryContext = useMemo(() => {
    if (route.params?.entryContext) return route.params.entryContext;
    if (route.params?.source === 'sibling_matching') return 'sibling_matching';
    if (route.params?.source === 'item_multi_photo') return 'photo_expansion';
    if ((route.params?.source ?? '').startsWith('bst_')) return 'bst';
    return 'closet_power';
  }, [route.params?.entryContext, route.params?.source]);
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
    let cancelled = false;
    void (async () => {
      const [next, foundingSummary, foundingEligibility] = await Promise.all([
        getBstProPaywallOptions(),
        getFoundingMemberYearlyOffer(),
        getFoundingOfferEligibility({
          settings,
          purchaseState,
          itemCount: items.length,
          getEventCount,
        }),
      ]);
      if (cancelled) return;
      setOptions(next);
      setFoundingOffer(foundingSummary);
      const eligible = isEligibleForFoundingOffer(foundingEligibility);
      setFoundingEligible(eligible);
      if (eligible) {
        void logEvent('founding_offer_eligible', {
          source: (route.params?.source ?? 'paywall') as FoundingOfferSurface | string,
          reasons: foundingEligibility.reasons,
        });
      }
      if (!didLogFoundingCheckedRef.current) {
        didLogFoundingCheckedRef.current = true;
        void logEvent('founding_offer_checked', {
          source: route.params?.source ?? 'paywall',
          eligible,
          introOfferPresent: foundingSummary.status === 'available',
        });
        void logEvent(
          foundingSummary.status === 'available' && eligible
            ? 'founding_offer_available'
            : 'founding_offer_unavailable',
          {
            source: route.params?.source ?? 'paywall',
            eligible,
            introOfferPresent: foundingSummary.status === 'available',
          },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    getEventCount,
    items.length,
    logEvent,
    route.params?.source,
    purchaseState?.isEntitled,
    settings.guidedOnboarding,
    settings.guidedOnboardingCompleted,
    settings.developerModeEnabled,
    settings.developerForceProAccessEnabled,
  ]);

  useEffect(() => {
    if (didLogViewRef.current) return;
    didLogViewRef.current = true;
    void trackProPaywallViewed(logEvent, {
      isPro,
      triggeredFrom: route.params?.source ?? 'unknown',
      source: route.params?.source,
      trigger,
    });
    void logEvent('paywall_viewed', { entryContext, source: route.params?.source });
  }, [entryContext, isPro, logEvent, route.params?.source, trigger]);

  const isPhotoPaywall = route.params?.source === 'item_multi_photo';
  const isBstCardUnlockPaywall = route.params?.source === 'bst_locked_card' || route.params?.source === 'bst_save_all_cards' || route.params?.source === 'bst_save_collage_locked';
  const foundingVisible = foundingEligible && foundingOffer.status === 'available' && !isPro;

  useEffect(() => {
    const yearlyOption = options.find((entry) => entry.kind === 'yearly');
    const payload = {
      source: route.params?.source ?? 'paywall',
      yearlyPackageIdentifier: yearlyOption?.packageIdentifier ?? '',
      yearlyProductId: yearlyOption?.productId ?? '',
      yearlyPriceString: yearlyOption?.priceString ?? '',
      foundingOfferStatus: foundingOffer.status,
      foundingOfferPriceString: foundingOffer.discountedPriceString ?? '',
      foundingEligible,
      isPro,
      isBstCardUnlockPaywall,
      foundingVisible,
    };
    if (__DEV__) {
      console.info('[founding-intro] paywall display gate', payload);
    }
    void logEvent('intro_offer_display_gate_debug', payload);
  }, [
    foundingEligible,
    foundingOffer.discountedPriceString,
    foundingOffer.status,
    foundingVisible,
    isBstCardUnlockPaywall,
    isPro,
    logEvent,
    options,
    route.params?.source,
  ]);

  useEffect(() => {
    if (didLogFoundingViewRef.current || !foundingVisible) return;
    didLogFoundingViewRef.current = true;
    void logEvent('founding_offer_displayed', { source: route.params?.source ?? 'paywall' });
  }, [foundingVisible, logEvent, route.params?.source]);

  const displayOptions = useMemo(() => {
    if (!foundingVisible || foundingOffer.status !== 'available') return options;
    return options.map((entry) => {
      if (entry.kind !== 'yearly') return entry;
      return {
        ...entry,
        priceString: foundingOffer.discountedPriceString || entry.priceString,
        badge: 'Founding pricing',
        subtitle: 'Special first-year pricing',
      };
    });
  }, [foundingOffer, foundingVisible, options]);
  const foundingIntroPrice = foundingOffer.discountedPriceString || '$9.99';
  const selectedOption = useMemo(
    () => displayOptions.find((entry) => entry.kind === selectedKind) ?? {
      kind: 'yearly' as const,
      title: 'Yearly',
      subtitle: '$1.67/month • Save ~45%',
      priceString: foundingVisible ? foundingIntroPrice : '$19.99 / year',
      badge: 'Most popular',
      available: false,
    },
    [displayOptions, foundingIntroPrice, foundingVisible, selectedKind],
  );
  const bstSelectedOption = useMemo(
    () => options.find((entry) => entry.kind === 'yearly')
      ?? options.find((entry) => entry.kind === 'monthly')
      ?? options[0]
      ?? selectedOption,
    [options, selectedOption],
  );
  const totalItems = route.params?.totalItems ?? paywallDraftItems.length ?? 0;
  const contextualCopy = entryContext === 'bst'
    ? paywallContent[entryContext]
    : foundingVisible
      ? foundingPaywallContent
      : paywallContent[entryContext];
  const headline = contextualCopy.title;
  const subtext = !foundingVisible && entryContext === 'bst' && isPhotoPaywall
    ? 'Free includes 1 photo per item. Unlock more with Pro.'
    : contextualCopy.subtitle;
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
  const isPlaceholderPrice = (value?: string) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return !normalized || normalized === 'price shown at checkout';
  };
  const foundingYearlyBasePrice = useMemo(() => {
    const yearlyOption = options.find((entry) => entry.kind === 'yearly');
    return isPlaceholderPrice(yearlyOption?.priceString) ? '$19.99 / year' : String(yearlyOption?.priceString ?? '$19.99 / year');
  }, [options]);

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
    sectionLabel: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    foundingEyebrow: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.colors.accentPeriwinkle,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
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
    foundingPriceStack: {
      gap: 4,
    },
    foundingPriceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
      flexWrap: 'wrap',
    },
    foundingOriginalPrice: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textDecorationLine: 'line-through',
    },
    foundingIntroPrice: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    foundingSavings: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.accentPeriwinkle,
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
    ctaContext: {
      fontSize: 13,
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    secondarySection: {
      gap: 8,
    },
    secondaryBullet: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    pricingSummaryCard: {
      gap: 8,
    },
    pricingSummaryPrimary: {
      fontSize: 19,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    pricingSummaryValue: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    pricingSummaryAlt: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    restoreButton: {
      alignItems: 'center',
      paddingVertical: 8,
    },
  });

  const handleUnlock = async () => {
    const purchaseOption = isBstCardUnlockPaywall ? bstSelectedOption : selectedOption;
    await logEvent('bst_paywall_unlock_tapped', { source: route.params?.source, selectedKind: purchaseOption.kind });
    await logEvent('paywall_cta_clicked', { entryContext, source: route.params?.source, selectedKind: purchaseOption.kind });
    const foundingYearlySelected = foundingVisible && purchaseOption.kind === 'yearly' && foundingOffer.status === 'available';
    if (foundingYearlySelected) {
      await logEvent('founding_offer_cta_tapped', {
        source: route.params?.source ?? 'paywall',
        selectedKind: purchaseOption.kind,
      });
      await logEvent('founding_offer_purchase_started', {
        source: route.params?.source ?? 'paywall',
        selectedKind: purchaseOption.kind,
      });
    }
    await trackProPurchaseStarted(logEvent, {
      isPro,
      triggeredFrom: route.params?.source ?? 'paywall',
      source: route.params?.source,
      trigger,
      productId: purchaseOption.productId,
      packageIdentifier: purchaseOption.packageIdentifier,
    });
    if (!purchaseOption.available || !purchaseOption.packageIdentifier || !appConfig.monetizationEnabled) {
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
    const result = await purchasePackage(purchaseOption.packageIdentifier);
    await refreshPurchaseState();
    if (foundingYearlySelected && result.status === 'success' && result.entitlementActive) {
      await updateSettings({ foundingMemberJoined: true });
      await logEvent('founding_offer_purchase_completed', {
        source: route.params?.source ?? 'paywall',
        selectedKind: purchaseOption.kind,
      });
    }
    setLoading(false);
    if (result.status === 'success') {
      await trackProPurchaseCompleted(logEvent, {
        isPro: true,
        triggeredFrom: route.params?.source ?? 'paywall',
        source: route.params?.source,
        trigger,
        productId: purchaseOption.productId,
        packageIdentifier: purchaseOption.packageIdentifier,
      });
      Alert.alert('Pro unlocked', 'Pro is now available on this device.');
      navigation.goBack();
      return;
    }
    if (result.status === 'cancelled') return;
    await trackProPurchaseFailed(logEvent, {
      isPro,
      triggeredFrom: route.params?.source ?? 'paywall',
      source: route.params?.source,
      trigger,
      productId: purchaseOption.productId,
      packageIdentifier: purchaseOption.packageIdentifier,
      reason: result.errorCode || result.errorMessage || 'purchase_failed',
    });
    Alert.alert('Purchase failed', result.errorMessage || 'Please try again.');
  };

  const handleRestore = async () => {
    setLoading(true);
    const result = await restorePurchases();
    await refreshPurchaseState();
    setLoading(false);
    if (result.status === 'success' && result.entitlementActive) {
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
    if (result.status === 'success' && !result.entitlementActive) {
      Alert.alert('No purchases found', result.errorMessage || 'No previous Pro purchase was found for this Apple account.');
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

  const handleDismiss = useCallback(async () => {
    await logEvent('paywall_dismissed', { entryContext, source: route.params?.source });
    if (foundingVisible && selectedKind === 'yearly') {
      await logEvent('founding_offer_declined', { source: route.params?.source ?? 'paywall' });
    }
    navigation.goBack();
  }, [entryContext, foundingVisible, logEvent, navigation, route.params?.source, selectedKind]);

  return (
    <Screen>
      <Card>
        {contextualCopy.badge ? <Text style={styles.foundingEyebrow}>{contextualCopy.badge}</Text> : null}
        <Text style={styles.title}>{headline}</Text>
        {!isBstCardUnlockPaywall ? <Text style={styles.body}>{subtext}</Text> : null}
      </Card>

      {isBstCardUnlockPaywall ? (
        <Card>
          <Text style={styles.heroTitle}>Finish your BST post</Text>
          <Text style={styles.body}>{`You're viewing ${FREE_BST_ITEM_CARD_LIMIT} of ${totalItems} items`}</Text>
          <Text style={styles.sectionLabel}>Unlock:</Text>
          <Text style={styles.bullet}>• All item cards (not just 2)</Text>
          <Text style={styles.bullet}>• Clean collage images</Text>
          <Text style={styles.bullet}>• Copy-ready comments</Text>
          <View style={styles.secondarySection}>
            <Text style={styles.sectionLabel}>Everything you unlock with Pro</Text>
            <Text style={styles.secondaryBullet}>• Create your own categories</Text>
            <Text style={styles.secondaryBullet}>• Sell items with ready-to-post BST listings</Text>
            <Text style={styles.secondaryBullet}>• See matching outfits across kids</Text>
            <Text style={styles.secondaryBullet}>• Add multiple photos per item</Text>
            <Text style={styles.secondaryBullet}>• Keep preset tags and unlock custom ones</Text>
          </View>
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

      {!isBstCardUnlockPaywall ? (
        <Card>
          {contextualCopy.primaryBullets.map((bullet) => (
            <Text key={bullet} style={styles.bullet}>• {bullet}</Text>
          ))}
        </Card>
      ) : null}

      {!isBstCardUnlockPaywall && contextualCopy.secondaryBullets.length ? (
        <Card>
          {contextualCopy.secondaryHeader ? <Text style={styles.sectionLabel}>{contextualCopy.secondaryHeader}</Text> : null}
          {contextualCopy.secondaryBullets.map((bullet) => (
            <Text key={bullet} style={styles.secondaryBullet}>• {bullet}</Text>
          ))}
        </Card>
      ) : null}

      {isBstCardUnlockPaywall ? (
        <Card style={styles.pricingSummaryCard}>
          <Text style={styles.pricingSummaryPrimary}>Unlock all items in this post</Text>
          {foundingVisible ? (
            <View style={styles.foundingPriceStack}>
              <View style={[styles.foundingPriceRow, { justifyContent: 'center' }]}>
                <Text style={styles.foundingOriginalPrice}>{foundingYearlyBasePrice}</Text>
                <Text style={styles.foundingIntroPrice}>{foundingIntroPrice}</Text>
              </View>
              <Text style={styles.foundingSavings}>Founder price (first year)</Text>
            </View>
          ) : (
            <Text style={styles.pricingSummaryValue}>{foundingYearlyBasePrice.replace(' / year', '')}</Text>
          )}
          <Text style={styles.pricingSummaryValue}>Include all items + remove watermark overlay</Text>
          <Text style={styles.pricingSummaryAlt}>or $2.99/month</Text>
        </Card>
      ) : (
        <View style={styles.options}>
          {displayOptions.map((option) => {
            const active = option.kind === selectedKind;
            const featured = option.kind === 'yearly';
            const fallbackDisplay = bstDisplayCopyByKind[option.kind];
            const isFoundingYearlyCard = foundingVisible && option.kind === 'yearly';
            const display = {
              title: option.title?.trim() || fallbackDisplay.title,
              price: isPlaceholderPrice(option.priceString) ? fallbackDisplay.price : option.priceString,
              subtitle: option.subtitle?.trim() || fallbackDisplay.subtitle,
              badge: option.badge ?? fallbackDisplay.badge,
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
                  {isFoundingYearlyCard ? (
                    <View style={styles.foundingPriceStack}>
                      <View style={styles.foundingPriceRow}>
                        <Text style={styles.foundingOriginalPrice}>{foundingYearlyBasePrice}</Text>
                        <Text style={styles.foundingIntroPrice}>{display.price}</Text>
                      </View>
                      <Text style={styles.foundingSavings}>Founder price $9.99 first year</Text>
                    </View>
                  ) : (
                    <Text style={styles.optionPrice}>{display.price}</Text>
                  )}
                  <Text style={styles.optionMeta}>{display.subtitle}</Text>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}

      <Card>
        <PrimaryButton
          label={
            isBstCardUnlockPaywall
              ? (loading ? 'Please wait…' : 'Unlock all items in this post')
              : foundingVisible
                ? selectedKind === 'yearly'
                  ? (loading ? 'Please wait…' : 'Get founding price')
                  : loading
                    ? 'Please wait…'
                    : 'Unlock Pro'
                : loading
                  ? 'Please wait…'
                  : 'Unlock Pro'
          }
          onPress={() => void handleUnlock()}
          disabled={loading}
        />
        {isBstCardUnlockPaywall ? <Text style={styles.ctaNote}>Unlock instantly</Text> : null}
        {isBstCardUnlockPaywall && foundingVisible ? (
          <Text style={styles.ctaContext}>Then $19.99/year after</Text>
        ) : null}
        {!isBstCardUnlockPaywall && foundingVisible && selectedKind === 'yearly' ? (
          <Text style={styles.ctaContext}>Then $19.99/year after</Text>
        ) : !isBstCardUnlockPaywall && contextualCopy.ctaSubtext ? (
          <Text style={styles.ctaContext}>{contextualCopy.ctaSubtext}</Text>
        ) : null}
        <PrimaryButton label="Not now" variant="secondary" onPress={() => void handleDismiss()} disabled={loading} />
        <Pressable style={styles.restoreButton} onPress={() => void handleRestore()} disabled={loading}>
          <Text style={styles.optionMeta}>Restore purchases</Text>
        </Pressable>
      </Card>
    </Screen>
  );
};
