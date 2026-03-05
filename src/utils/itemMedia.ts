import { Item } from '@/models';

type ItemImageLike = Pick<Item, 'cachedImageUri' | 'imageUrls' | 'imageUrl'>;

const normalize = (value?: string | null): string | undefined => {
  const trimmed = (value ?? '').trim();
  return trimmed || undefined;
};

const isRemoteHttp = (value?: string) => Boolean(value && /^https?:\/\//i.test(value));
const isLocalImageUri = (value?: string) => Boolean(value && /^(file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/i.test(value));

export const getItemRemoteImageUri = (item: ItemImageLike): string | undefined => {
  const fromList = (item.imageUrls ?? []).map((entry) => normalize(entry)).find((entry) => isRemoteHttp(entry));
  if (fromList) return fromList;
  const single = normalize(item.imageUrl);
  return isRemoteHttp(single) ? single : undefined;
};

export const getItemLocalImageUri = (item: ItemImageLike): string | undefined => {
  const fromCache = normalize(item.cachedImageUri);
  if (isLocalImageUri(fromCache)) return fromCache;
  const fromList = (item.imageUrls ?? []).map((entry) => normalize(entry)).find((entry) => isLocalImageUri(entry));
  if (fromList) return fromList;
  const single = normalize(item.imageUrl);
  return isLocalImageUri(single) ? single : undefined;
};

export const getItemDisplayImageUri = (item: ItemImageLike): string | undefined => {
  const cached = normalize(item.cachedImageUri);
  const remote = getItemRemoteImageUri(item);
  const firstAny = normalize(item.imageUrls?.[0]) || normalize(item.imageUrl);

  if (cached) {
    // Older builds stored cache files under OS cache dirs, which can disappear after upgrades.
    // Prefer remote source when cache URI is from Caches and a remote URL exists.
    if (remote && /\/caches\//i.test(cached)) return remote;
    return cached;
  }

  return remote || firstAny;
};

export const getItemDisplayFallbackUri = (item: ItemImageLike): string | undefined => {
  const display = getItemDisplayImageUri(item);
  const remote = getItemRemoteImageUri(item);
  if (!display || !remote) return undefined;
  return display === remote ? undefined : remote;
};

export const hasSavedItemImage = (item: ItemImageLike): boolean => Boolean(getItemDisplayImageUri(item));
