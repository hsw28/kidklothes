import { appConfig } from '@/config';

export interface UrlPreview {
  title: string;
  imageUrl: string;
  brand: string;
}

interface UnfurlServiceResponse {
  title?: string;
  imageUrl?: string;
  siteName?: string;
  canonicalUrl?: string;
  error?: string;
}

const toTitleCase = (value: string): string => {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const hostnameFallback = (inputUrl: string) => {
  const parsed = new URL(inputUrl.trim());
  const hostname = parsed.hostname.replace(/^www\./, '');
  const root = hostname.split('.')[0] || hostname;
  const brand = toTitleCase(root);
  return {
    brand,
    title: brand || hostname,
  };
};

export const unfurlUrl = async (inputUrl: string): Promise<UrlPreview> => {
  const normalized = inputUrl.trim();
  if (!normalized) throw new Error('URL is required');
  const fallback = hostnameFallback(normalized);

  const base = appConfig.unfurlServiceBaseUrl.replace(/\/$/, '');

  try {
    const response = await fetch(`${base}/unfurl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: normalized }),
    });

    const payload = (await response.json()) as UnfurlServiceResponse;
    if (!response.ok) {
      throw new Error(payload.error || 'Unfurl service failed');
    }

    return {
      title: (payload.title || '').trim() || fallback.title,
      imageUrl: (payload.imageUrl || '').trim(),
      brand: (payload.siteName || '').trim() || fallback.brand,
    };
  } catch {
    // Return a useful fallback so manual edits can continue without blocking on network/service availability.
    return {
      title: fallback.title,
      imageUrl: '',
      brand: fallback.brand,
    };
  }
};
