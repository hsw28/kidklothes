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
const HTML_FALLBACK_TIMEOUT_MS = 10000;

const withTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
};

const isMercariUrl = (urlValue: string) => {
  try {
    const host = new URL(urlValue).hostname.toLowerCase();
    return host.includes('mercari.com');
  } catch {
    return false;
  }
};

const parseHtmlTagContent = (html: string, regex: RegExp): string => {
  const match = html.match(regex);
  return (match?.[1] || '').trim();
};

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const parseOpenGraphFromHtml = (html: string) => {
  const ogTitle = decodeHtmlEntities(
    parseHtmlTagContent(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)
      || parseHtmlTagContent(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i),
  );
  const ogImage = parseHtmlTagContent(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || parseHtmlTagContent(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i);
  const ogSite = decodeHtmlEntities(
    parseHtmlTagContent(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i)
      || parseHtmlTagContent(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["'][^>]*>/i),
  );
  const canonical = parseHtmlTagContent(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)
    || parseHtmlTagContent(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i);
  const htmlTitle = decodeHtmlEntities(parseHtmlTagContent(html, /<title[^>]*>([^<]+)<\/title>/i));
  return { ogTitle, ogImage, ogSite, canonical, htmlTitle };
};

const parseProductLdJson = (html: string): { title?: string; image?: string; brand?: string } => {
  const scripts = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  for (const script of scripts) {
    const raw = (script[1] || '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const nodeType = String((node as any)['@type'] || '').toLowerCase();
        if (!nodeType.includes('product')) continue;
        const title = typeof (node as any).name === 'string' ? String((node as any).name).trim() : '';
        const imageField = (node as any).image;
        const image = Array.isArray(imageField)
          ? String(imageField.find((entry) => typeof entry === 'string') || '').trim()
          : typeof imageField === 'string'
            ? imageField.trim()
            : '';
        const brandField = (node as any).brand;
        const brand = typeof brandField === 'string'
          ? brandField.trim()
          : brandField && typeof brandField === 'object' && typeof (brandField as any).name === 'string'
            ? String((brandField as any).name).trim()
            : '';
        return { title: decodeHtmlEntities(title), image, brand: decodeHtmlEntities(brand) };
      }
    } catch {
      // keep scanning
    }
  }
  return {};
};

const fetchMercariHtmlFallback = async (normalizedUrl: string, fallback: ReturnType<typeof hostnameFallback>): Promise<UrlPreview | null> => {
  const { controller, timer } = withTimeoutSignal(HTML_FALLBACK_TIMEOUT_MS);
  try {
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (!html) return null;
    const og = parseOpenGraphFromHtml(html);
    const ld = parseProductLdJson(html);
    const titleBase = ld.title || og.ogTitle || og.htmlTitle || deriveTitleFromProductSlug(normalizedUrl) || fallback.title;
    const title = titleBase.replace(/\s*\|\s*Mercari.*$/i, '').trim() || titleBase;
    const imageUrl = (ld.image || og.ogImage || '').trim();
    const canonicalUrl = og.canonical || normalizedUrl;
    const canonicalBrand = await canonicalizeBrand(ld.brand || og.ogSite || 'Mercari', canonicalUrl, og.ogSite || 'Mercari');
    return {
      title,
      imageUrl,
      imageUrls: imageUrl ? [imageUrl] : [],
      brand: canonicalBrand?.brandName || ld.brand || og.ogSite || fallback.brand,
      siteName: og.ogSite || 'Mercari',
      canonicalUrl,
      sourceDomain: fallback.sourceDomain,
      isFallback: true,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const maybeEnrichMercariPreview = async (
  preview: UrlPreview,
  normalizedUrl: string,
  fallback: ReturnType<typeof hostnameFallback>,
): Promise<UrlPreview> => {
  if (!isMercariUrl(normalizedUrl)) return preview;
  const shouldEnrich = !preview.imageUrl || isWeakTitle(preview.title, preview.siteName, preview.canonicalUrl || normalizedUrl);
  if (!shouldEnrich) return preview;
  const mercari = await fetchMercariHtmlFallback(normalizedUrl, fallback);
  if (!mercari) return preview;
  return {
    ...preview,
    title: mercari.title || preview.title,
    imageUrl: mercari.imageUrl || preview.imageUrl,
    imageUrls: (mercari.imageUrls?.length ? mercari.imageUrls : preview.imageUrls) || [],
    brand: mercari.brand || preview.brand,
    siteName: mercari.siteName || preview.siteName,
    canonicalUrl: mercari.canonicalUrl || preview.canonicalUrl,
    sourceDomain: preview.sourceDomain || mercari.sourceDomain,
    isFallback: preview.isFallback && mercari.isFallback,
  };
};

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
    const preview = await buildPreview(payload, normalized, fallback);
    return maybeEnrichMercariPreview(preview, normalized, fallback);
  } catch (error) {
    if (__DEV__) console.warn('[fetchLinkMetadata] primary unfurl failed', normalized, error);
    try {
      const payload = await callUnfurl(appConfig.localUnfurlServiceBaseUrl, normalized);
      const preview = await buildPreview(payload, normalized, fallback);
      return maybeEnrichMercariPreview(preview, normalized, fallback);
    } catch (localError) {
      if (__DEV__) console.warn('[fetchLinkMetadata] local unfurl failed', normalized, localError);
      if (isMercariUrl(normalized)) {
        const mercari = await fetchMercariHtmlFallback(normalized, fallback);
        if (mercari) {
          if (__DEV__) console.warn('[fetchLinkMetadata] using Mercari HTML fallback', normalized);
          return mercari;
        }
      }
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
