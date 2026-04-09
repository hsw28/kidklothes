import { Platform } from 'react-native';
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
  packageType?: string;
};

const normalizePackage = (pkg: any): NormalizedPackage => ({
  identifier: String(pkg?.identifier ?? ''),
  productId: String(pkg?.product?.identifier ?? ''),
  title: String(pkg?.product?.title ?? ''),
  priceString: String(pkg?.product?.priceString ?? ''),
  period: pkg?.product?.subscriptionPeriod ? String(pkg.product.subscriptionPeriod) : undefined,
  type: pkg?.packageType ? String(pkg.packageType) : undefined,
  packageType: pkg?.packageType ? String(pkg.packageType) : undefined,
});

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

export type PurchasesDebugSnapshot = {
  monetizationEnabled: boolean;
  nativeModuleAvailable: boolean;
  apiKeyPresent: boolean;
  apiKeyMode: 'missing' | 'test' | 'public';
  offeringId: string;
  entitlementId: string;
  currentOfferingId?: string;
  offeringsCount: number;
  packageKindsAvailable: ProPaywallOption['kind'][];
  activeEntitlements: string[];
  isEntitled: boolean;
  issues: string[];
};

export type ProPaywallOption = {
  kind: 'monthly' | 'yearly' | 'lifetime';
  packageIdentifier?: string;
  productId?: string;
  title: string;
  subtitle?: string;
  priceString: string;
  badge?: string;
  available: boolean;
};

export type FoundingMemberOfferSummary = {
  status: 'inactive' | 'available' | 'unavailable';
  discountedPriceString?: string;
  isEligible?: boolean;
};

let initialized = false;
const OFFERINGS_CACHE_TTL_MS = 15_000;
let bstProPaywallOptionsCache: { value: ProPaywallOption[]; expiresAt: number } | null = null;
let bstProPaywallOptionsPromise: Promise<ProPaywallOption[]> | null = null;
let foundingMemberYearlyOfferCache: { value: FoundingMemberOfferSummary; expiresAt: number } | null = null;
let foundingMemberYearlyOfferPromise: Promise<FoundingMemberOfferSummary> | null = null;

type PurchasesModule = typeof import('react-native-purchases').default;

const shouldRun = () => appConfig.monetizationEnabled;
const getConfiguredApiKey = () => Platform.OS === 'ios' ? appConfig.revenueCat.iosApiKey : appConfig.revenueCat.androidApiKey;
const getApiKeyMode = (apiKey: string): PurchasesDebugSnapshot['apiKeyMode'] =>
  !apiKey ? 'missing' : apiKey.startsWith('test_') ? 'test' : 'public';

const getPurchasesModule = (): PurchasesModule | null => {
  try {
    const module = require('react-native-purchases');
    return (module?.default ?? module) as PurchasesModule;
  } catch (error) {
    if (__DEV__) {
      console.warn('[purchases] native module unavailable', error);
    }
    return null;
  }
};

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
  const entitlementId = appConfig.revenueCat.entitlementId;
  return {
    isEntitled: summary.activeEntitlements.includes(entitlementId),
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
        packages: packages.map(normalizePackage),
      };
    }),
  };
};

const getPreferredOffering = (offerings: any): any | undefined => {
  const configured = appConfig.revenueCat.offeringId;
  if (configured && offerings?.all?.[configured]) return offerings.all[configured];
  return offerings?.current ?? undefined;
};

const findPackage = (offerings: any, packageIdentifier: string): any | undefined => {
  const preferredOffering = getPreferredOffering(offerings);
  const prioritizedOfferings = preferredOffering
    ? [preferredOffering, ...Object.values(offerings?.all ?? {}).filter((entry) => entry !== preferredOffering)]
    : Object.values(offerings?.all ?? {});
  for (const offering of prioritizedOfferings) {
    const packages = Array.isArray(offering?.availablePackages) ? offering.availablePackages : [];
    const found = packages.find((pkg: any) => String(pkg?.identifier) === packageIdentifier);
    if (found) return found;
  }
  return undefined;
};

const normalizeToken = (value: string): string => value.toLowerCase().trim();

