import { CLOTHING_TYPES, ITEM_STATUSES, Item, ItemCategory } from '@/models';
import { closetCategories } from './categories';
import { normalizeWhitespace, trimOrNull } from './normalize';

type ItemCreateValidationInput = {
  title: string;
  clothingType: Item['clothingType'];
  status: Item['status'];
  category?: ItemCategory;
  size?: string;
};

const allowedStatuses = new Set<string>(ITEM_STATUSES);
const allowedClothingTypes = new Set<string>(CLOTHING_TYPES);
const allowedCategories = new Set<string>(closetCategories);

export const validateNewItemInput = (input: ItemCreateValidationInput): { ok: true } => {
  const title = normalizeWhitespace(input.title ?? '');
  if (!title.trim()) throw new Error('Item title is required.');
  if (!allowedClothingTypes.has(String(input.clothingType))) throw new Error(`Invalid clothingType: ${String(input.clothingType)}`);
  if (!allowedStatuses.has(String(input.status))) throw new Error(`Invalid status: ${String(input.status)}`);
  if (input.category && !allowedCategories.has(String(input.category))) throw new Error(`Invalid category: ${String(input.category)}`);
  if (input.size !== undefined && trimOrNull(input.size) !== null && normalizeWhitespace(input.size).length > 80) {
    throw new Error('Size is too long.');
  }
  return { ok: true };
};

type QuickItemValidationInput = {
  childId?: string | null;
  url?: string | null;
  status?: Item['status'] | null;
};

export const validateQuickLinkSaveInput = (input: QuickItemValidationInput): { ok: true } => {
  if (!input.childId) throw new Error('Please choose a kid.');
  const url = trimOrNull(input.url);
  if (!url) throw new Error('Please add a product URL.');
  if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http:// or https://');
  if (!input.status || !allowedStatuses.has(String(input.status))) {
    throw new Error(`Invalid status: ${String(input.status ?? '')}`);
  }
  return { ok: true };
};
