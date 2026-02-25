import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { appConfig } from '@/config';
import { PurchaseStateSnapshot } from '@/models';
import { repository } from '@/db/repository';

type NormalizedPackage = {
  identifier: string;
  productId: string;
  title: string;
  priceString: string;
  period?: string;
  type?: string;
};

export type OfferingsSummary = {
  offerings: Array<{
    offeringId: string;
    packages: NormalizedPackage[];
  }>;
};

export type CustomerInfoSummary = {
  activeEntitlements: string[];
  activeSubscriptions: string[];
  nonSubscriptions: string[];
  latestPurchaseAt?: string;
};

export type PurchaseResult = {
  status: 'success' | 'cancelled' | 'error';
  entitlementActive: boolean;
  customerInfoSummary?: CustomerInfoSummary;
  errorCode?: string;
  errorMessage?: string;
};

let initialized = false;

const shouldRun = () => appConfig.monetizationEnabled;

const safeLogEvent = async (type: string, payload?: Record<string, unknown>) => {
  try {
    await repository.logEvent({ type, payload });
  } catch {
    // best effort logging
  }
};

const toSummary = (customerInfo: any): CustomerInfoSummary => {
  const activeEntitlements = Object.keys(customerInfo?.entitlements?.active ?? {});
  const activeSubscriptions = Array.isArray(customerInfo?.activeSubscriptions) ? customerInfo.activeSubscriptions.filter((v: unknown) => typeof v === 'string') : [];
  const nonSubscriptions = Array.isArray(customerInfo?.nonSubscriptionTransactions)
    ? customerInfo.nonSubscriptionTransactions.map((tx: any) => String(tx?.productIdentifier ?? '')).filter(Boolean)
    : [];
  const purchaseDates = [
    ...(Array.isArray(customerInfo?.nonSubscriptionTransactions)
      ? customerInfo.nonSubscriptionTransactions.map((tx: any) => String(tx?.purchaseDate ?? '')).filter(Boolean)
      : []),
    ...Object.values(customerInfo?.allExpirationDates ?? {})
      .map((value) => String(value ?? ''))
      .filter(Boolean),
  ];
  const latestPurchaseAt = purchaseDates.sort().slice(-1)[0];
  return {
    activeEntitlements,
    activeSubscriptions,
    nonSubscriptions,
    latestPurchaseAt: latestPurchaseAt || undefined,
  };
};

const toSnapshot = (customerInfo: any): PurchaseStateSnapshot => {
  const summary = toSummary(customerInfo);
  return {
    isEntitled: summary.activeEntitlements.length > 0,
    activeEntitlements: summary.activeEntitlements,
    activeSubscriptions: summary.activeSubscriptions,
    nonSubscriptions: summary.nonSubscriptions,
    latestPurchaseAt: summary.latestPurchaseAt,
    updatedAt: new Date().toISOString(),
  };
};

const normalizeOfferings = (offerings: any): OfferingsSummary => {
  const all = offerings?.all ?? {};
  const keys = Object.keys(all);
  return {
    offerings: keys.map((offeringId) => {
      const offering = all[offeringId];
      const packages = Array.isArray(offering?.availablePackages) ? offering.availablePackages : [];
      return {
        offeringId,
        packages: packages.map((pkg: any) => ({
          identifier: String(pkg?.identifier ?? ''),
          productId: String(pkg?.product?.identifier ?? ''),
          title: String(pkg?.product?.title ?? ''),
          priceString: String(pkg?.product?.priceString ?? ''),
          period: pkg?.product?.subscriptionPeriod ? String(pkg.product.subscriptionPeriod) : undefined,
          type: pkg?.packageType ? String(pkg.packageType) : undefined,
        })),
      };
    }),
  };
};

const findPackage = (offerings: any, packageIdentifier: string): any | undefined => {
  const all = offerings?.all ?? {};
  for (const offeringId of Object.keys(all)) {
    const offering = all[offeringId];
    const packages = Array.isArray(offering?.availablePackages) ? offering.availablePackages : [];
    const found = packages.find((pkg: any) => String(pkg?.identifier) === packageIdentifier);
    if (found) return found;
  }
  return undefined;
};

export const initPurchases = async (): Promise<void> => {
  if (!shouldRun() || initialized) return;

  try {
    const apiKey = Platform.OS === 'ios' ? appConfig.revenueCat.iosApiKey : appConfig.revenueCat.androidApiKey;
    if (!apiKey) {
      await safeLogEvent('monetization_init_failed', { reason: 'missing_api_key', platform: Platform.OS });
      return;
    }

    if (__DEV__ && Purchases?.LOG_LEVEL?.DEBUG) {
      Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    }

    Purchases.configure({ apiKey });
    initialized = true;
    await safeLogEvent('monetization_init_success', { platform: Platform.OS });
  } catch (error: any) {
    await safeLogEvent('monetization_init_failed', {
      platform: Platform.OS,
      errorCode: String(error?.code ?? ''),
      message: String(error?.message ?? 'init_failed'),
    });
  }
};