const findPackageByKind = (offerings: any, kind: ProPaywallOption['kind']): any | undefined => {
  const preferredOffering = getPreferredOffering(offerings);
  const preferredPackages = Array.isArray(preferredOffering?.availablePackages) ? preferredOffering.availablePackages : [];
  const scored = preferredPackages
    .map((pkg: any) => {
      const identifier = String(pkg?.identifier ?? '');
      const productId = String(pkg?.product?.identifier ?? '');
      const title = String(pkg?.product?.title ?? '');
      const packageType = String(pkg?.packageType ?? '');
      const period = pkg?.product?.subscriptionPeriod ? String(pkg.product.subscriptionPeriod) : '';
      const haystack = [identifier, productId, title, period, packageType].map((value) => normalizeToken(value ?? '')).join(' ');
      const normalizedPackageType = normalizeToken(packageType);
      const isMonthly = normalizedPackageType.includes('monthly') || normalizedPackageType === '$rc_monthly' || haystack.includes('month');
      const isYearly = normalizedPackageType.includes('annual') || normalizedPackageType.includes('yearly') || normalizedPackageType === '$rc_annual' || haystack.includes('year') || haystack.includes('annual');
      const isSubscription = Boolean(period) || isMonthly || isYearly || haystack.includes('subscription');
      const isLifetime = normalizedPackageType.includes('lifetime') || normalizedPackageType === '$rc_lifetime' || haystack.includes('lifetime') || haystack.includes('forever') || haystack.includes('one_time') || (!period && !isSubscription);
      const score = kind === 'monthly'
        ? (isMonthly ? 6 : 0) + (haystack.includes('month') ? 2 : 0)
        : kind === 'yearly'
          ? (isYearly ? 6 : 0) + (haystack.includes('year') || haystack.includes('annual') ? 2 : 0)
          : (isLifetime ? 6 : 0) + (haystack.includes('lifetime') ? 2 : 0);
      return { pkg, score };
    })
    .filter((entry: { pkg: any; score: number }) => entry.score > 0)
    .sort((a: { pkg: any; score: number }, b: { pkg: any; score: number }) => b.score - a.score);
  return scored[0]?.pkg;
};

export const getBstProPaywallOptions = async (): Promise<ProPaywallOption[]> => {
  const defaults: ProPaywallOption[] = [
    {
      kind: 'monthly',
      title: 'Monthly subscription',
      subtitle: 'Monthly subscription',
      priceString: 'Price shown at checkout',
      available: false,
    },
    {
      kind: 'yearly',
      title: 'Yearly subscription',
      subtitle: 'Best value',
      priceString: 'Price shown at checkout',
      badge: 'Best value',
      available: false,
    },
    {
      kind: 'lifetime',
      title: 'Lifetime access',
      subtitle: 'One-time unlock',
      priceString: 'Price shown at checkout',
      available: false,
    },
  ];

  if (!shouldRun()) return defaults;
  if (bstProPaywallOptionsCache && bstProPaywallOptionsCache.expiresAt > Date.now()) {
    return bstProPaywallOptionsCache.value;
  }
  if (bstProPaywallOptionsPromise) return bstProPaywallOptionsPromise;

  bstProPaywallOptionsPromise = (async () => {
    try {
      await initPurchases();
      const Purchases = getPurchasesModule();
      if (!Purchases) return defaults;
      const offerings = await Purchases.getOfferings();
      const resolved = defaults.map((entry) => {
        const pkg = findPackageByKind(offerings, entry.kind);
        if (!pkg) return entry;
        const normalized = normalizePackage(pkg);
        return {
          ...entry,
          packageIdentifier: normalized.identifier || entry.packageIdentifier,
          productId: normalized.productId || entry.productId,
          title: normalized.title || entry.title,
          priceString: normalized.priceString || entry.priceString,
          available: Boolean(normalized.identifier),
        };
      });
      bstProPaywallOptionsCache = {
        value: resolved,
        expiresAt: Date.now() + OFFERINGS_CACHE_TTL_MS,
      };
      return resolved;
    } catch {
      return defaults;
    } finally {
      bstProPaywallOptionsPromise = null;
    }
  })();

  return bstProPaywallOptionsPromise;
};

