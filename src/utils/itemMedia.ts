import { Item } from '@/models';

type ItemImageLike = Pick<Item, 'cachedImageUri' | 'imageUrls' | 'imageUrl'>;

export const getItemDisplayImageUri = (item: ItemImageLike): string | undefined => {
  const candidate = item.cachedImageUri || item.imageUrls?.[0] || item.imageUrl || '';
  const trimmed = candidate.trim();
  return trimmed || undefined;
};

export const hasSavedItemImage = (item: ItemImageLike): boolean => Boolean(getItemDisplayImageUri(item));

