import { Child, ChildItem, Item } from '@/models';
import { ClosetCategory, isCustomCategoryId, normalizeItemCategoryToClosetCategory } from './categories';
import { getChildCurrentSizeText, getChildNextSizeText } from './sizes';

type ChildItemData = {
  child: Child;
  items: Item[];
};

const normalizeText = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ');

export const sizeToNumber = (size: string): number | undefined => {
  const normalized = size.toUpperCase().trim();
  const tMatch = normalized.match(/^(\d+)\s*T$/);
  if (tMatch) return Number(tMatch[1]) * 10 + 24;
  const mMatch = normalized.match(/^(\d+)\s*M$/);
  if (mMatch) return Number(mMatch[1]);
  const plain = normalized.match(/^(\d+)$/);
  if (plain) return Number(plain[1]);
  const range = normalized.match(/^(\d+)\s*[-/]\s*(\d+)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  return undefined;
};

export const categoryForItem = (item: Item): string => {
  if (item.clothingType === 'top') return 'tops';
  if (item.clothingType === 'bottom') return 'pants';
  if (item.clothingType === 'other') return 'other';
  return item.clothingType;
};

export const getChildItems = (child: Child, items: Item[], childItems: ChildItem[]): ChildItemData => {
  const linked = childItems.filter((link) => link.childId === child.id);
  const linkedItems = linked
    .map((link) => items.find((item) => item.id === link.itemId))
    .filter(Boolean) as Item[];
  return { child, items: linkedItems };
};

export const getWearingNowByCategory = (ownedItems: Item[], child?: Child) => {
  const grouped = new Map<string, string[]>();
  ownedItems.forEach((item) => {
    const key = categoryForItem(item);
    const prev = grouped.get(key) ?? [];
    prev.push(item.size);
    grouped.set(key, prev);
  });

  const result = new Map<string, string>();
  const explicitCurrent = getChildCurrentSizeText(child);
  grouped.forEach((sizes, key) => {
    if (explicitCurrent) {
      result.set(key, explicitCurrent);
      return;
    }
    const freq = new Map<string, number>();
    sizes.forEach((size) => freq.set(size, (freq.get(size) ?? 0) + 1));
    const mostCommon = Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (mostCommon) result.set(key, mostCommon);
  });
  return result;
};

export const getSizeUpCounts = (ownedItems: Item[], wearingNow: Map<string, string>, child?: Child) => {
  const result = new Map<string, number>();
  const explicitNext = getChildNextSizeText(child);
  wearingNow.forEach((currentSize, category) => {
    if (explicitNext) {
      const count = ownedItems.filter((item) => categoryForItem(item) === category && normalizeText(item.size) === normalizeText(explicitNext)).length;
      result.set(category, count);
      return;
    }
    const currentNum = sizeToNumber(currentSize);
    if (currentNum === undefined) return;
    const count = ownedItems.filter((item) => {
      if (categoryForItem(item) !== category) return false;
      const n = sizeToNumber(item.size);
      return n !== undefined && n > currentNum;
    }).length;
    result.set(category, count);
  });
  return result;
};

export const getDuplicateAdjacentGroups = (items: Item[]) => {
  const grouped = new Map<string, Item[]>();
  items.forEach((item) => {
    const key = `${normalizeText(item.title)}|${normalizeText(item.brand ?? '')}|${item.clothingType}`;
    const prev = grouped.get(key) ?? [];
    prev.push(item);
    grouped.set(key, prev);
  });

  let duplicateGroups = 0;
  grouped.forEach((group) => {
    if (group.length < 2) return;
    const sizes = group.map((entry) => sizeToNumber(entry.size)).filter((entry) => entry !== undefined) as number[];
    if (sizes.length < 2) return;
    const sorted = [...sizes].sort((a, b) => a - b);
    for (let idx = 1; idx < sorted.length; idx += 1) {
      if (Math.abs(sorted[idx] - sorted[idx - 1]) <= 8) {
        duplicateGroups += 1;
        return;
      }
    }
  });
  return duplicateGroups;
};

const CATEGORY_FALLBACK_SAFE_BY_TYPE: Partial<Record<Item['clothingType'], ClosetCategory[]>> = {
  bottom: ['pants'],
  sleeper: ['pjs'],
  romper: ['one-pieces'],
  outerwear: ['outerwear'],
  shoes: ['shoes'],
  dress: ['dresses-skirts'],
};

const matchesWishlistAwarenessCategory = (
  item: Item,
  input: { clothingType: Item['clothingType']; category?: string },
) => {
  if (!input.category) return item.clothingType === input.clothingType;
  if (isCustomCategoryId(input.category)) return item.category === input.category;

  const normalizedCategory = normalizeItemCategoryToClosetCategory(item.category);
  if (normalizedCategory) return normalizedCategory === input.category;

  const safeFallbackCategories = CATEGORY_FALLBACK_SAFE_BY_TYPE[input.clothingType] ?? [];
  return item.clothingType === input.clothingType && safeFallbackCategories.includes(input.category);
};

export const getWishlistAwareness = (
  items: Item[],
  input: { childId: string; clothingType: Item['clothingType']; size: string; category?: string },
) => {
  const matching = items.filter(
    (item) =>
      item.childIds.includes(input.childId) &&
      matchesWishlistAwarenessCategory(item, input) &&
      normalizeText(item.size) === normalizeText(input.size),
  );
  const ownedCount = matching.filter((item) => item.status === 'owned').length;
  const similarCount = matching.length;
  return { ownedCount, similarCount };
};

export const getDeclutterInsights = (items: Item[]) => {
  const neverWorn = items.filter((item) => (item.wornCount ?? 0) === 0);
  const skippedWear = items.filter((item) => (item.wornCount ?? 0) <= 1 && item.status === 'owned');
  const outgrownStored = items.filter(
    (item) => item.fitRating === 'small' && [...item.tags, ...item.seasonTags].some((tag) => tag.toLowerCase().includes('storage')),
  );
  const duplicatesAdjacent = getDuplicateAdjacentGroups(items);
  return {
    neverWornCount: neverWorn.length,
    skippedWearCount: skippedWear.length,
    outgrownStoredCount: outgrownStored.length,
    duplicateAdjacentCount: duplicatesAdjacent,
  };
};

export const getCoveredNudges = (items: Item[]) => {
  const nudges: string[] = [];
  const bySizeType = new Map<string, number>();
  items
    .filter((item) => item.status === 'owned')
    .forEach((item) => {
      const key = `${item.size}|${item.clothingType}`;
      bySizeType.set(key, (bySizeType.get(key) ?? 0) + 1);
    });

  bySizeType.forEach((count, key) => {
    if (count < 5) return;
    const [size, type] = key.split('|');
    nudges.push(`You already have enough ${size} ${type} items. You're good.`);
  });

  return nudges.slice(0, 5);
};