export const getFoundingMemberYearlyOffer = async (): Promise<FoundingMemberOfferSummary> => {
  const inactive: FoundingMemberOfferSummary = { status: 'inactive' };

  if (foundingMemberYearlyOfferCache && foundingMemberYearlyOfferCache.expiresAt > Date.now()) {
    return foundingMemberYearlyOfferCache.value;
  }
  if (foundingMemberYearlyOfferPromise) return foundingMemberYearlyOfferPromise;

  if (__DEV__) {
    console.info('[founding-intro] config gate', {
      monetizationEnabled: shouldRun(),
      foundingMemberEnabled: appConfig.foundingMember.enabled,
      platform: Platform.OS,
    });
  }

  if (!appConfig.foundingMember.enabled || !shouldRun()) return inactive;

  foundingMemberYearlyOfferPromise = (async () => {
    try {
      await initPurchases();
      const Purchases = getPurchasesModule();
      if (!Purchases) return inactive;
      const offerings = await Purchases.getOfferings();
      const current = offerings?.current;
      const packages = Array.isArray(current?.availablePackages) ? current.availablePackages : [];
      const yearlyPackage = packages.find((pkg: any) => String(pkg?.packageType ?? '').toUpperCase() === 'ANNUAL')
        ?? findPackageByKind(offerings, 'yearly');
      const product = yearlyPackage?.product;
      const introPrice = product?.introPrice;
      const yearlyDebugPayload = {
        packageIdentifier: String(yearlyPackage?.identifier ?? ''),
        productIdentifier: String(product?.identifier ?? ''),
        priceString: String(product?.priceString ?? ''),
        introPrice: introPrice ? String(introPrice?.price ?? introPrice?.priceString ?? '') : '',
        introPriceString: String(introPrice?.priceString ?? ''),
        hasIntroPriceMetadata: Boolean(introPrice?.priceString),
      };

      if (__DEV__) {
        console.info('[founding-intro] yearly package', yearlyDebugPayload);
      }
      await safeLogEvent('intro_offer_yearly_package_debug', yearlyDebugPayload);

      if (!yearlyPackage || !product || !introPrice?.priceString) {
        if (__DEV__) {
          console.info('[founding-intro] unavailable: missing intro metadata', yearlyDebugPayload);
        }
        await safeLogEvent('intro_offer_metadata_missing', yearlyDebugPayload);
        return { status: 'unavailable' };
      }

      if (Platform.OS !== 'ios' || typeof Purchases.checkTrialOrIntroductoryPriceEligibility !== 'function') {
        if (__DEV__) {
          console.info('[founding-intro] unavailable: eligibility check unsupported', {
            ...yearlyDebugPayload,
            platform: Platform.OS,
          });
        }
        await safeLogEvent('intro_offer_check_unsupported', {
          ...yearlyDebugPayload,
          platform: Platform.OS,
        });
        return { status: 'unavailable' };
      }

      await safeLogEvent('intro_offer_check_started', {
        productId: String(product.identifier ?? ''),
        packageIdentifier: String(yearlyPackage.identifier ?? ''),
      });

      try {
        const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility([product.identifier]);
        const status = eligibility?.[product.identifier]?.status;
        const eligibleStatus = Purchases?.INTRO_ELIGIBILITY_STATUS?.INTRO_ELIGIBILITY_STATUS_ELIGIBLE ?? 2;
        const eligibilityPayload = {
          ...yearlyDebugPayload,
          eligibilityStatus: status ?? 'missing',
          eligibleStatus,
          explicitlyEligible: status === eligibleStatus,
        };

        if (__DEV__) {
          console.info('[founding-intro] eligibility result', eligibilityPayload);
        }
        await safeLogEvent('intro_offer_eligibility_debug', eligibilityPayload);

        if (status !== eligibleStatus) {
          await safeLogEvent('intro_offer_ineligible_or_unknown', {
            productId: String(product.identifier ?? ''),
            packageIdentifier: String(yearlyPackage.identifier ?? ''),
            status: status ?? 'missing',
          });
          return { status: 'unavailable', isEligible: false };
        }

        await safeLogEvent('intro_offer_eligible', {
          productId: String(product.identifier ?? ''),
          packageIdentifier: String(yearlyPackage.identifier ?? ''),
        });
        return {
          status: 'available',
          discountedPriceString: String(introPrice.priceString ?? ''),
          isEligible: true,
        };
      } catch (error: any) {
        if (__DEV__) {
          console.info('[founding-intro] eligibility check failed', {
            ...yearlyDebugPayload,
            errorCode: String(error?.code ?? ''),
            message: String(error?.message ?? 'intro_offer_check_failed'),
          });
        }
        await safeLogEvent('intro_offer_check_failed', {
          productId: String(product.identifier ?? ''),
          packageIdentifier: String(yearlyPackage.identifier ?? ''),
          errorCode: String(error?.code ?? ''),
          message: String(error?.message ?? 'intro_offer_check_failed'),
        });
        return { status: 'unavailable', isEligible: false };
      }
    } catch {
      return { status: 'unavailable' };
    } finally {
      foundingMemberYearlyOfferPromise = null;
    }
  })();

  const resolved = await foundingMemberYearlyOfferPromise;
  foundingMemberYearlyOfferCache = {
    value: resolved,
    expiresAt: Date.now() + OFFERINGS_CACHE_TTL_MS,
  };
  return resolved;
};

