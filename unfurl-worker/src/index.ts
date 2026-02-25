import * as cheerio from 'cheerio';

type Env = Record<string, never>;

type UnfurlResponse = {
  url: string;
  title: string | null;
  images: string[];
  image: string | null;
  source: string;
};

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
    },
  });

const isHttpUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeText = (value?: string | null): string | null => {
  const next = (value || '').replace(/\s+/g, ' ').trim();
  return next || null;
};

const normalizeUrl = (value: string | null | undefined): string | null => {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (/^http:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, 'https://');
  return raw;
};

const absoluteUrl = (candidate: string | null | undefined, baseUrl: string): string | null => {
  const raw = (candidate || '').trim();
  if (!raw) return null;
  try {
    const resolved = raw.startsWith('//') ? new URL(`https:${raw}`) : new URL(raw, baseUrl);
    return normalizeUrl(resolved.toString());
  } catch {
    return null;
  }
};

const pushUnique = (list: string[], candidate: string | null) => {
  const normalized = normalizeUrl(candidate);
  if (!normalized) return;
  if (!/^https?:\/\//i.test(normalized)) return;
  if (!list.includes(normalized)) list.push(normalized);
};

const getMeta = ($: cheerio.CheerioAPI, attr: 'property' | 'name', key: string): string | null => {
  const node = $(`meta[${attr}="${key}"]`).first();
  return normalizeText(node.attr('content'));
};

const walkJsonLd = (node: unknown, products: any[]) => {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, products);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const typeValue = obj['@type'];
  const types = Array.isArray(typeValue) ? typeValue : [typeValue];
  if (types.some((t) => String(t).toLowerCase() === 'product')) {
    products.push(obj);
  }
  if (Array.isArray(obj['@graph'])) walkJsonLd(obj['@graph'], products);
};

const parseShopifyJsonLd = ($: cheerio.CheerioAPI, baseUrl: string) => {
  const products: Array<Record<string, unknown>> = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text();
    if (!text.trim()) return;
    try {
      const parsed = JSON.parse(text);
      walkJsonLd(parsed, products);
    } catch {
      // ignore invalid blocks
    }
  });

  const images: string[] = [];
  let title: string | null = null;

  for (const product of products) {
    if (!title) title = normalizeText(String(product.name ?? ''));
    const imageField = product.image as unknown;
    if (typeof imageField === 'string') pushUnique(images, absoluteUrl(imageField, baseUrl));
    if (Array.isArray(imageField)) {
      for (const img of imageField) {
        if (typeof img === 'string') pushUnique(images, absoluteUrl(img, baseUrl));
        else if (img && typeof img === 'object' && 'url' in (img as Record<string, unknown>)) {
          pushUnique(images, absoluteUrl(String((img as Record<string, unknown>).url ?? ''), baseUrl));
        }
      }
    }
  }

  return { title, images };
};

const parseNextDataImages = ($: cheerio.CheerioAPI, baseUrl: string): string[] => {
  const script = $('#__NEXT_DATA__').first();
  if (!script.length) return [];
  const raw = script.contents().text();
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const found: string[] = [];
    const seen = new Set<unknown>();
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if (seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (typeof value === 'string') {
          if (/(image|src|url)/i.test(key) && /shopify|cdn/i.test(value)) {
            pushUnique(found, absoluteUrl(value, baseUrl));
          }
        } else {
          visit(value);
        }
      }
    };
    visit(parsed);
    return found.slice(0, 8);
  } catch {
    return [];
  }
};

const extractUnfurl = (html: string, finalUrl: string): UnfurlResponse => {
  const $ = cheerio.load(html);
  const final = new URL(finalUrl);
  const source = final.hostname;

  const ogTitle = getMeta($, 'property', 'og:title');
  const twitterTitle = getMeta($, 'name', 'twitter:title');
  const titleTag = normalizeText($('title').first().text());

  const shopify = parseShopifyJsonLd($, finalUrl);

  const images: string[] = [];
  for (const candidate of shopify.images) pushUnique(images, candidate);
  pushUnique(images, absoluteUrl(getMeta($, 'property', 'og:image:secure_url'), finalUrl));
  pushUnique(images, absoluteUrl(getMeta($, 'property', 'og:image'), finalUrl));
  pushUnique(images, absoluteUrl(getMeta($, 'name', 'twitter:image'), finalUrl));
  for (const candidate of parseNextDataImages($, finalUrl)) pushUnique(images, candidate);

  const title = shopify.title || ogTitle || twitterTitle || titleTag || null;

  return {
    url: finalUrl,
    title,
    images,
    image: images[0] || null,
    source,
  };
};

const fetchHtmlWithTimeout = async (url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream responded ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(`Unsupported content-type: ${contentType || 'unknown'}`);
    }

    const html = await response.text();
    return { html, finalUrl: response.url || url };
  } finally {
    clearTimeout(timer);
  }
};

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    if (request.method === 'POST' && url.pathname === '/unfurl') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      const rawUrl = typeof (body as { url?: unknown })?.url === 'string' ? (body as { url: string }).url.trim() : '';
      if (!rawUrl || !isHttpUrl(rawUrl)) {
        return json({ error: 'Invalid or missing url (http/https required)', url: rawUrl || null }, 400);
      }

      try {
        const { html, finalUrl } = await fetchHtmlWithTimeout(rawUrl, 10_000);
        return json(extractUnfurl(html, finalUrl));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch or parse URL';
        return json({ error: message, url: rawUrl }, 502);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
