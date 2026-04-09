import { Child, ChildItem, ID, Item, StorageLocation } from '@/models';
import { ClosetCategory, closetCategories, closetLabel, closetCategoryToClothingType, isCustomCategoryId, normalizeItemCategoryToClosetCategory } from './categories';
import { sizeToNumber } from './fitInsights';
import { normalizePrintName } from './printName';
import { getChildCurrentSizeText, getChildNextSizeText } from './sizes';

export type ClosetSizeMode = 'now' | 'next' | 'both';
export type { ClosetCategory } from './categories';
export { closetCategories, closetLabel, normalizeItemCategoryToClosetCategory, closetCategoryToClothingType } from './categories';

export const closetCategoryForItem = (item: Item): ClosetCategory => {
  const fromCategory = normalizeItemCategoryToClosetCategory(item.category);
  if (fromCategory) return fromCategory;
  switch (item.clothingType) {
    case 'bottom':
      return 'pants';
    case 'top':
      return 'tops';
    case 'sleeper':
      return 'pjs';
    case 'romper':
      return 'one-pieces';
    case 'outerwear':
      return 'outerwear';
    case 'shoes':
      return 'shoes';
    case 'dress':
      return 'dresses-skirts';
    case 'other':
      return 'other';
    case 'accessory':
      return 'accessories';
    default:
      return 'other';
  }
};

export const itemCategoryKey = (item: Item): string => {
  if (isCustomCategoryId(item.category)) return item.category;
  return closetCategoryForItem(item);
};

export const getVisibleClosetCategories = (child?: Child): ClosetCategory[] => {
  const hidden = new Set((child?.hiddenClosetCategories ?? []).map((entry) => entry.trim()).filter(Boolean));
  return closetCategories.filter((category) => !hidden.has(category));
};

type SizeAnchors = {
  currentByCategory: Map<ClosetCategory, string>;
  nextByCategory: Map<ClosetCategory, string>;
};

const normalize = (value: string) => value.toLowerCase().trim();
const normalizeToken = (value: string) =>
  normalize(value)
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');

export const getSpecialLocationIds = (childId: ID, storageLocations: StorageLocation[]) => {
  const scoped = storageLocations.filter((location) => !location.childId || location.childId === childId);
  const sizeUp = scoped.find((location) => {
    const name = normalize(location.name);
    const type = normalizeToken(location.type ?? '');
    return name === 'size-up bin' || type === 'size_up';
  });
  const sellBin = scoped.find((location) => normalize(location.name) === 'sell bin');
  return {
    sizeUpLocationId: sizeUp?.id,
    sellBinLocationId: sellBin?.id,
  };
};

export const getSizeAnchors = (items: Item[], child?: Child): SizeAnchors => {
  const groupedSizes = new Map<ClosetCategory, string[]>();
  items.forEach((item) => {
    const category = closetCategoryForItem(item);
    const prev = groupedSizes.get(category) ?? [];
    prev.push(item.size);
    groupedSizes.set(category, prev);
  });

  const currentByCategory = new Map<ClosetCategory, string>();
  const nextByCategory = new Map<ClosetCategory, string>();
  const childCurrent = getChildCurrentSizeText(child);
  const childNext = getChildNextSizeText(child);

  groupedSizes.forEach((sizes, category) => {
    if (childCurrent) currentByCategory.set(category, childCurrent);
    if (childNext) nextByCategory.set(category, childNext);
    if (childCurrent && childNext) return;

    const freq = new Map<string, number>();
    sizes.forEach((size) => freq.set(size, (freq.get(size) ?? 0) + 1));
    const current = childCurrent || Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!current) return;
    if (!childCurrent) currentByCategory.set(category, current);

    const currentNum = sizeToNumber(current);
    if (currentNum === undefined) return;
    if (childNext) return;
    const next = sizes
      .map((size) => ({ size, n: sizeToNumber(size) }))
      .filter((entry) => entry.n !== undefined && entry.n > currentNum)
      .sort((a, b) => (a.n ?? 0) - (b.n ?? 0))[0]?.size;
    if (next) nextByCategory.set(category, next);
  });

  return { currentByCategory, nextByCategory };
};

const matchesSizeMode = (item: Item, sizeMode: ClosetSizeMode, anchors: SizeAnchors) => {
  if (sizeMode === 'both') return true;
  const category = closetCategoryForItem(item);
  const current = anchors.currentByCategory.get(category);
  const next = anchors.nextByCategory.get(category);
  if (sizeMode === 'now') return Boolean(current && normalize(item.size) === normalize(current));
  return Boolean(next && normalize(item.size) === normalize(next));
};

const matchesBrand = (item: Item, brandId?: string) => {
  if (!brandId || brandId === 'All') return true;
  const target = normalize(brandId);
  if (normalize(item.brand ?? '') === target) return true;
  return item.brandTags.some((tag) => normalize(tag) === target);
};

export const getOwnedItemsForChild = (childId: ID, items: Item[], childItems: ChildItem[]) => {
  const linked = new Set(childItems.filter((link) => link.childId === childId).map((link) => link.itemId));
  return items.filter((item) => linked.has(item.id) && item.status === 'owned');
};

export const categoryCounts = (
  childId: ID,
  sizeMode: ClosetSizeMode,
  brandId: string | undefined,
  items: Item[],
  childItems: ChildItem[],
  child?: Child,
) => {
  const owned = getOwnedItemsForChild(childId, items, childItems);
  const anchors = getSizeAnchors(owned, child);
  const counts: Record<ClosetCategory, number> = {
    tops: 0,
    pants: 0,
    'one-pieces': 0,
    'dresses-skirts': 0,
    sets: 0,
    pjs: 0,
    swim: 0,
    outerwear: 0,
    shoes: 0,
    accessories: 0,
    'cloth-diapers': 0,
    other: 0,
  };

  owned.forEach((item) => {
    if (!matchesSizeMode(item, sizeMode, anchors)) return;
    if (!matchesBrand(item, brandId)) return;
    counts[closetCategoryForItem(item)] += 1;
  });
  return counts;
};