export const initPurchases = async (): Promise<void> => {
  if (!shouldRun() || initialized) return;

  try {
    const Purchases = getPurchasesModule();
    if (!Purchases) {
      await safeLogEvent('monetization_init_failed', { reason: 'native_module_unavailable', platform: Platform.OS });
      return;
    }
    const apiKey = getConfiguredApiKey();
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
    const Purchases = getPurchasesModule();
    if (!Purchases) return { offerings: [] };
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
    const Purchases = getPurchasesModule();
    if (!Purchases) return { activeEntitlements: [], activeSubscriptions: [], nonSubscriptions: [] };
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
    const Purchases = getPurchasesModule();
    if (!Purchases) return { status: 'error', entitlementActive: false, errorCode: 'native_module_unavailable', errorMessage: 'Purchases unavailable' };
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
      entitlementActive: summary.activeEntitlements.includes(appConfig.revenueCat.entitlementId),
      customerInfoSummary: summary,
      errorCode: summary.activeEntitlements.includes(appConfig.revenueCat.entitlementId) ? undefined : 'no_active_entitlement_restored',
      errorMessage: summary.activeEntitlements.includes(appConfig.revenueCat.entitlementId) ? undefined : 'No previous Pro purchase was found for this Apple account.',
    };
  } catch (error: any) {
    const Purchases = getPurchasesModule();
    const offerings = Purchases ? await Purchases.getOfferings().catch(() => null) : null;
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
    const Purchases = getPurchasesModule();
    if (!Purchases) return { status: 'error', entitlementActive: false, errorCode: 'native_module_unavailable', errorMessage: 'Purchases unavailable' };
    const customerInfo = await Purchases.restorePurchases();
    const summary = toSummary(customerInfo);
    await safeLogEvent('restore_success', { activeEntitlements: summary.activeEntitlements });
    return {
      status: 'success',
      entitlementActive: summary.activeEntitlements.includes(appConfig.revenueCat.entitlementId),
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
    const Purchases = getPurchasesModule();
    if (!Purchases) {
      return {
        isEntitled: false,
        activeEntitlements: [],
        activeSubscriptions: [],
        nonSubscriptions: [],
        updatedAt: new Date().toISOString(),
      };
    }
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
  // eslint-disable-next-line no-console
  console.log('[monetization] diagnostics', await getPurchasesDebugSnapshot());
};

export const getPurchasesDebugSnapshot = async (): Promise<PurchasesDebugSnapshot> => {
  const apiKey = getConfiguredApiKey();
  const apiKeyMode = getApiKeyMode(apiKey);
  const monetizationEnabled = appConfig.monetizationEnabled;
  const nativeModuleAvailable = Boolean(getPurchasesModule());
  const issues: string[] = [];

  if (!monetizationEnabled) issues.push('Monetization is disabled.');
  if (!apiKey) issues.push(`Missing ${Platform.OS === 'ios' ? 'iOS' : 'Android'} RevenueCat API key.`);
  if (apiKeyMode === 'test') issues.push('Using a RevenueCat test key. Replace it before launch.');
  if (!nativeModuleAvailable) issues.push('RevenueCat native module is unavailable in this build.');

  let currentOfferingId: string | undefined;
  let offeringsCount = 0;
  let packageKindsAvailable: ProPaywallOption['kind'][] = [];
  let activeEntitlements: string[] = [];
  let isEntitled = false;

  try {
    if (monetizationEnabled && nativeModuleAvailable && apiKey) {
      await initPurchases();
      const Purchases = getPurchasesModule();
      const offerings = Purchases ? await Purchases.getOfferings() : null;
      const normalizedOfferings = normalizeOfferings(offerings);
      offeringsCount = normalizedOfferings.offerings.length;
      currentOfferingId = String(offerings?.current?.identifier ?? '');

      const paywallOptions = await getBstProPaywallOptions();
      packageKindsAvailable = paywallOptions.filter((option) => option.available).map((option) => option.kind);
      const customerInfo = await getCustomerInfo();
      activeEntitlements = customerInfo.activeEntitlements;
      isEntitled = activeEntitlements.includes(appConfig.revenueCat.entitlementId);

      if (!offerings?.all?.[appConfig.revenueCat.offeringId] && !offerings?.current) {
        issues.push(`Offering "${appConfig.revenueCat.offeringId}" is not available.`);
      }
      for (const kind of ['monthly', 'yearly', 'lifetime'] as const) {
        if (!packageKindsAvailable.includes(kind)) {
          issues.push(`Missing RevenueCat package for ${kind}.`);
        }
      }
      if (!activeEntitlements.includes(appConfig.revenueCat.entitlementId) && customerInfo.activeEntitlements.length > 0) {
        issues.push(`Configured entitlement "${appConfig.revenueCat.entitlementId}" is not active for this customer.`);
      }
    }
  } catch (error: any) {
    issues.push(String(error?.message ?? 'Unable to load RevenueCat diagnostics.'));
  }

  return {
    monetizationEnabled,
    nativeModuleAvailable,
    apiKeyPresent: Boolean(apiKey),
    apiKeyMode,
    offeringId: appConfig.revenueCat.offeringId,
    entitlementId: appConfig.revenueCat.entitlementId,
    currentOfferingId: currentOfferingId || undefined,
    offeringsCount,
    packageKindsAvailable,
    activeEntitlements,
    isEntitled,
    issues,
  };
};
