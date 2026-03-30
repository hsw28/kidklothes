import { AppSettings, PurchaseStateSnapshot } from '@/models';

export type ProAccessState = {
  hasRealProEntitlement: boolean;
  hasDevProOverride: boolean;
  hasProAccess: boolean;
};

export const hasRealProEntitlement = (purchaseState?: PurchaseStateSnapshot): boolean => Boolean(purchaseState?.isEntitled);

export const getProAccessState = (settings: Pick<AppSettings, 'devProUnlocked'>, purchaseState?: PurchaseStateSnapshot): ProAccessState => {
  const realProEntitlement = hasRealProEntitlement(purchaseState);
  const devProUnlocked = Boolean(settings.devProUnlocked);
  return {
    hasRealProEntitlement: realProEntitlement,
    hasDevProOverride: devProUnlocked,
    hasProAccess: realProEntitlement || devProUnlocked,
  };
};

export const hasProAccess = (settings: Pick<AppSettings, 'devProUnlocked'>, purchaseState?: PurchaseStateSnapshot): boolean =>
  getProAccessState(settings, purchaseState).hasProAccess;
