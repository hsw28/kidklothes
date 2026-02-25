import express from 'express';
import { load } from 'cheerio';
import { LRUCache } from 'lru-cache';
import { fetch } from 'undici';

const PORT = Number(process.env.PORT || 4000);
const REQUEST_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 1024 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'layetteout-unfurl-service/2.0 (+https://layetteout.com)';

interface UnfurlResult {
  canonicalUrl: string;
  title: string;
  image?: string;
  images: string[];
  siteName: string;
  price?: string;
  currency?: string;
  availability?: string;
  brand?: string;
  jsonLd?: unknown;
  metadata: Record<string, unknown>;
}

type Extractor = (ctx: { html: string; finalUrl: string; $: ReturnType<typeof load> }) => Partial<UnfurlResult>;

const cache = new LRUCache<string, UnfurlResult>({ max: 500, ttl: CACHE_TTL_MS });

const isAllowedHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeText = (value?: string): string => (value ?? '').trim();
const collapseSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalizeUrlValue = (value?: string, base?: string): string => {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (!base) return raw;
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
};

const stripCommonTrackingParams = (urlValue: string): string => {
  try {
    const parsed = new URL(urlValue);
    const keep = new URLSearchParams();
    parsed.searchParams.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'variant') {
        keep.set(key, value);
        return;
      }
      if (lower.startsWith('utm_')) return;
      if (lower === 'gclid' || lower === 'fbclid') return;
      keep.set(key, value);
    });
    parsed.search = keep.toString() ? `?${keep.toString()}` : '';
    return parsed.toString();
  } catch {
    return urlValue;
  }
};

