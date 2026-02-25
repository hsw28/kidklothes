export const SAMPLE_CHILD_IDS = ['child-ava', 'child-noah'] as const;
export const SAMPLE_ITEM_IDS = ['item-1', 'item-2'] as const;
export const SAMPLE_CHILD_ITEM_IDS = ['child-item-1', 'child-item-2'] as const;
export const SAMPLE_OUTFIT_IDS = ['outfit-1'] as const;

const sampleChildIdSet = new Set<string>(SAMPLE_CHILD_IDS);

export const isSampleChildId = (id?: string | null): boolean => Boolean(id && sampleChildIdSet.has(id));
