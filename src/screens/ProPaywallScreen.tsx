import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { appConfig } from '@/config';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { resolvePaywallTrigger, trackProPaywallViewed, trackProPurchaseCompleted, trackProPurchaseFailed, trackProPurchaseRestored, trackProPurchaseStarted } from '@/services/bst/bstAnalytics';
import { ProPaywallOption, getBstProPaywallOptions, purchasePackage, restorePurchases } from '@/services/purchases';
import { hasProAccess } from '@/services/proAccess';
import { useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<ClosetStackParamList, 'ProPaywall'>;

export const ProPaywallScreen: React.FC<Props> = ({ navigation, route }) => {
  const theme = useAppTheme();
  const { refreshPurchaseState, logEvent, settings, purchaseState } = useData();
  const [options, setOptions] = useState<ProPaywallOption[]>([]);
  const [selectedKind, setSelectedKind] = useState<ProPaywallOption['kind']>('lifetime');
  const [loading, setLoading] = useState(false);
  const isPro = hasProAccess(settings, purchaseState);
  const didLogViewRef = React.useRef(false);
  const trigger = resolvePaywallTrigger(route.params?.source);

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
      kind: 'lifetime' as const,
      title: '$9.99 lifetime',
      subtitle: 'Early access lifetime',
      priceString: '$9.99 one-time',
      badge: 'Early access',
      available: false,
    },
    [options, selectedKind],
  );
  const headline = 'Finish your BST post in seconds';
  const subtext = 'Generate cards for all items, create unlimited drafts, and add multiple photos per item.';

  const styles = StyleSheet.create({
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary,
    },
    bullet: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textPrimary,
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
        <Text style={styles.body}>{subtext}</Text>
      </Card>

      <Card>
        <Text style={styles.bullet}>• Cards for every item</Text>
        <Text style={styles.bullet}>• Unlimited sale drafts</Text>
        <Text style={styles.bullet}>• Add multiple photos per item</Text>
      </Card>

      <Card>
        <Text style={styles.comingSoonTitle}>Coming soon</Text>
        <Text style={styles.comingSoonText}>• Match outfits across siblings</Text>
        <Text style={styles.comingSoonText}>• Find wardrobe gaps automatically</Text>
      </Card>

      <View style={styles.options}>
        {options.map((option) => {
          const active = option.kind === selectedKind;
          return (
            <Pressable key={option.kind} onPress={() => setSelectedKind(option.kind)}>
              <Card style={[styles.optionCard, active ? styles.optionCardActive : undefined]}>
                {option.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{option.badge}</Text>
                  </View>
                ) : null}
                <Text style={styles.optionTitle}>{option.kind === 'monthly' ? 'Monthly subscription' : 'Early access lifetime'}</Text>
                <Text style={styles.optionPrice}>{option.priceString}</Text>
                {option.subtitle ? <Text style={styles.optionMeta}>{option.subtitle}</Text> : null}
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <PrimaryButton label={loading ? 'Please wait…' : 'Unlock Pro'} onPress={() => void handleUnlock()} disabled={loading} />
        <PrimaryButton label="Restore purchases" variant="secondary" onPress={() => void handleRestore()} disabled={loading} />
      </Card>
    </Screen>
  );
};