const cleanShopTitle = (value?: string, siteName?: string): string => {
  const title = collapseSpaces(normalizeText(value));
  if (!title) return '';
  const candidates = [siteName, 'Kate Quinn']
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
  let cleaned = title;
  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\s*[|\\-–]\\s*${escaped}\\s*$`, 'i'), '');
  }
  return collapseSpaces(cleaned);
};

const isShopifyHtml = (html: string): boolean => /window\.Shopify|cdn\.shopify\.com/i.test(html);
const isShopifyCdnImage = (urlValue?: string): boolean => Boolean(urlValue && /cdn\.shopify\.com/i.test(urlValue));
const imageWidthHint = (urlValue?: string): number => {
  const value = normalizeText(urlValue);
  if (!value) return 0;
  const queryWidth = value.match(/[?&]width=(\d{2,4})/i);
  if (queryWidth) return Number(queryWidth[1]) || 0;
  const pathWidth = value.match(/[_-](\d{2,4})x(?:\d{2,4})?(?=\.)/i);
  if (pathWidth) return Number(pathWidth[1]) || 0;
  return 0;
};
const isUsableProductImage = (urlValue?: string): boolean => {
  const value = normalizeText(urlValue);
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  if (value.startsWith('data:')) return false;
  if (/\.svg(\?|$)/i.test(value)) return false;
  return true;
};

const pickBestImage = (candidates: Array<{ url?: string; source: string; priority: number }>): { url?: string; source?: string } => {
  const scored = candidates
    .map((entry) => {
      const normalized = normalizeText(entry.url);
      if (!isUsableProductImage(normalized)) return null;
      const width = imageWidthHint(normalized);
      let score = entry.priority * 1000;
      if (width >= 600) score += 200;
      else if (width >= 400) score += 100;
      if (isShopifyCdnImage(normalized)) score += 20;
      return { url: normalized, source: entry.source, score };
    })
    .filter(Boolean) as Array<{ url: string; source: string; score: number }>;
  scored.sort((a, b) => b.score - a.score);
  return scored[0] ? { url: scored[0].url, source: scored[0].source } : {};
};

const isGenericSiteTitle = (title?: string, siteName?: string, host?: string): boolean => {
  const a = normalizeText(title).toLowerCase().replace(/[^\w]+/g, '');
  const b = normalizeText(siteName).toLowerCase().replace(/[^\w]+/g, '');
  const h = normalizeText(host).toLowerCase().replace(/^www\./, '').replace(/\.(com|net|org|shop|co)$/, '').replace(/[^\w]+/g, '');
  if (!a) return true;
  return a === b || a === h;
};

const readHtmlWithLimit = async (url: string): Promise<{ html: string; finalUrl: string }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      throw new Error('URL did not return HTML content');
    }

    if (!response.body) throw new Error('Upstream response body was empty');

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_HTML_BYTES) throw new Error('HTML size exceeds 1MB limit');
      chunks.push(value);
    }

    const all = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { html: new TextDecoder('utf-8').decode(all), finalUrl: response.url || url };
  } finally {
    clearTimeout(timeout);
  }
};

const parseJsonLd = ($: ReturnType<typeof load>) => {
  const entries: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      entries.push(JSON.parse(raw));
    } catch {
      // ignore malformed blocks
    }
  });
  return entries;
};

const domImageFallbackExtractor: Extractor = ({ $, finalUrl }) => {
  const parseSrcsetCandidate = (raw?: string) => {
    const value = normalizeText(raw);
    if (!value) return '';
    const first = value
      .split(',')
      .map((part) => normalizeText(part).split(/\s+/)[0])
      .filter(Boolean)
      .pop();
    return normalizeUrlValue(first, finalUrl);
  };
  const candidates: Array<{ src: string; score: number }> = [];
  $('img').each((_, el) => {
    const src =
      normalizeUrlValue($(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original'), finalUrl) ||
      parseSrcsetCandidate($(el).attr('srcset')) ||
      parseSrcsetCandidate($(el).attr('data-srcset'));
    if (!src || !/^https?:\/\//i.test(src)) return;
    const lower = src.toLowerCase();
    if (lower.startsWith('data:')) return;
    if (lower.endsWith('.svg')) return;
    if (/(sprite|icon|logo|avatar|placeholder)/i.test(lower)) return;

    const widthAttr = Number($(el).attr('width') || $(el).attr('data-width') || 0);
    const heightAttr = Number($(el).attr('height') || $(el).attr('data-height') || 0);
    const classes = ($(el).attr('class') || '').toLowerCase();
    const alt = ($(el).attr('alt') || '').toLowerCase();

    let score = 0;
    if (widthAttr >= 180) score += 2;
    if (heightAttr >= 180) score += 2;
    if (widthAttr >= 300) score += 1;
    if (heightAttr >= 300) score += 1;
    if (/(product|gallery|main|featured|media)/.test(classes)) score += 2;
    if (/(product|shop|layette|pant|dress|romper|set)/.test(alt)) score += 1;
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lower)) score += 1;
    if (score <= 0) return;
    candidates.push({ src, score });
  });

  const sorted = candidates.sort((a, b) => b.score - a.score);
  if (sorted.length === 0) return {};

  const unique = Array.from(new Set(sorted.map((entry) => entry.src))).slice(0, 6);
  return {
    image: unique[0],
    images: unique,
    metadata: {
      source: 'dom-img-fallback',
    },
  };
};

const shopifyJsonImageExtractor: Extractor = ({ $, finalUrl, html }) => {
  const candidates: string[] = [];

  // ProductJson-* script blocks are common on Shopify product pages.
  $('script[id^="ProductJson-"], script[type="application/json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw || raw.length < 20) return;
    try {
      const parsed = JSON.parse(raw) as any;
      const images = Array.isArray(parsed?.images) ? parsed.images : [];
      const featuredImage = parsed?.featured_image || parsed?.featuredImage;
      const media = Array.isArray(parsed?.media) ? parsed.media : [];
      if (typeof featuredImage === 'string') candidates.push(normalizeUrlValue(featuredImage, finalUrl));
      images.forEach((entry: unknown) => {
        if (typeof entry === 'string') candidates.push(normalizeUrlValue(entry, finalUrl));
        else if (entry && typeof (entry as any).src === 'string') candidates.push(normalizeUrlValue((entry as any).src, finalUrl));
      });
      media.forEach((entry: any) => {
        const src = entry?.src || entry?.preview_image?.src || entry?.preview_image?.url;
        if (typeof src === 'string') candidates.push(normalizeUrlValue(src, finalUrl));
      });
    } catch {
      // ignore non-JSON scripts
    }
  });

  // Last resort: pull Shopify product image URLs from page HTML blobs.
  const regex = /https?:\/\/[^"'\\s>]+cdn\.shopify\.com[^"'\\s>]+/gi;
  const regexMatches = html.match(regex) ?? [];
  regexMatches.forEach((match) => candidates.push(normalizeUrlValue(match, finalUrl)));

  const unique = Array.from(new Set(candidates.filter(Boolean)))
    .filter((url) => /\.(jpe?g|png|webp|avif)(\?|$)/i.test(url))
    .sort((a, b) => imageWidthHint(b) - imageWidthHint(a))
    .slice(0, 6);
  if (unique.length === 0) return {};
  return {
    image: unique[0],
    images: unique,
    metadata: {
      source: 'shopify-json-fallback',
    },
  };
};

const flattenJsonLdEntries = (entries: unknown[]): any[] => {
  const out: any[] = [];
  const visit = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    out.push(value);
    if (Array.isArray(value['@graph'])) {
      value['@graph'].forEach(visit);
    }
  };
  entries.forEach(visit);
  return out;
};

const ogExtractor: Extractor = ({ $, finalUrl }) => {
  const ogSiteName = normalizeText($('meta[property="og:site_name"]').attr('content'));
  const ogTitle = cleanShopTitle($('meta[property="og:title"]').attr('content'), ogSiteName);
  const ogImage =
    normalizeUrlValue($('meta[property="og:image"]').attr('content'), finalUrl) ||
    normalizeUrlValue($('meta[property="og:image:secure_url"]').attr('content'), finalUrl) ||
    normalizeUrlValue($('meta[property="og:image:url"]').attr('content'), finalUrl);
  const canonical = stripCommonTrackingParams(normalizeUrlValue($('link[rel="canonical"]').attr('href'), finalUrl) || finalUrl);
  const twitterTitle = normalizeText($('meta[name="twitter:title"]').attr('content'));
  const twitterImage = normalizeUrlValue($('meta[name="twitter:image"]').attr('content'), finalUrl);
  const titleTag = normalizeText($('title').first().text());
  const host = new URL(finalUrl).hostname.replace(/^www\./, '');

  return {
    title: ogTitle || twitterTitle || titleTag || host,
    image: ogImage || twitterImage || undefined,
    images: [ogImage, twitterImage].filter(Boolean) as string[],
    siteName: ogSiteName || host,
    canonicalUrl: canonical || stripCommonTrackingParams(finalUrl),
    brand: normalizeText($('meta[property="product:brand"]').attr('content')) || undefined,
    metadata: {
      source: 'og',
    },
  };
};

const jsonLdExtractor: Extractor = ({ $, finalUrl }) => {
  const jsonLd = parseJsonLd($);
  const flat = flattenJsonLdEntries(jsonLd);
  const product = flat.find((entry: any) => {
    const type = entry?.['@type'];
    if (!type) return false;
    if (Array.isArray(type)) return type.includes('Product');
    return type === 'Product';
  }) as any;

  if (!product) return { jsonLd };

  const productImages = Array.isArray(product.image)
    ? product.image
    : typeof product.image === 'string'
      ? [product.image]
      : [];

  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const offerUrl = normalizeUrlValue(typeof offer?.url === 'string' ? offer.url : undefined, finalUrl);
  const canonicalTag = normalizeUrlValue($('link[rel="canonical"]').attr('href'), finalUrl);
  return {
    title: normalizeText(product.name) || undefined,
    image: normalizeUrlValue(typeof productImages[0] === 'string' ? productImages[0] : undefined, finalUrl) || undefined,
    images: productImages
      .filter((entry: unknown) => typeof entry === 'string')
      .map((entry: unknown) => normalizeUrlValue(entry as string, finalUrl))
      .filter(Boolean),
    brand:
      typeof product.brand === 'string'
        ? normalizeText(product.brand)
        : normalizeText(product.brand?.name) || undefined,
    price: normalizeText(product.offers?.price?.toString()),
    currency: normalizeText(product.offers?.priceCurrency),
    availability: normalizeText(product.offers?.availability),
    canonicalUrl: stripCommonTrackingParams(offerUrl || canonicalTag || finalUrl),
    jsonLd,
    metadata: {
      source: 'json-ld',
    },
  };
};

const makeDomainExtractor = (hostname: string): Extractor | undefined => {
  if (hostname.endsWith('katequinn.com')) {
    return ({ $, finalUrl }) => {
      const host = new URL(finalUrl).hostname.replace(/^www\./, '');
      const ogTitle = cleanShopTitle($('meta[property="og:title"]').attr('content'), 'Kate Quinn');
      const siteName = normalizeText($('meta[property="og:site_name"]').attr('content')) || host;
      const twitterTitle = normalizeText($('meta[name="twitter:title"]').attr('content'));
      const titleTag = normalizeText($('title').first().text());
      const jsonLd = parseJsonLd($);
      const flat = flattenJsonLdEntries(jsonLd);
      const product = flat.find((entry: any) => {
        const type = entry?.['@type'];
        if (!type) return false;
        if (Array.isArray(type)) return type.includes('Product');
        return type === 'Product';
      }) as any;
      const jsonLdTitle = normalizeText(product?.name);
      const secureOgImage =
        normalizeUrlValue($('meta[property="og:image:secure_url"]').attr('content'), finalUrl) ||
        normalizeUrlValue($('meta[property="og:image:url"]').attr('content'), finalUrl);
      const twitterImage = normalizeUrlValue($('meta[name="twitter:image"]').attr('content'), finalUrl);
      const jsonLdImagesRaw = Array.isArray(product?.image) ? product.image : product?.image ? [product.image] : [];
      const jsonLdImages = jsonLdImagesRaw
        .filter((entry: unknown) => typeof entry === 'string')
        .map((entry: unknown) => normalizeUrlValue(entry as string, finalUrl))
        .filter(Boolean);

      const chosenTitle = isGenericSiteTitle(ogTitle, siteName, host)
        ? (cleanShopTitle(twitterTitle, siteName) || jsonLdTitle || cleanShopTitle(titleTag, siteName) || ogTitle || undefined)
        : ogTitle;
      const imageCandidates = [
        ...jsonLdImages.map((url: string) => ({ url, source: 'jsonld', priority: 4 })),
        { url: secureOgImage, source: 'og-secure', priority: 3 },
        { url: normalizeUrlValue($('meta[property="og:image"]').attr('content'), finalUrl), source: 'og', priority: 2 },
        { url: twitterImage, source: 'twitter', priority: 1 },
      ];
      const best = pickBestImage(imageCandidates);
      const images = Array.from(new Set(imageCandidates.map((entry) => normalizeUrlValue(entry.url, finalUrl)).filter(Boolean) as string[])).slice(0, 6);

      return {
        title: chosenTitle,
        image: best.url || images[0],
        images,
        siteName,
        canonicalUrl: stripCommonTrackingParams(normalizeUrlValue($('link[rel="canonical"]').attr('href'), finalUrl) || finalUrl),
        metadata: {
          source: 'domain-katequinn',
          imageSource: best.source || undefined,
        },
      };
    };
  }

  if (hostname.includes('amazon.')) {
    return ({ $ }) => {
      const title = normalizeText($('#productTitle').text());
      const price =
        normalizeText($('#corePrice_feature_div .a-offscreen').first().text()) ||
        normalizeText($('#priceblock_ourprice').text());
      return {
        title: title || undefined,
        price: price || undefined,
        metadata: {
          source: 'domain-amazon',
        },
      };
    };
  }

  return undefined;
};

const mergeResults = (base: UnfurlResult, patch: Partial<UnfurlResult>): UnfurlResult => {
  return {
    ...base,
    ...patch,
    image: patch.image || patch.images?.[0] || base.image || base.images[0],
    images: patch.images && patch.images.length > 0 ? patch.images : base.images,
    metadata: {
      ...base.metadata,
      ...(patch.metadata ?? {}),
    },
  };
};

const parseUnfurl = (html: string, finalUrl: string): UnfurlResult => {
  const $ = load(html);
  const host = new URL(finalUrl).hostname.replace(/^www\./, '');

  let result: UnfurlResult = {
    canonicalUrl: finalUrl,
    title: host,
    image: undefined,
    images: [],
    siteName: host,
    metadata: {},
  };
  const likelyShopify = isShopifyHtml(html);

  const domainExtractor = makeDomainExtractor(host);
  const extractors: Extractor[] = [ogExtractor, jsonLdExtractor];
  if (domainExtractor) extractors.push(domainExtractor);

  for (const extractor of extractors) {
    result = mergeResults(result, extractor({ html, finalUrl, $ }));
  }

  if (likelyShopify && (!result.image && result.images.length === 0)) {
    result = mergeResults(result, shopifyJsonImageExtractor({ html, finalUrl, $ }));
  }

  if (!result.image && result.images.length === 0) {
    result = mergeResults(result, domImageFallbackExtractor({ html, finalUrl, $ }));
  }

  if (!result.title) result.title = host;
  if (!result.siteName) result.siteName = host;
  if (!result.canonicalUrl) result.canonicalUrl = finalUrl;
  result.canonicalUrl = stripCommonTrackingParams(result.canonicalUrl);
  if (!result.image && result.images[0]) result.image = result.images[0];
  result.images = Array.from(new Set(result.images.map((img) => normalizeUrlValue(img, finalUrl)).filter(Boolean))).slice(0, 6);
  const globalBest = pickBestImage([
    ...(result.images ?? []).map((url) => ({ url, source: 'merged', priority: likelyShopify ? 2 : 1 })),
    { url: result.image, source: 'primary', priority: 3 },
  ]);
  result.image = normalizeUrlValue(globalBest.url || result.image, finalUrl) || result.images[0];
  result.title = collapseSpaces(cleanShopTitle(result.title, result.siteName) || result.title);
  result.metadata = {
    ...result.metadata,
    platform: likelyShopify ? 'shopify' : (result.metadata.platform as string | undefined),
  };

  return result;
};

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.json({ limit: '16kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.post('/unfurl', async (req, res) => {
  const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';

  if (!rawUrl) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  if (!isAllowedHttpUrl(rawUrl)) {
    res.status(400).json({ error: 'only http/https URLs are allowed' });
    return;
  }

  const cached = cache.get(rawUrl);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const { html, finalUrl } = await readHtmlWithLimit(rawUrl);
    const parsed = parseUnfurl(html, finalUrl);
    cache.set(rawUrl, parsed);
    res.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to unfurl URL';
    const status = message.toLowerCase().includes('timeout') || message.toLowerCase().includes('abort') ? 504 : 502;
    res.status(status).json({ error: message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`unfurl service listening on 0.0.0.0:${PORT}`);
});
