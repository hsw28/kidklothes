import express from 'express';
import { load } from 'cheerio';
import { LRUCache } from 'lru-cache';
import { fetch } from 'undici';

const PORT = Number(process.env.PORT || 4000);
const REQUEST_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 1024 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT =
  'kidklothes-unfurl-service/1.0 (+https://kidklothes.local; contact: dev@kidklothes.local)';

interface UnfurlResponse {
  title: string;
  imageUrl: string;
  siteName: string;
  canonicalUrl: string;
}

const cache = new LRUCache<string, UnfurlResponse>({
  max: 500,
  ttl: CACHE_TTL_MS,
});

const isAllowedHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeText = (value?: string): string => (value ?? '').trim();

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

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      throw new Error('URL did not return HTML content');
    }

    if (!response.body) {
      throw new Error('Upstream response body was empty');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_HTML_BYTES) {
        throw new Error('HTML size exceeds 1MB limit');
      }

      chunks.push(value);
    }

    const all = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const html = new TextDecoder('utf-8').decode(all);
    return { html, finalUrl: response.url || url };
  } finally {
    clearTimeout(timeout);
  }
};

const parseUnfurl = (html: string, finalUrl: string): UnfurlResponse => {
  const $ = load(html);

  const ogTitle = normalizeText($('meta[property="og:title"]').attr('content'));
  const ogImage = normalizeText($('meta[property="og:image"]').attr('content'));
  const ogSiteName = normalizeText($('meta[property="og:site_name"]').attr('content'));
  const canonical = normalizeText($('link[rel="canonical"]').attr('href'));
  const titleTag = normalizeText($('title').first().text());

  const parsed = new URL(finalUrl);
  const host = parsed.hostname.replace(/^www\./, '');

  return {
    title: ogTitle || titleTag || host,
    imageUrl: ogImage || '',
    siteName: ogSiteName || host,
    canonicalUrl: canonical || finalUrl,
  };
};

const app = express();
app.use(express.json({ limit: '16kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
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

app.listen(PORT, () => {
  console.log(`unfurl service listening on :${PORT}`);
});
