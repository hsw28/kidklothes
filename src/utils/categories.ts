import { AppSettings, ClothingType, CustomCategory, ItemCategory } from '@/models';

export type ClosetCategory =
  | 'tops'
  | 'pants'
  | 'one-pieces'
  | 'dresses-skirts'
  | 'sets'
  | 'pjs'
  | 'swim'
  | 'outerwear'
  | 'shoes'
  | 'accessories'
  | 'cloth-diapers'
  | 'other';

export type ClosetCategoryDef = {
  id: ClosetCategory;
  label: string;
  icon?: string;
  sortOrder: number;
};

export type DrawerScanCategoryDef = {
  id: string;
  label: string;
  category: ClosetCategory;
  clothingType: ClothingType;
};

export const CUSTOM_CATEGORY_PREFIX = 'custom:';

export const CLOSET_CATEGORY_DEFS: ClosetCategoryDef[] = [
  { id: 'tops', label: 'Tops', icon: 'top', sortOrder: 10 },
  { id: 'pants', label: 'Pants & Shorts', icon: 'pants', sortOrder: 20 },
  { id: 'one-pieces', label: 'One Pieces', icon: 'one-piece', sortOrder: 30 },
  { id: 'dresses-skirts', label: 'Dresses & Skirts', icon: 'dress', sortOrder: 40 },
  { id: 'sets', label: 'Sets', icon: 'set', sortOrder: 50 },
  { id: 'pjs', label: 'PJs', icon: 'pjs', sortOrder: 60 },
  { id: 'swim', label: 'Swim', icon: 'swim', sortOrder: 70 },
  { id: 'outerwear', label: 'Outerwear', icon: 'outerwear', sortOrder: 80 },
  { id: 'shoes', label: 'Shoes', icon: 'shoes', sortOrder: 85 },
  { id: 'accessories', label: 'Accessories', icon: 'accessory', sortOrder: 90 },
  { id: 'cloth-diapers', label: 'Cloth Diapers', icon: 'cloth-diaper', sortOrder: 95 },
  { id: 'other', label: 'Other', icon: 'other', sortOrder: 100 },
];

export const CLOSET_CATEGORY_BY_ID: Record<ClosetCategory, ClosetCategoryDef> = Object.fromEntries(
  CLOSET_CATEGORY_DEFS.map((entry) => [entry.id, entry]),
) as Record<ClosetCategory, ClosetCategoryDef>;

export const closetCategories: ClosetCategory[] = CLOSET_CATEGORY_DEFS.slice()
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((entry) => entry.id);

export const closetLabel: Record<ClosetCategory, string> = Object.fromEntries(
  CLOSET_CATEGORY_DEFS.map((entry) => [entry.id, entry.label]),
) as Record<ClosetCategory, string>;

export const categoryIconName: Record<ClosetCategory, string> = {
  tops: 'shirt-outline',
  pants: 'git-branch-outline',
  'one-pieces': 'body-outline',
  'dresses-skirts': 'woman-outline',
  sets: 'layers-outline',
  pjs: 'moon-outline',
  swim: 'water-outline',
  outerwear: 'cloud-outline',
  shoes: 'footsteps-outline',
  accessories: 'sparkles-outline',
  'cloth-diapers': 'layers-outline',
  other: 'apps-outline',
};

export const categoryGlyph: Record<ClosetCategory, string> = {
  tops: 'T',
  pants: 'P',
  'one-pieces': 'O',
  'dresses-skirts': 'D',
  sets: 'S',
  pjs: 'PJ',
  swim: 'S',
  outerwear: 'OW',
  shoes: 'S',
  accessories: 'A',
  'cloth-diapers': 'CD',
  other: 'O',
};

export const getCategoryEmptyMicrocopy = (category: ClosetCategory, count: number): string => {
  if (count <= 0) return `No ${closetLabel[category]} yet`;
  return `Add your first photo`;
};

export const ADD_ITEM_CATEGORY_OPTIONS: ClosetCategory[] = [...closetCategories];

export const KIDS_PREVIEW_CATEGORIES: ClosetCategory[] = [...closetCategories];
export const DEFAULT_WISHLIST_CATEGORY_ORDER: ClosetCategory[] = closetCategories.filter((category) => category !== 'other');

