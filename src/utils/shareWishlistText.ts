import { Child, ChildItem, Item } from '@/models';
import { formatItemCategoryLabel } from './itemLabels';

type ShareWishlistTextOptions = {
  childId?: string;
  childName?: string;
  sizeBucketLabel?: 'Now' | 'Next' | 'Both';
  monetizationEnabled?: boolean;
  children?: Child[];
  childItems?: ChildItem[];
  includeDate?: boolean;
};

type GroupedEntry = {
  childName: string;
  sizeLabel: string;
  categoryLabel: string;
  item: Item;
};

const clean = (value?: string | null): string => (value ?? '').trim();

const sortCaseInsensitive = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

const getChildNamesForItem = (
  item: Item,
  options: ShareWishlistTextOptions,
  childMap: Map<string, Child>,
): string[] => {
  if (options.childName) return [options.childName];
  if (options.childId) return [childMap.get(options.childId)?.name ?? 'Unknown child'];
  const linked = (options.childItems ?? [])
    .filter((link) => link.itemId === item.id && !link.deletedAt)
    .map((link) => childMap.get(link.childId)?.name)
    .filter(Boolean) as string[];
  return linked.length ? Array.from(new Set(linked)) : ['Unassigned'];
};

export const formatWishlistShareText = (items: Item[], options: ShareWishlistTextOptions = {}): string => {
  const childMap = new Map((options.children ?? []).map((child) => [child.id, child]));
  const headerLines = ['Wishlist'];

  if (options.childName) {
    headerLines.push(`Child: ${options.childName}`);
  } else if (options.childId) {
    headerLines.push(`Child: ${childMap.get(options.childId)?.name ?? 'Unknown child'}`);
  }

  if (options.sizeBucketLabel) {
    headerLines.push(`Sizes: ${options.sizeBucketLabel}`);
  }

  if (options.includeDate) {
    headerLines.push(`Date: ${new Date().toLocaleDateString()}`);
  }

  const grouped: GroupedEntry[] = [];
  for (const item of items) {
    for (const childName of getChildNamesForItem(item, options, childMap)) {
      grouped.push({
        childName,
        sizeLabel: clean(item.size) || 'No size',
        categoryLabel: formatItemCategoryLabel(item),
        item,
      });
    }
  }

  grouped.sort((a, b) => {
    return (
      sortCaseInsensitive(a.childName, b.childName)
      || sortCaseInsensitive(a.sizeLabel, b.sizeLabel)
      || sortCaseInsensitive(a.categoryLabel, b.categoryLabel)
      || sortCaseInsensitive(a.item.printName ?? '', b.item.printName ?? '')
      || sortCaseInsensitive(a.item.title, b.item.title)
    );
  });

  const lines: string[] = [];
  let currentChild = '';
  let currentSize = '';
  let currentCategory = '';

  for (const entry of grouped) {
    if (entry.childName !== currentChild) {
      currentChild = entry.childName;
      currentSize = '';
      currentCategory = '';
      lines.push('', entry.childName);
    }

    if (entry.sizeLabel !== currentSize) {
      currentSize = entry.sizeLabel;
      currentCategory = '';
      lines.push(`  ${entry.sizeLabel}`);
    }

    if (entry.categoryLabel !== currentCategory) {
      currentCategory = entry.categoryLabel;
      lines.push(`    ${entry.categoryLabel}`);
    }

    const printName = clean(entry.item.printName);
    const title = clean(entry.item.title) || 'Untitled item';
    const brand = clean(entry.item.brand) || 'Brand N/A';
    const size = clean(entry.item.size) || 'No size';
    const bulletTitle = printName ? `${printName}: ${title}` : title;
    lines.push(`      • ${bulletTitle} — ${brand} — ${size}`);
    const url = clean(entry.item.outboundUrl) || clean(entry.item.url);
    if (url) {
      lines.push(`        ${url}`);
    }
  }

  const disclosure = options.monetizationEnabled ? '\n\nDisclosure: Some links may be affiliate links.' : '';
  return `${headerLines.join('\n')}\n${lines.join('\n')}${disclosure}`.trim();
};

