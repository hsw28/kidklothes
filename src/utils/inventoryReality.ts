export const INVENTORY_REALITY_THRESHOLDS = [5, 8, 12, 15] as const;

const DEFAULT_INVENTORY_REALITY_THRESHOLD = INVENTORY_REALITY_THRESHOLDS[0];

export const normalizeInventoryRealityThreshold = (value?: number | null): number => {
  if (value == null || !Number.isFinite(value)) return DEFAULT_INVENTORY_REALITY_THRESHOLD;
  const rounded = Math.round(value);
  if (rounded <= 5) return 5;
  if (INVENTORY_REALITY_THRESHOLDS.includes(rounded as any)) return rounded;
  return DEFAULT_INVENTORY_REALITY_THRESHOLD;
};