export const DRAWER_SCAN_CATEGORY_DEFS: DrawerScanCategoryDef[] = [
  { id: 'pants', label: 'Pants', category: 'pants', clothingType: 'bottom' },
  { id: 'tops', label: 'Tops', category: 'tops', clothingType: 'top' },
  { id: 'pjs', label: 'PJs', category: 'pjs', clothingType: 'sleeper' },
  { id: 'swim', label: 'Swim', category: 'swim', clothingType: 'top' },
  { id: 'outerwear', label: 'Outerwear', category: 'outerwear', clothingType: 'outerwear' },
  { id: 'shoes', label: 'Shoes', category: 'shoes', clothingType: 'shoes' },
  { id: 'dresses-skirts', label: closetLabel['dresses-skirts'], category: 'dresses-skirts', clothingType: 'dress' },
  { id: 'socks-undies', label: 'Socks/Undies', category: 'accessories', clothingType: 'accessory' },
  { id: 'other', label: 'Other', category: 'other', clothingType: 'accessory' },
];

export const BATCH_ADD_CLOTHING_TYPE_OPTIONS: ClothingType[] = [
  'top',
  'bottom',
  'sleeper',
  'outerwear',
  'shoes',
  'dress',
  'romper',
  'accessory',
];

export const clothingTypeDisplayLabel = (type: ClothingType): string => {
  switch (type) {
    case 'top':
      return 'Tops';
    case 'bottom':
      return closetLabel.pants;
    case 'sleeper':
      return 'PJs';
    case 'outerwear':
      return 'Outerwear';
    case 'shoes':
      return 'Shoes';
    case 'dress':
      return closetLabel['dresses-skirts'];
    case 'romper':
      return 'One Pieces';
    case 'other':
      return 'Other';
    case 'accessory':
      return 'Accessories';
    default:
      return 'Other';
  }
};

const legacyItemCategoryToClosetCategory: Record<string, ClosetCategory> = {
  pants: 'pants',
  bottoms: 'pants',
  tops: 'tops',
  pjs: 'pjs',
  'one-piece': 'one-pieces',
  'one-pieces': 'one-pieces',
  outerwear: 'outerwear',
  shoes: 'shoes',
  dresses: 'dresses-skirts',
  'dresses-skirts': 'dresses-skirts',
  accessories: 'accessories',
  'cloth-diapers': 'cloth-diapers',
  sets: 'sets',
  swim: 'swim',
  other: 'other',
};

export const isCustomCategoryId = (value?: string | null): value is string =>
  Boolean(value && String(value).startsWith(CUSTOM_CATEGORY_PREFIX));

