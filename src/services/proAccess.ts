import { AppSettings, PurchaseStateSnapshot } from '@/models';

export type ProAccessState = {
  hasRealProEntitlement: boolean;
  hasDevProOverride: boolean;
  hasProAccess: boolean;
  capabilities: {
    canUseBSTGenerator: boolean;
    canCreateMultipleDrafts: boolean;
    canGenerateUnlimitedCards: boolean;
    canUseMultipleItemPhotos: boolean;
    canUseCustomBstHeaderImage: boolean;
  };
};

export const hasRealProEntitlement = (purchaseState?: PurchaseStateSnapshot): boolean => Boolean(purchaseState?.isEntitled);

export const getProAccessState = (
  settings: Pick<AppSettings, 'developerModeEnabled' | 'developerForceProAccessEnabled'>,
  purchaseState?: PurchaseStateSnapshot,
): ProAccessState => {
  const realProEntitlement = hasRealProEntitlement(purchaseState);
  const devProUnlocked = Boolean(settings.developerModeEnabled && settings.developerForceProAccessEnabled);
  const hasPro = realProEntitlement || devProUnlocked;
  return {
    hasRealProEntitlement: realProEntitlement,
    hasDevProOverride: devProUnlocked,
    hasProAccess: hasPro,
    capabilities: {
      canUseBSTGenerator: true,
      canCreateMultipleDrafts: hasPro,
      canGenerateUnlimitedCards: hasPro,
      canUseMultipleItemPhotos: hasPro,
      canUseCustomBstHeaderImage: hasPro,
    },
  };
};

export const hasProAccess = (
  settings: Pick<AppSettings, 'developerModeEnabled' | 'developerForceProAccessEnabled'>,
  purchaseState?: PurchaseStateSnapshot,
): boolean =>
  getProAccessState(settings, purchaseState).hasProAccess;

export const canUseBSTGenerator = (
  settings: Pick<AppSettings, 'developerModeEnabled' | 'developerForceProAccessEnabled'>,
  purchaseState?: PurchaseStateSnapshot,
): boolean => getProAccessState(settings, purchaseState).capabilities.canUseBSTGenerator;

export const canCreateMultipleDrafts = (
  settings: Pick<AppSettings, 'developerModeEnabled' | 'developerForceProAccessEnabled'>,
  purchaseState?: PurchaseStateSnapshot,
): boolean => getProAccessState(settings, purchaseState).capabilities.canCreateMultipleDrafts;

export const canGenerateUnlimitedCards = (
  settings: Pick<AppSettings, 'developerModeEnabled' | 'developerForceProAccessEnabled'>,
  purchaseState?: PurchaseStateSnapshot,
): boolean => getProAccessState(settings, purchaseState).capabilities.canGenerateUnlimitedCards;

export const canUseMultipleItemPhotos = (
  settings: Pick<AppSettings, 'developerModeEnabled' | 'developerForceProAccessEnabled'>,
  purchaseState?: PurchaseStateSnapshot,
): boolean => getProAccessState(settings, purchaseState).capabilities.canUseMultipleItemPhotos;

export const canUseCustomBstHeaderImage = (
  settings: Pick<AppSettings, 'developerModeEnabled' | 'developerForceProAccessEnabled'>,
  purchaseState?: PurchaseStateSnapshot,
): boolean => getProAccessState(settings, purchaseState).capabilities.canUseCustomBstHeaderImage;