export const categoryThumbnails = (
  childId: ID,
  sizeMode: ClosetSizeMode,
  brandId: string | undefined,
  category: ClosetCategory,
  items: Item[],
  childItems: ChildItem[],
  child?: Child,
) => {
  const owned = getOwnedItemsForChild(childId, items, childItems);
  const anchors = getSizeAnchors(owned, child);
  return owned
    .filter((item) => closetCategoryForItem(item) === category)
    .filter((item) => matchesSizeMode(item, sizeMode, anchors))
    .filter((item) => matchesBrand(item, brandId))
    .map((item) => item.cachedImageUri || item.imageUrls[0] || item.imageUrl || '')
    .filter(Boolean)
    .slice(0, 3);
};

export const categoryHasSizeUps = (childId: ID, category: ClosetCategory, items: Item[], childItems: ChildItem[], nextSize?: string, child?: Child) => {
  const owned = getOwnedItemsForChild(childId, items, childItems).filter((item) => closetCategoryForItem(item) === category);
  const anchors = getSizeAnchors(owned, child);
  const explicitNext = nextSize || anchors.nextByCategory.get(category);
  if (explicitNext) {
    return owned.some((item) => normalize(item.size) === normalize(explicitNext));
  }
  const current = anchors.currentByCategory.get(category);
  if (!current) return false;
  const currentNum = sizeToNumber(current);
  if (currentNum === undefined) return false;
  return owned.some((item) => {
    const n = sizeToNumber(item.size);
    return n !== undefined && n > currentNum;
  });
};

export const categoryHasPrintDuplicates = (childId: ID, category: ClosetCategory, items: Item[], childItems: ChildItem[]) => {
  const owned = getOwnedItemsForChild(childId, items, childItems).filter(
    (item) => closetCategoryForItem(item) === category && (item.printNameNorm || item.printName?.trim()),
  );
  const printToSizes = new Map<string, Set<string>>();
  owned.forEach((item) => {
    const key = item.printNameNorm || normalizePrintName(item.printName ?? '');
    if (!key) return;
    const prev = printToSizes.get(key) ?? new Set<string>();
    prev.add(normalize(item.size));
    printToSizes.set(key, prev);
  });
  return Array.from(printToSizes.values()).some((sizes) => sizes.size > 1);
};

export const topBrands = (childId: ID, sizeMode: ClosetSizeMode, items: Item[], childItems: ChildItem[], limit = 5, child?: Child): string[] => {
  return Object.entries(brandCounts(childId, sizeMode, items, childItems, child))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([brand]) => brand);
};

export const brandCounts = (childId: ID, sizeMode: ClosetSizeMode, items: Item[], childItems: ChildItem[], child?: Child): Record<string, number> => {
  const owned = getOwnedItemsForChild(childId, items, childItems);
  const anchors = getSizeAnchors(owned, child);
  const brandCount = new Map<string, number>();

  owned.forEach((item) => {
    if (!matchesSizeMode(item, sizeMode, anchors)) return;
    const tag = item.brandTags[0] ?? item.brand ?? '';
    const brand = tag.trim();
    if (!brand) return;
    brandCount.set(brand, (brandCount.get(brand) ?? 0) + 1);
  });

  return Object.fromEntries(brandCount.entries());
};

export const getNewThisWeek = (childId: ID, items: Item[], childItems: ChildItem[]) => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return getOwnedItemsForChild(childId, items, childItems)
    .filter((item) => item.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt);
};

export const getSizeUpsStash = (childId: ID, items: Item[], childItems: ChildItem[], storageLocations: StorageLocation[], child?: Child) => {
  const owned = getOwnedItemsForChild(childId, items, childItems);
  const anchors = getSizeAnchors(owned, child);
  const nextByCategory = anchors.nextByCategory;
  const sizeUpBin = storageLocations.find((location) => (!location.childId || location.childId === childId) && normalize(location.name) === 'size-up bin');
  const childLinks = childItems.filter((link) => link.childId === childId);
  const locationByItem = new Map(childLinks.map((link) => [link.itemId, link.storageLocationId]));

  const nextSizeItems = owned.filter((item) => {
    const category = closetCategoryForItem(item);
    const next = nextByCategory.get(category);
    if (!next) return false;
    return normalize(item.size) === normalize(next);
  });

  if (!sizeUpBin) return nextSizeItems;
  const inBin = nextSizeItems.filter((item) => locationByItem.get(item.id) === sizeUpBin.id);
  return inBin.length > 0 ? inBin : nextSizeItems;
};

export const getDuplicatePrintGroups = (childId: ID, items: Item[], childItems: ChildItem[], limit = 6) => {
  const owned = getOwnedItemsForChild(childId, items, childItems).filter((item) => item.printNameNorm || item.printName?.trim());
  const grouped = new Map<string, { printName: string; sizes: Set<string>; count: number }>();

  owned.forEach((item) => {
    const key = item.printNameNorm || normalizePrintName(item.printName ?? '');
    if (!key) return;
    const prev = grouped.get(key) ?? { printName: item.printName?.trim() || key, sizes: new Set<string>(), count: 0 };
    prev.sizes.add(item.size);
    prev.count += 1;
    grouped.set(key, prev);
  });

  return Array.from(grouped.values())
    .filter((entry) => entry.sizes.size > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((entry) => ({ printName: entry.printName, sizes: Array.from(entry.sizes), count: entry.count }));
};