export const getCustomCategoryFallbackLabel = (categoryId: string): string => {
  const raw = categoryId.replace(CUSTOM_CATEGORY_PREFIX, '').trim();
  if (!raw) return 'Custom Category';
  return raw
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const getCategoryLabel = (
  category: string,
  customCategories?: Array<Pick<CustomCategory, 'id' | 'name'>>,
): string => {
  if (isClosetCategory(category)) return closetLabel[category];
  if (isCustomCategoryId(category)) {
    return customCategories?.find((entry) => entry.id === category)?.name ?? getCustomCategoryFallbackLabel(category);
  }
  return getCustomCategoryFallbackLabel(category);
};

export const getCategoryGlyphForId = (
  category: string,
  customCategories?: Array<Pick<CustomCategory, 'id' | 'name' | 'icon'>>,
): string => {
  if (isClosetCategory(category)) return categoryGlyph[category];
  const custom = customCategories?.find((entry) => entry.id === category);
  const icon = (custom?.icon ?? '').trim();
  if (icon) return icon;
  const label = getCategoryLabel(category, customCategories);
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || '+';
};

export const normalizeItemCategoryToClosetCategory = (category?: ItemCategory | string | null): ClosetCategory | undefined => {
  if (!category) return undefined;
  return legacyItemCategoryToClosetCategory[String(category).trim()] ?? undefined;
};

export const closetCategoryToClothingType = (category?: ClosetCategory | string): ClothingType => {
  if (category && isCustomCategoryId(category)) return closetCategoryToClothingType('other');
  switch (category) {
    case 'pants':
      return 'bottom';
    case 'tops':
      return 'top';
    case 'pjs':
      return 'sleeper';
    case 'swim':
      return 'top';
    case 'one-pieces':
      return 'romper';
    case 'outerwear':
      return 'outerwear';
    case 'shoes':
      return 'shoes';
    case 'dresses-skirts':
      return 'dress';
    case 'accessories':
      return 'accessory';
    case 'cloth-diapers':
      return 'accessory';
    case 'sets':
      return 'top';
    case 'other':
      return 'other';
    default:
      return 'top';
  }
};

export const isClosetCategory = (value: string): value is ClosetCategory => closetCategories.includes(value as ClosetCategory);

export const sanitizeCategoryOrder = (
  order?: readonly string[] | null,
  options?: { includeOther?: boolean; fallback?: readonly ClosetCategory[] },
): ClosetCategory[] => {
  const includeOther = options?.includeOther ?? true;
  const fallback = [...(options?.fallback ?? closetCategories)];
  const allowed = fallback.filter((category) => includeOther || category !== 'other');
  const seen = new Set<ClosetCategory>();
  const next: ClosetCategory[] = [];

  (order ?? []).forEach((entry) => {
    if (!isClosetCategory(entry)) return;
    if (!includeOther && entry === 'other') return;
    if (!allowed.includes(entry) || seen.has(entry)) return;
    seen.add(entry);
    next.push(entry);
  });

  allowed.forEach((entry) => {
    if (seen.has(entry)) return;
    seen.add(entry);
    next.push(entry);
  });

  if (includeOther) {
    const otherIndex = next.indexOf('other');
    if (otherIndex >= 0 && otherIndex !== next.length - 1) {
      next.splice(otherIndex, 1);
      next.push('other');
    }
  }

  return next;
};

export const sanitizeHiddenCategories = (
  hidden?: readonly string[] | null,
  options?: { includeOther?: boolean },
): ClosetCategory[] => {
  const includeOther = options?.includeOther ?? true;
  const seen = new Set<ClosetCategory>();
  const next: ClosetCategory[] = [];
  (hidden ?? []).forEach((entry) => {
    if (!isClosetCategory(entry)) return;
    if (!includeOther && entry === 'other') return;
    if (seen.has(entry)) return;
    seen.add(entry);
    next.push(entry);
  });
  return next;
};

export const applyCategoryPreferences = (
  base: readonly ClosetCategory[],
  input?: {
    order?: readonly string[] | null;
    hidden?: readonly string[] | null;
    includeOther?: boolean;
  },
): ClosetCategory[] => {
  const ordered = sanitizeCategoryOrder(input?.order, { includeOther: input?.includeOther ?? true, fallback: base });
  const hidden = new Set(sanitizeHiddenCategories(input?.hidden, { includeOther: input?.includeOther ?? true }));
  return ordered.filter((category) => !hidden.has(category));
};

export const reorderCategoryList = (
  list: readonly string[],
  category: string,
  direction: 'up' | 'down',
): string[] => {
  const next = [...list];
  const index = next.indexOf(category);
  if (index < 0) return next;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= next.length) return next;
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
};

export const getConfiguredClosetCategories = (settings?: Pick<AppSettings, 'closetCategoryOrder' | 'hiddenClosetCategoriesGlobal'>) =>
  applyCategoryPreferences(closetCategories, {
    order: settings?.closetCategoryOrder,
    hidden: settings?.hiddenClosetCategoriesGlobal,
    includeOther: true,
  });

export const getConfiguredWishlistCategories = (settings?: Pick<AppSettings, 'wishlistCategoryOrder' | 'hiddenWishlistCategories'>) =>
  applyCategoryPreferences(DEFAULT_WISHLIST_CATEGORY_ORDER, {
    order: settings?.wishlistCategoryOrder,
    hidden: settings?.hiddenWishlistCategories,
    includeOther: false,
  });

export const getConfiguredKidsPreviewCategories = (
  settings?: Pick<AppSettings, 'kidsPreviewCategories'>,
  customCategories?: Array<Pick<CustomCategory, 'id'>>,
) => {
  const allowed = [...KIDS_PREVIEW_CATEGORIES, ...((customCategories ?? []).map((entry) => entry.id))];
  const seen = new Set<string>();
  const normalized = (settings?.kidsPreviewCategories ?? []).filter((entry) => {
    if (!allowed.includes(entry)) return false;
    if (seen.has(entry)) return false;
    seen.add(entry);
    return true;
  });

  if (normalized.length === 0) return [...allowed];

  allowed.forEach((entry) => {
    if (seen.has(entry)) return;
    seen.add(entry);
    normalized.push(entry);
  });

  const otherIndex = normalized.indexOf('other');
  if (otherIndex >= 0 && otherIndex !== normalized.length - 1) {
    normalized.splice(otherIndex, 1);
    normalized.push('other');
  }

  return normalized;
};
