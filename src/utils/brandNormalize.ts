export type CanonicalBrandMatch = {
  brandName: string;
  brandId?: string;
};

const BRAND_ALIAS_ENTRIES: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: 'Kate Quinn',
    aliases: ['katequinn', 'kate quinn', 'katequinn.com', 'kate-quinn', 'kq'],
  },
  {
    canonical: 'Little Sleepies',
    aliases: ['littlesleepies', 'little sleepies', 'littlesleepies.com', 'ls'],
  },
  {
    canonical: 'Kyte Baby',
    aliases: ['kyte', 'kyte baby', 'kytebaby', 'kytebaby.com'],
  },
  {
    canonical: 'Posh Peanut',
    aliases: ['poshpeanut', 'posh peanut', 'poshpeanut.com'],
  },
  {
    canonical: 'Bums & Roses',
    aliases: ['bumsandroses', 'bums and roses', 'bums&roses', 'bumsandroses.com', 'bums roses'],
  },
  {
    canonical: 'Hanna Andersson',
    aliases: ['hanna andersson', 'hannaandersson', 'hannaandersson.com', 'ha'],
  },
  {
    canonical: 'Burt’s Bees Baby',
    aliases: ['burts bees baby', 'burtsbeesbaby', 'burtsbeesbaby.com', "burt's bees baby"],
  },
  {
    canonical: 'Carter’s',
    aliases: ['carters', 'carter s', 'carters.com', "carter's"],
  },
  {
    canonical: 'Primary',
    aliases: ['primary', 'primary.com', 'primary clothing'],
  },
];

const stripProtocolAndWww = (value: string) => value.replace(/^https?:\/\//i, '').replace(/^www\./i, '');

const cleanPunctuation = (value: string) =>
  value
    .replace(/&/g, ' and ')
    .replace(/[._/\\-]+/g, ' ')
    .replace(/['’"]/g, '')
    .replace(/[(),:;!?[\]{}|+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const maybeDomainRoot = (value: string) => {
  const raw = stripProtocolAndWww(value.trim().toLowerCase());
  if (!raw) return '';
  const hostLike = raw.split(/[/?#]/)[0] ?? raw;
  if (hostLike.includes('.')) {
    const parts = hostLike.split('.').filter(Boolean);
    if (parts.length >= 2) return parts[0];
  }
  return hostLike;
};

export const normalizeToken = (input: string): string => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  const root = maybeDomainRoot(trimmed);
  const cleaned = cleanPunctuation(root || trimmed).toLowerCase();
  return cleaned.replace(/\s+/g, '');
};

const aliasMap = new Map<string, CanonicalBrandMatch>();
for (const entry of BRAND_ALIAS_ENTRIES) {
  const all = [entry.canonical, ...entry.aliases];
  for (const alias of all) {
    const normalized = normalizeToken(alias);
    if (!normalized) continue;
    aliasMap.set(normalized, { brandName: entry.canonical });
  }
}

const prettyFromDomain = (value: string) => {
  const root = maybeDomainRoot(value);
  if (!root) return '';
  const withSpaces = root
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\d+)([a-zA-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d+)/g, '$1 $2');
  return withSpaces
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const prettyBrandFallback = (inputBrand: string | null, url: string | null, siteName: string | null): string => {
  const preferred = (inputBrand || siteName || '').trim();
  if (preferred) {
    const cleaned = cleanPunctuation(stripProtocolAndWww(preferred));
    if (cleaned) {
      return cleaned
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
  }
  if (url) return prettyFromDomain(url);
  return '';
};

export const canonicalizeBrand = async (
  inputBrand: string | null,
  url: string | null,
  siteName: string | null,
): Promise<CanonicalBrandMatch | null> => {
  const candidates = [
    inputBrand ?? '',
    siteName ?? '',
    url ?? '',
    url ? maybeDomainRoot(url) : '',
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const token = normalizeToken(candidate);
    if (!token) continue;
    const match = aliasMap.get(token);
    if (match) return match;
  }

  return null;
};

