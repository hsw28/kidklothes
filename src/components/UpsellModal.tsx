import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { appConfig } from '@/config';
import { useData } from '@/db/DataContext';
import { getBstProPaywallOptions, getFoundingMemberYearlyOffer, getOfferings, purchasePackage, restorePurchases } from '@/services/purchases';

type Props = {
  visible: boolean;
  context: 'drop_prep' | 'brand_snapshot';
  usageCount: number;
  onClose: () => void;
};

export const UpsellModal: React.FC<Props> = ({ visible, context, usageCount, onClose }) => {
  const { logEvent, refreshPurchaseState } = useData();
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<Array<{ identifier: string; title: string; priceString: string }>>([]);
  const [foundingPrice, setFoundingPrice] = useState<string | null>(null);
  const defaultPackageId = appConfig.defaultPackageIdentifier;

  const shouldShowPackageList = useMemo(() => !defaultPackageId, [defaultPackageId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const foundingSummary = await getFoundingMemberYearlyOffer();
      if (cancelled) return;
      setFoundingPrice(foundingSummary.status === 'available' ? foundingSummary.discountedPriceString ?? null : null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPackages = async () => {
    if (!shouldShowPackageList) return packages;
    if (packages.length > 0) return packages;
    const offerings = await getOfferings();
    const next = offerings.offerings.flatMap((entry) =>
      entry.packages.map((pkg) => ({ identifier: pkg.identifier, title: pkg.title || pkg.productId, priceString: pkg.priceString })),
    );
    setPackages(next);
    return next;
  };

  const handlePurchase = async (packageIdentifier: string) => {
    setLoading(true);
    await logEvent('upsell_purchase_clicked', { context, usageCount, packageIdentifier });
    const result = await purchasePackage(packageIdentifier);
    await refreshPurchaseState();
    setLoading(false);
    if (result.status === 'success') {
      Alert.alert('Purchase complete', 'Pro tools are now available on this device.');
      onClose();
      return;
    }
    if (result.status === 'cancelled') return;
    Alert.alert('Purchase failed', result.errorMessage || 'Please try again.');
  };

  const handleStartTrial = async () => {
    if (defaultPackageId) {
      await handlePurchase(defaultPackageId);
      return;
    }
    const preferredOptions = await getBstProPaywallOptions();
    const recommended = preferredOptions.find((option) => option.kind === 'yearly' && option.available)
      ?? preferredOptions.find((option) => option.kind === 'monthly' && option.available)
      ?? preferredOptions.find((option) => option.available);
    if (recommended?.packageIdentifier) {
      await handlePurchase(recommended.packageIdentifier);
      return;
    }
    const nextPackages = await loadPackages();
    if ((nextPackages ?? []).length === 0) {
      Alert.alert('No packages found', 'Configure DEFAULT_PACKAGE_IDENTIFIER or verify RevenueCat offerings.');
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    await logEvent('upsell_restore_clicked', { context, usageCount });
    const result = await restorePurchases();
    await refreshPurchaseState();
    setLoading(false);
    if (result.status === 'success') {
      Alert.alert('Restore complete', 'Purchases restored.');
      onClose();
      return;
    }
    Alert.alert('Restore failed', result.errorMessage || 'Please try again.');
  };

  const dismiss = async () => {
    await logEvent('upsell_dismissed', { context, usageCount });
    onClose();
  };

  const getDisplayPrice = (pkg: { identifier: string; title: string; priceString: string }) => {
    if (!foundingPrice) return pkg.priceString;
    const haystack = `${pkg.identifier} ${pkg.title}`.toLowerCase();
    const looksYearly = haystack.includes('annual') || haystack.includes('yearly') || haystack.includes('year');
    return looksYearly ? foundingPrice : pkg.priceString;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void dismiss()}>
      <View style={styles.backdrop}>
        <Card style={styles.modalCard}>
          <Text style={styles.title}>Unlock Pro tools</Text>
          {foundingPrice ? <Text style={styles.foundingCallout}>{`Founder price ${foundingPrice} first year`}</Text> : null}
          <Text style={styles.bullet}>• Drop prep power tools</Text>
          <Text style={styles.bullet}>• Brand-level insights</Text>
          <Text style={styles.bullet}>• Resale workflow helpers</Text>
          <PrimaryButton label={loading ? 'Please wait…' : 'Start free trial'} onPress={() => void handleStartTrial()} />
          {shouldShowPackageList && packages.length > 0 ? (
            <View style={styles.packageList}>
              {packages.slice(0, 6).map((pkg) => (
                <Pressable key={pkg.identifier} style={styles.packageRow} onPress={() => void handlePurchase(pkg.identifier)}>
                  <Text style={styles.packageTitle}>{pkg.title}</Text>
                  <Text style={styles.packagePrice}>{getDisplayPrice(pkg)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <PrimaryButton label="Restore purchases" variant="secondary" onPress={() => void handleRestore()} />
          <Pressable
            onPress={() => void dismiss()}
          >
            <Text style={styles.notNow}>Not now</Text>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  foundingCallout: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7c89d9',
  },
  bullet: {
    fontSize: 14,
    color: '#374151',
  },
  notNow: {
    textAlign: 'center',
    color: '#4b5563',
    fontWeight: '700',
    fontSize: 14,
  },
  packageList: {
    gap: 6,
  },
  packageRow: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  packageTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  packagePrice: {
    color: '#1f2937',
    fontSize: 13,
    fontWeight: '700',
  },
});
