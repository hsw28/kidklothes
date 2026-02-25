export type OutboundResolution = {
  sourceDomain: string;
  canonicalUrl: string;
  outboundUrl: string;
  monetized: boolean;
};

type RuleContext = {
  canonicalUrl: string;
  sourceDomain: string;
};

type DomainRule = {
  enabled: boolean;
  rewrite: (ctx: RuleContext) => string;
};

const parseUrl = (rawUrl: string): URL | undefined => {
  try {
    return new URL(rawUrl.trim());
  } catch {
    return undefined;
  }
};

const toDomainVariants = (hostname: string): string[] => {
  const normalized = hostname.replace(/^www\./, '').toLowerCase();
  const parts = normalized.split('.');
  if (parts.length <= 2) return [normalized];
  const root = parts.slice(-2).join('.');
  return Array.from(new Set([normalized, root]));
};

const domainRules: Record<string, DomainRule> = {
  // Keep disabled by default until affiliate terms/account IDs are finalized.
  'amazon.com': {
    enabled: false,
    rewrite: ({ canonicalUrl }) => {
      const url = new URL(canonicalUrl);
      url.searchParams.set('tag', 'layetteout-20');
      return url.toString();
    },
  },
};

export const resolveOutboundLink = (
  inputUrl: string,
  options?: {
    canonicalUrl?: string;
    monetize?: boolean;
  },
): OutboundResolution => {
  const original = options?.canonicalUrl?.trim() || inputUrl.trim();
  const parsed = parseUrl(original);
  if (!parsed) {
    return {
      sourceDomain: '',
      canonicalUrl: original,
      outboundUrl: original,
      monetized: false,
    };
  }

  const canonicalUrl = parsed.toString();
  const sourceDomain = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const monetize = options?.monetize === true;

  if (!monetize) {
    return {
      sourceDomain,
      canonicalUrl,
      outboundUrl: canonicalUrl,
      monetized: false,
    };
  }

  const variants = toDomainVariants(sourceDomain);
  for (const variant of variants) {
    const rule = domainRules[variant];
    if (!rule || !rule.enabled) continue;
    const outboundUrl = rule.rewrite({ canonicalUrl, sourceDomain });
    return { sourceDomain, canonicalUrl, outboundUrl, monetized: outboundUrl !== canonicalUrl };
  }

  return {
    sourceDomain,
    canonicalUrl,
    outboundUrl: canonicalUrl,
    monetized: false,
  };
};

export const buildOutboundUrl = (url: string): string => {
  return resolveOutboundLink(url).outboundUrl;
};
