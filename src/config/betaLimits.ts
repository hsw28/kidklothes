export const BETA_MAX_KIDS = 5;
export const isBetaLimitEnabled = true;

export const getMaxKidsAllowed = (): number => (isBetaLimitEnabled ? BETA_MAX_KIDS : Number.POSITIVE_INFINITY);
