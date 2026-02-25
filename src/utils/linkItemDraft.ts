import { ID, ItemStatus } from '@/models';
import { resolveOutboundLink } from './outbound';
import { fetchLinkMetadata } from './unfurlUrl';

const fallbackTitleFromUrl = (raw: string) => {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return 'New Item';
  }
};

export type LinkItemDraft = {
  childId?: ID;
  url: string;
  sourceDomain?: string;
  canonicalUrl?: string;
  outboundUrl?: string;
  title: string;
  brand?: string;
  brandTags: string[];
  imageUrl?: string;
  imageUrls: string[];
  status: ItemStatus;
  statusForChild: ItemStatus;
  clothingType: 'top';
  size: string;
  tags: string[];
  notes?: string;
  seasonTags: string[];
};

export const fetchLinkItemDraft = async ({
  url,
  childId,
  status,
}: {
  url: string;
  childId?: ID;
  status: ItemStatus;
}): Promise<LinkItemDraft> => {
  const normalizedUrl = url.trim();
  const preview = await fetchLinkMetadata(normalizedUrl).catch((error) => {
    if (__DEV__) console.warn('[fetchLinkItemDraft] metadata fetch failed', normalizedUrl, error);
    return {
      title: fallbackTitleFromUrl(normalizedUrl),
      brand: '',
      imageUrl: '',
      imageUrls: [],
      canonicalUrl: normalizedUrl,
      sourceDomain: '',
    };
  });

  const link = resolveOutboundLink(normalizedUrl, {
    canonicalUrl: preview.canonicalUrl || normalizedUrl,
    monetize: false,
  });

  const imageUrls = Array.from(new Set([preview.imageUrl, ...(preview.imageUrls ?? [])].map((v) => (v || '').trim()).filter(Boolean)));
  const brand = (preview.brand || '').trim() || undefined;

  return {
    childId,
    url: normalizedUrl,
    sourceDomain: preview.sourceDomain || link.sourceDomain || undefined,
    canonicalUrl: preview.canonicalUrl || link.canonicalUrl || undefined,
    outboundUrl: link.outboundUrl || undefined,
    title: preview.title || fallbackTitleFromUrl(normalizedUrl),
    brand,
    brandTags: brand ? [brand] : [],
    imageUrl: imageUrls[0],
    imageUrls,
    status,
    statusForChild: status,
    clothingType: 'top',
    size: '',
    tags: [],
    notes: undefined,
    seasonTags: [],
  };
};
