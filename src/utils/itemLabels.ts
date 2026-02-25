import { Item } from '@/models';

export const formatClothingTypeLabel = (type?: Item['clothingType']): string => {
  switch (type) {
    case 'top':
      return 'Tops';
    case 'bottom':
      return 'Pants';
    case 'sleeper':
      return 'PJs';
    case 'romper':
      return 'One Pieces';
    case 'dress':
      return 'Dresses & Skirts';
    case 'outerwear':
      return 'Outerwear';
    case 'shoes':
      return 'Shoes';
    case 'accessory':
      return 'Accessories';
    default:
      return 'Other';
  }
};

export const formatItemCategoryLabel = (item: Pick<Item, 'category' | 'clothingType'>): string => {
  switch (item.category) {
    case 'pants':
      return 'Pants & Shorts';
    case 'tops':
      return 'Tops';
    case 'pjs':
      return 'PJs';
    case 'swim':
      return 'Swim';
    case 'bottoms':
      return 'Pants & Shorts';
    case 'one-piece':
    case 'one-pieces':
      return 'One Pieces';
    case 'shoes':
      return 'Shoes';
    case 'outerwear':
      return 'Outerwear';
    case 'dresses':
    case 'dresses-skirts':
      return 'Dresses & Skirts';
    case 'accessories':
      return 'Accessories';
    case 'sets':
      return 'Sets';
    case 'swim':
      return 'Swim';
    case 'other':
      return 'Other';
    default:
      return formatClothingTypeLabel(item.clothingType);
  }
};

export const getBrandShortLabel = (brandName: string, domain?: string): string => {
  const normalized = brandName.trim().toLowerCase();
  const known: Record<string, string> = {
    'kate quinn': 'KQ',
    'little sleepies': 'LS',
    'kyte baby': 'Kyte',
    'posh peanut': 'Posh',
    'bums & roses': 'B&R',
    'bums and roses': 'B&R',
  };
  if (known[normalized]) return known[normalized];

  const cleaned = brandName.trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    const base = cleaned || (domain ?? '');
    return base.slice(0, 10);
  }
  return parts
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);
};
