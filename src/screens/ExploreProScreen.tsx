import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { SettingsStackParamList } from '@/navigation/types';
import { shouldSuppressFoundingOffer } from '@/services/foundingOffer';
import { getBstProPaywallOptions, getFoundingMemberYearlyOffer } from '@/services/purchases';
import { hasProAccess } from '@/services/proAccess';
import { useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<SettingsStackParamList, 'ExplorePro'>;

const featureCards = [
  {
    title: 'Avoid duplicate buys',
    body: 'Find what you already own instantly across sizes, prints, and brands.',
  },
  {
    title: 'Sell in minutes, not hours',
    body: 'Generate BST posts, images, and captions in one tap.',
  },
  {
    title: 'Match outfits across siblings instantly',
    body: 'Quickly spot shared prints and what’s missing.',
  },
  {
    title: 'Organize everything your way',
    body: 'Use custom categories, extra photos, and stronger organization tools.',
  },
];

export const ExploreProScreen: React.FC<Props> = ({ navigation }) => {
  const theme = useAppTheme();
  const { items, settings, purchaseState, getEventCount, logEvent } = useData();
  const [foundingVisible, setFoundingVisible] = useState(false);
  const [isFoundingMember, setIsFoundingMember] = useState(Boolean(settings.foundingMemberJoined));
  const [monthlyPrice, setMonthlyPrice] = useState('$2.99/month');
  const [yearlyPrice, setYearlyPrice] = useState('$19.99/year');
  const [lifetimePrice, setLifetimePrice] = useState('$29.99 one-time');
  const [foundingPrice, setFoundingPrice] = useState<string | null>(null);
  const proAccessEnabled = hasProAccess(settings, purchaseState);

  const styles = useMemo(() => StyleSheet.create({
    content: {
      gap: 14,
      paddingBottom: 24,
    },
    header: {
      gap: 6,
    },
    title: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    badge: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      color: theme.colors.accentPeriwinkle,
      letterSpacing: 0.2,
    },
    pricingCard: {
      gap: 12,
    },
    pricingRow: {
      gap: 4,
    },
    pricingLabel: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    pricingValue: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    pricingMeta: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    foundingPriceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
      flexWrap: 'wrap',
    },
    foundingOriginal: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textDecorationLine: 'line-through',
    },
    foundingCurrent: {
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    sectionTitle: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
      marginBottom: 6,
    },
    bullet: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textPrimary,
    },
    featureTitle: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      marginBottom: 4,
    },
    featureBody: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    trustText: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    ctaMeta: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
  }), [theme]);

  useEffect(() => {
    void logEvent('explore_pro_opened', { source: 'settings' });
  }, [logEvent]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [foundingSummary, paywallOptions] = await Promise.all([
        getFoundingMemberYearlyOffer(),
        getBstProPaywallOptions(),
      ]);
      if (cancelled) return;
      setFoundingVisible(
        foundingSummary.status === 'available'
        && !shouldSuppressFoundingOffer(settings, purchaseState),
      );
      setIsFoundingMember(Boolean(settings.foundingMemberJoined));
      setFoundingPrice(foundingSummary.status === 'available' ? foundingSummary.discountedPriceString ?? null : null);
      const monthly = paywallOptions.find((entry) => entry.kind === 'monthly')?.priceString;
      const yearly = paywallOptions.find((entry) => entry.kind === 'yearly')?.priceString;
      const lifetime = paywallOptions.find((entry) => entry.kind === 'lifetime')?.priceString;
      if (monthly && monthly !== 'Price shown at checkout') setMonthlyPrice(monthly.replace(' / ', '/'));
      if (yearly && yearly !== 'Price shown at checkout') setYearlyPrice(yearly.replace(' / ', '/'));
      if (lifetime && lifetime !== 'Price shown at checkout') setLifetimePrice(lifetime);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    purchaseState?.isEntitled,
    settings.foundingMemberJoined,
    settings.guidedOnboarding,
    settings.guidedOnboardingCompleted,
    settings.developerModeEnabled,
    settings.developerForceProAccessEnabled,
  ]);

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Explore Pro</Text>
          <Text style={styles.subtitle}>See everything. Miss nothing.</Text>
          {isFoundingMember ? <Text style={styles.badge}>You're a Founding Member</Text> : null}
          {!isFoundingMember && foundingVisible ? <Text style={styles.badge}>{`Founder price ${foundingPrice ?? '$9.99'} first year`}</Text> : null}
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Stop overbuying. Start using what you have.</Text>
          <Text style={styles.featureBody}>
            See everything across sizes and avoid duplicates before you buy.
          </Text>
        </Card>

        {!proAccessEnabled ? (
          <Card style={styles.pricingCard}>
            <Text style={styles.sectionTitle}>Pricing</Text>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Monthly</Text>
              <Text style={styles.pricingValue}>{monthlyPrice}</Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Yearly</Text>
              {foundingVisible && foundingPrice ? (
                <>
                  <View style={styles.foundingPriceRow}>
                    <Text style={styles.foundingOriginal}>{yearlyPrice}</Text>
                    <Text style={styles.foundingCurrent}>{foundingPrice}</Text>
                  </View>
                  <Text style={styles.pricingMeta}>Special first-year price</Text>
                </>
              ) : (
                <Text style={styles.pricingValue}>{yearlyPrice}</Text>
              )}
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Lifetime</Text>
              <Text style={styles.pricingValue}>{lifetimePrice}</Text>
            </View>
          </Card>
        ) : null}

        {featureCards.map((card) => (
          <Card key={card.title}>
            <Text style={styles.featureTitle}>{card.title}</Text>
            <Text style={styles.featureBody}>{card.body}</Text>
          </Card>
        ))}

        <Card>
          {proAccessEnabled ? (
            <>
              <Text style={styles.trustText}>You have full access to Pro features</Text>
              <Text style={styles.sectionTitle}>You’re Pro ✓</Text>
            </>
          ) : (
            <>
              <Text style={styles.trustText}>Pro unlocks advanced tools for selling, matching, and organizing</Text>
              <Text style={styles.sectionTitle}>Stop overbuying and start selling smarter</Text>
              <PrimaryButton
                label={foundingVisible ? 'Get 50% off first year' : 'Unlock Pro'}
                onPress={() => navigation.navigate('ProPaywall', { entryContext: 'generic_pro', source: 'explore_pro' })}
              />
              <Text style={styles.ctaMeta}>
                {foundingVisible ? 'Then $19.99/year after' : 'Monthly, yearly, and lifetime options'}
              </Text>
            </>
          )}
        </Card>
      </View>
    </Screen>
  );
};
