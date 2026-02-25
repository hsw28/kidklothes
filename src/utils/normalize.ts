export const normalizeWhitespace = (s: string): string => s.replace(/\s+/g, ' ').trim();

export const trimOrNull = (s?: string | null): string | null => {
  if (s == null) return null;
  const trimmed = normalizeWhitespace(String(s));
  return trimmed ? trimmed : null;
};

export const normalizeToken = (s: string): string => {
  const cleaned = String(s)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
};

export const normalizePrintKey = (printName?: string | null): string =>
  normalizeToken(printName ?? '').replace(/\s+/g, '');

export const normalizeUrl = (s?: string | null): string => {
  if (!s) return '';
  return String(s).trim();
};

export const normalizeBrandPrettyFromDomain = (domain: string): string => {
  const root = domain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .split('.')[0]
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  if (!root) return '';
  return root
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

export const normalizeStringArray = (values?: string[] | null): string[] =>
  Array.from(
    new Set(
      (values ?? [])
        .map((entry) => normalizeWhitespace(String(entry)))
        .filter(Boolean),
    ),
  );

