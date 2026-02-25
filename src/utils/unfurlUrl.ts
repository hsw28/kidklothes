import { appConfig } from '@/config';
import { canonicalizeBrand, prettyBrandFallback } from './brandNormalize';

export interface UrlPreview {
  title: string;
  imageUrl: string;
  imageUrls?: string[];
  brand: string;
  siteName?: string;
  canonicalUrl?: string;
  sourceDomain?: string;
  isFallback?: boolean;
}

interface UnfurlServiceResponse {
  title?: string;
  image?: string;
  images?: string[];
  siteName?: string;
  canonicalUrl?: string;
  brand?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

const isWeakTitle = (title?: string, siteName?: string, canonicalUrl?: string): boolean => {
  const raw = (title || '').trim();
  if (!raw) return true;
  if (raw.length < 6) return true;
  const norm = raw.toLowerCase().replace(/[^\w]+/g, '');
  const site = (siteName || '').trim().toLowerCase().replace(/[^\w]+/g, '');
  const host = (canonicalUrl || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    ?.replace(/\.(com|net|org|shop|co)$/i, '')
    .replace(/[^\w]+/g, '');
  return Boolean(norm && (norm === site || norm === host));
};

const titleCaseLite = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length <= 2 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
    .replace(/\bPjs\b/g, 'PJs');

const deriveTitleFromProductSlug = (urlValue: string): string => {
  try {
    const parsed = new URL(urlValue);
    const productsIndex = parsed.pathname.split('/').findIndex((part) => part === 'products');
    const slug = productsIndex >= 0 ? parsed.pathname.split('/')[productsIndex + 1] : parsed.pathname.split('/').filter(Boolean).pop();
    if (!slug) return '';
    const cleaned = slug
      .replace(/\?.*$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b(w\d{2,4}|organic|cotton|modal|rib|jersey)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned ? titleCaseLite(cleaned) : '';
  } catch {
    return '';
  }
};

const hostnameFallback = (inputUrl: string) => {
  const parsed = new URL(inputUrl.trim());
  const hostname = parsed.hostname.replace(/^www\./, '');
  const brand = prettyBrandFallback(null, parsed.toString(), null) || hostname.split('.')[0] || hostname;
  return {
    brand,
    title: brand || hostname,
    canonicalUrl: parsed.toString(),
    sourceDomain: hostname.toLowerCase(),
  };
};

const UNFURL_TIMEOUT_MS = 15000;

const callUnfurl = async (baseUrl: string, normalizedUrl: string): Promise<UnfurlServiceResponse> => {
  const base = baseUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UNFURL_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/unfurl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: normalizedUrl }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as UnfurlServiceResponse;
    if (!response.ok) {
      const err = new Error(payload.error || 'Unfurl service failed') as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    return payload;
  } catch (error) {
    if (__DEV__) {
      const err = error as Error & { status?: number };
      const status = err?.status ? `status=${err.status}` : 'status=n/a';
      console.warn(`[unfurl] ${status} ${err?.message || 'request failed'}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const buildPreview = async (payload: UnfurlServiceResponse, normalized: string, fallback: ReturnType<typeof hostnameFallback>): Promise<UrlPreview> => {
  let canonical = (payload.canonicalUrl || '').trim();
  if (canonical) {
    try {
      canonical = new URL(canonical, normalized).toString();
    } catch {
      canonical = '';
    }
  }
  const metadataSource = String(payload.metadata?.imageSource || payload.metadata?.source || 'unknown');
  const serverTitle = (payload.title || '').trim();
  const slugTitle = deriveTitleFromProductSlug(canonical || normalized);
  const useSlugTitle = isWeakTitle(serverTitle, payload.siteName, canonical || normalized);
  const finalTitle = (useSlugTitle ? slugTitle : serverTitle) || serverTitle || fallback.title;
  const primaryImage = (payload.image || payload.images?.[0] || '').trim();
  const finalImageUrl = primaryImage.startsWith('//') ? `https:${primaryImage}` : primaryImage;
  if (__DEV__) {
    console.log('[fetchLinkMetadata] extraction', {
      url: normalized,
      source: metadataSource,
      usedSlugTitle: useSlugTitle,
      hasImage: Boolean(finalImageUrl),
    });
  }
  const canonicalBrand = await canonicalizeBrand(payload.brand ?? null, normalized, payload.siteName ?? null);
  const fallbackBrand = prettyBrandFallback(payload.brand ?? null, normalized, payload.siteName ?? null) || fallback.brand;
  return {
    title: finalTitle,
    imageUrl: finalImageUrl || '',
    imageUrls: [payload.image, ...(payload.images ?? [])].map((img) => (img ?? '').trim()).filter(Boolean).slice(0, 6),
    brand: canonicalBrand?.brandName || (payload.brand || payload.siteName || '').trim() || fallbackBrand,
    siteName: (payload.siteName || '').trim() || undefined,
    canonicalUrl: canonical || fallback.canonicalUrl,
    sourceDomain: fallback.sourceDomain,
    isFallback: false,
  };
};

export const fetchLinkMetadata = async (inputUrl: string): Promise<UrlPreview> => {
  const normalized = inputUrl.trim();
  if (!normalized) throw new Error('URL is required');
  const fallback = hostnameFallback(normalized);

  try {
    const payload = await callUnfurl(appConfig.unfurlServiceBaseUrl, normalized);
    return buildPreview(payload, normalized, fallback);
  } catch (error) {
    if (__DEV__) console.warn('[fetchLinkMetadata] primary unfurl failed', normalized, error);
    try {
      const payload = await callUnfurl(appConfig.localUnfurlServiceBaseUrl, normalized);
      return buildPreview(payload, normalized, fallback);
    } catch (localError) {
      if (__DEV__) console.warn('[fetchLinkMetadata] local unfurl failed', normalized, localError);
      const canonicalBrand = await canonicalizeBrand(fallback.brand, normalized, fallback.brand);
      if (__DEV__) console.warn('[fetchLinkMetadata] using fallback metadata', normalized);
      const slugTitle = deriveTitleFromProductSlug(normalized);
      return {
        title: slugTitle || fallback.title,
        imageUrl: '',
        imageUrls: [],
        brand: canonicalBrand?.brandName || fallback.brand,
        siteName: canonicalBrand?.brandName || fallback.brand,
        canonicalUrl: fallback.canonicalUrl,
        sourceDomain: fallback.sourceDomain,
        isFallback: true,
      };
    }
  }
};

export const unfurlUrl = fetchLinkMetadata;
