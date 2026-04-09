import { appConfig } from '@/config';
import { AppSettings, PurchaseStateSnapshot } from '@/models';
import { hasProAccess } from '@/services/proAccess';

export type FoundingOfferSurface = 'settings' | 'paywall' | 'sell_bin' | 'bst_flow' | 'closet' | 'explore_pro';

type EligibilityInput = {
  settings: AppSettings;
  purchaseState?: PurchaseStateSnapshot;
  itemCount: number;
  getEventCount: (type: string, sinceDate: number) => Promise<number>;
};

export type FoundingOfferEligibility = {
  eligible: boolean;
  reasons: string[];
};

export const shouldSuppressFoundingOffer = (
  settings: AppSettings,
  purchaseState?: PurchaseStateSnapshot,
): boolean => {
  if (!appConfig.foundingMember.enabled) return true;
  if (settings.guidedOnboarding && !settings.guidedOnboardingCompleted) return true;
  if (hasProAccess(settings, purchaseState)) return true;
  return false;
};

export const getFoundingOfferEligibility = async ({
  settings,
  purchaseState,
  itemCount,
  getEventCount,
}: EligibilityInput): Promise<FoundingOfferEligibility> => {
  void itemCount;
  void getEventCount;
  if (shouldSuppressFoundingOffer(settings, purchaseState)) {
    return { eligible: false, reasons: [] };
  }

  return {
    eligible: true,
    reasons: ['global_offer'],
  };
};

export const isEligibleForFoundingOffer = (eligibility: FoundingOfferEligibility): boolean =>
  eligibility.eligible;