export const getOfferings = async (): Promise<OfferingsSummary> => {
  if (!shouldRun()) return { offerings: [] };
  try {
    await initPurchases();
    const offerings = await Purchases.getOfferings();
    const normalized = normalizeOfferings(offerings);
    await safeLogEvent('offerings_fetched', {
      offeringIds: normalized.offerings.map((entry) => entry.offeringId),
      packageIds: normalized.offerings.flatMap((entry) => entry.packages.map((pkg) => pkg.identifier)),
    });
    return normalized;
  } catch {
    return { offerings: [] };
  }
};

export const getCustomerInfo = async (): Promise<CustomerInfoSummary> => {
  if (!shouldRun()) return { activeEntitlements: [], activeSubscriptions: [], nonSubscriptions: [] };
  try {
    await initPurchases();
    const customerInfo = await Purchases.getCustomerInfo();
    return toSummary(customerInfo);
  } catch {
    return { activeEntitlements: [], activeSubscriptions: [], nonSubscriptions: [] };
  }
};

export const purchasePackage = async (packageIdentifier: string): Promise<PurchaseResult> => {
  if (!shouldRun()) return { status: 'error', entitlementActive: false, errorCode: 'disabled', errorMessage: 'Monetization disabled' };
  try {
    await initPurchases();
    const offerings = await Purchases.getOfferings();
    const pkg = findPackage(offerings, packageIdentifier);
    const productId = String(pkg?.product?.identifier ?? '');
    await safeLogEvent('purchase_attempt', { packageIdentifier, productId });
    if (!pkg) {
      await safeLogEvent('purchase_failed', { packageIdentifier, productId, errorCode: 'package_not_found', message: 'Package not found' });
      return { status: 'error', entitlementActive: false, errorCode: 'package_not_found', errorMessage: 'Package not found' };
    }

    const result = await Purchases.purchasePackage(pkg);
    const summary = toSummary(result?.customerInfo);
    await safeLogEvent('purchase_success', {
      packageIdentifier,
      productId,
      activeEntitlements: summary.activeEntitlements,
    });
    return {
      status: 'success',
      entitlementActive: summary.activeEntitlements.length > 0,
      customerInfoSummary: summary,
    };
  } catch (error: any) {
    const offerings = await Purchases.getOfferings().catch(() => null);
    const pkg = findPackage(offerings, packageIdentifier);
    const productId = String(pkg?.product?.identifier ?? '');
    if (error?.userCancelled) {
      await safeLogEvent('purchase_cancelled', { packageIdentifier, productId });
      return { status: 'cancelled', entitlementActive: false, errorCode: String(error?.code ?? 'cancelled'), errorMessage: 'User cancelled' };
    }
    await safeLogEvent('purchase_failed', {
      packageIdentifier,
      productId,
      errorCode: String(error?.code ?? ''),
      message: String(error?.message ?? 'purchase_failed'),
    });
    return {
      status: 'error',
      entitlementActive: false,
      errorCode: String(error?.code ?? ''),
      errorMessage: String(error?.message ?? 'purchase_failed'),
    };
  }
};

export const restorePurchases = async (): Promise<PurchaseResult> => {
  if (!shouldRun()) return { status: 'error', entitlementActive: false, errorCode: 'disabled', errorMessage: 'Monetization disabled' };
  await safeLogEvent('restore_attempt');
  try {
    await initPurchases();
    const customerInfo = await Purchases.restorePurchases();
    const summary = toSummary(customerInfo);
    await safeLogEvent('restore_success', { activeEntitlements: summary.activeEntitlements });
    return {
      status: 'success',
      entitlementActive: summary.activeEntitlements.length > 0,
      customerInfoSummary: summary,
    };
  } catch (error: any) {
    await safeLogEvent('restore_failed', {
      errorCode: String(error?.code ?? ''),
      message: String(error?.message ?? 'restore_failed'),
    });
    return {
      status: 'error',
      entitlementActive: false,
      errorCode: String(error?.code ?? ''),
      errorMessage: String(error?.message ?? 'restore_failed'),
    };
  }
};

export const getEntitlementSnapshot = async (): Promise<PurchaseStateSnapshot> => {
  if (!shouldRun()) {
    return {
      isEntitled: false,
      activeEntitlements: [],
      activeSubscriptions: [],
      nonSubscriptions: [],
      updatedAt: new Date().toISOString(),
    };
  }
  try {
    await initPurchases();
    const customerInfo = await Purchases.getCustomerInfo();
    return toSnapshot(customerInfo);
  } catch {
    return {
      isEntitled: false,
      activeEntitlements: [],
      activeSubscriptions: [],
      nonSubscriptions: [],
      updatedAt: new Date().toISOString(),
    };
  }
};

export const debugPrintPurchasesDiagnostics = async (): Promise<void> => {
  if (!__DEV__) return;
  await initPurchases();
  const offerings = await getOfferings();
  const customerInfo = await getCustomerInfo();
  // eslint-disable-next-line no-console
  console.log('[monetization] offerings', offerings);
  // eslint-disable-next-line no-console
  console.log('[monetization] customerInfo', customerInfo);
};

