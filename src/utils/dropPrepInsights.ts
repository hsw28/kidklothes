import { Child, ChildItem, ID, Item } from '@/models';
import { closetCategoryForItem, getOwnedItemsForChild, getSizeAnchors } from './closetViewInsights';
import { ClosetCategory, closetCategories } from './categories';
import { normalizePrintName } from './printName';

export type DropPrepSummary = {
  typeCountsNow: Record<ClosetCategory, number>;
  typeCountsNext: Record<ClosetCategory, number>;
  sizeUpsTotal: number;
  printDupGroupCount: number;
  styleDupGroupCount: number;
  forSaleCount: number;
};

const normalize = (value: string) => value.toLowerCase().trim();

const initCategoryCounts = (): Record<ClosetCategory, number> => ({
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
  other: 0,
});

const matchesBrand = (item: Item, brandId?: string) => {
  if (!brandId || brandId === 'All') return true;
  const target = normalize(brandId);
  if (normalize(item.brand ?? '') === target) return true;
  return item.brandTags.some((tag) => normalize(tag) === target);
};

export const getDropPrepSummary = (childId: ID, items: Item[], childItems: ChildItem[], brandId?: string, child?: Child): DropPrepSummary => {
  const owned = getOwnedItemsForChild(childId, items, childItems).filter((item) => matchesBrand(item, brandId));
  const anchors = getSizeAnchors(owned, child);
  const typeCountsNow = initCategoryCounts();
  const typeCountsNext = initCategoryCounts();

  const printGroups = new Map<string, number>();
  const styleGroups = new Map<string, number>();

  owned.forEach((item) => {
    const category = closetCategoryForItem(item);
    const current = anchors.currentByCategory.get(category);
    const next = anchors.nextByCategory.get(category);
    const isNow = Boolean(current && normalize(item.size) === normalize(current));
    const isNext = Boolean(next && normalize(item.size) === normalize(next));
    if (isNow) typeCountsNow[category] += 1;
    if (isNext) typeCountsNext[category] += 1;

    const canonicalPrint = item.printNameNorm || normalizePrintName(item.printName ?? '');
    if (canonicalPrint) {
      const key = canonicalPrint;
      printGroups.set(key, (printGroups.get(key) ?? 0) + 1);
    }

    const styleKey = normalize(item.styleName || item.title || '');
    if (styleKey) {
      const key = `${styleKey}|${normalize(item.brand ?? '')}|${category}`;
      styleGroups.set(key, (styleGroups.get(key) ?? 0) + 1);
    }
  });

  const linked = new Map(childItems.filter((link) => link.childId === childId).map((link) => [link.itemId, link.statusForChild]));
  const forSaleCount = items.filter((item) => {
    if (!linked.has(item.id)) return false;
    if (!matchesBrand(item, brandId)) return false;
    const effectiveStatus = linked.get(item.id) ?? item.status;
    return effectiveStatus === 'for-sale';
  }).length;

  const sizeUpsTotal = closetCategories.reduce((sum, category) => sum + typeCountsNext[category], 0);
  const printDupGroupCount = Array.from(printGroups.values()).filter((count) => count > 1).length;
  const styleDupGroupCount = Array.from(styleGroups.values()).filter((count) => count > 1).length;

  return {
    typeCountsNow,
    typeCountsNext,
    sizeUpsTotal,
    printDupGroupCount,
    styleDupGroupCount,
    forSaleCount,
  };
};
