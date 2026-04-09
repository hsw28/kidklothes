import { Child, Item } from '@/models';
import { groupItemsByStyle } from './siblingMatches';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const child = (id: string, name: string): Child => ({
  id,
  name,
  sortOrder: 0,
  usesMixedSizes: false,
  hiddenClosetCategories: [],
  currentSize: { code: null },
  nextSize: { code: null },
  createdAt: 0,
  updatedAt: 0,
});

const item = (overrides: Partial<Item>): Item => ({
  id: overrides.id ?? 'item',
  title: overrides.title ?? 'Bear romper',
  size: overrides.size ?? '2T',
  imageUrls: [],
  createdAt: 0,
  updatedAt: 0,
  clickCount: 0,
  quantity: 1,
  brandTags: [],
  clothingType: 'romper',
  status: 'owned',
  bstFlawTags: [],
  seasonTags: [],
  wornCount: 0,
  tags: [],
  childIds: overrides.childIds ?? [],
  ...overrides,
});

export const runSiblingMatchesLightweightTests = () => {
  const children = [child('a', 'Alice'), child('e', 'Emma'), child('m', 'Mia')];
  const groups = groupItemsByStyle([
    item({ id: '1', childIds: ['a'], printName: 'Bear Print', printNameNorm: 'bear-print', brand: 'Kate Quinn', size: '2T' }),
    item({ id: '2', childIds: ['e'], printName: 'Bear Print', printNameNorm: 'bear-print', brand: 'Kate Quinn', size: '6-12M' }),
    item({ id: '3', childIds: ['m'], title: 'Striped pajamas', styleName: 'Striped Pajamas', brand: 'Little Sleepies', size: '18-24M' }),
    item({ id: '4', childIds: ['a'], title: 'Striped pajamas', styleName: 'Striped Pajamas', brand: 'Little Sleepies', size: '2T' }),
    item({ id: '5', childIds: ['m'], printName: 'Bear Print', printNameNorm: 'bear-print', brand: 'Little Sleepies', size: '18-24M' }),
  ], children);

  assert(groups.length === 2, 'a) should build both print and style groups');

  const bear = groups.find((group) => group.groupId === 'print:bear-print:kate quinn');
  assert(Boolean(bear), 'b) should prefer canonical print grouping when available');
  assert(bear?.missingChildren.length === 1 && bear.missingChildren[0]?.childName === 'Mia', 'c) should compute missing children');
  assert(bear?.matchType === 'partial_match', 'd) should classify shared prints missing another child as a partial match');
  assert(!groups.some((group) => group.groupId === 'print:bear-print:little sleepies'), 'e) should not build a sibling match for a different brand with only one child present');

  const striped = groups.find((group) => group.groupId === 'style:striped-pajamas:little sleepies');
  assert(Boolean(striped), 'f) should fall back to normalized style grouping');
  assert(striped?.childrenPresent.length === 2, 'g) should include both children present in style group');
  assert(striped?.matchType === 'partial_match', 'h) should mark 3+ child household partial matches correctly');
};
