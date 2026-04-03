import Constants from 'expo-constants';

const DEFAULT_UNFURL_ENDPOINT = 'https://unfurl.layetteout.com';
const localEndpoint = 'http://localhost:4000';

type ExtraConfig = {
  REVENUECAT_IOS_API_KEY?: string;
  REVENUECAT_ANDROID_API_KEY?: string;
  REVENUECAT_OFFERING_ID?: string;
  REVENUECAT_PRO_ENTITLEMENT_ID?: string;
  MONETIZATION_ENABLED?: boolean | string;
  DEFAULT_PACKAGE_IDENTIFIER?: string;
  UPSELL_TRIGGER_COUNT?: number | string;
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
const monetizationFlag = extra.MONETIZATION_ENABLED;
const monetizationEnabled =
  typeof monetizationFlag === 'boolean'
    ? monetizationFlag
    : String(monetizationFlag ?? '').toLowerCase() === 'true';
const upsellTriggerRaw = extra.UPSELL_TRIGGER_COUNT;
const upsellTriggerCount =
  typeof upsellTriggerRaw === 'number'
    ? upsellTriggerRaw
    : Number.parseInt(String(upsellTriggerRaw ?? ''), 10) || 6;

const normalizeUnfurlBaseUrl = (input?: string): string => {
  const raw = String(input ?? '').trim();
  const fallback = DEFAULT_UNFURL_ENDPOINT;
  if (!raw) return fallback;
  const trimmed = raw.replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      if (__DEV__) {
        console.warn('[config] EXPO_PUBLIC_UNFURL_BASE_URL should use https://; falling back to default', {
          provided: trimmed,
          fallback,
        });
      }
      return fallback;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    if (__DEV__) {
      console.warn('[config] Invalid EXPO_PUBLIC_UNFURL_BASE_URL; falling back to default', {
        provided: trimmed,
        fallback,
      });
    }
    return fallback;
  }
};

const unfurlServiceBaseUrl = normalizeUnfurlBaseUrl(process.env.EXPO_PUBLIC_UNFURL_BASE_URL || DEFAULT_UNFURL_ENDPOINT);

if (__DEV__) {
  if (!unfurlServiceBaseUrl) {
    console.warn('[config] unfurl base URL is empty');
  }
  if (unfurlServiceBaseUrl.includes('.app')) {
    console.warn('[config] unfurl base URL contains .app; expected .com production host', {
      unfurlServiceBaseUrl,
    });
  }
}

export const appConfig = {
  unfurlServiceBaseUrl,
  localUnfurlServiceBaseUrl: localEndpoint,
  monetizationEnabled,
  defaultPackageIdentifier: (extra.DEFAULT_PACKAGE_IDENTIFIER ?? '').trim(),
  upsellTriggerCount,
  revenueCat: {
    iosApiKey: (extra.REVENUECAT_IOS_API_KEY ?? '').trim(),
    androidApiKey: (extra.REVENUECAT_ANDROID_API_KEY ?? '').trim(),
    offeringId: (extra.REVENUECAT_OFFERING_ID ?? 'default').trim() || 'default',
    entitlementId: (extra.REVENUECAT_PRO_ENTITLEMENT_ID ?? 'layette_out_pro').trim() || 'layette_out_pro',
  },
  posthog: {
    apiKey: (extra.POSTHOG_API_KEY ?? '').trim(),
    host: (extra.POSTHOG_HOST ?? '').trim(),
  },
};
