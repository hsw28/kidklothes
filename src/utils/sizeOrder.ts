export type NormalizedSizeEntry = {
  normalized: string;
  label: string;
};

export type SizeEntryPresentation = {
  standard: NormalizedSizeEntry[];
  custom: NormalizedSizeEntry[];
};

const DASH_RE = /[\u2010-\u2015\u2212]/g;

const KNOWN_ORDER = [
  'P',
  'NB',
  '0-3',
  '3-6',
  '6-9',
  '9-12',
  '12-18',
  '18-24',
  '2T',
  '3T',
  '4T',
  '5T',
  '5',
  '6',
  '6X',
  '7',
  '8',
  '10',
  '12',
  '14',
] as const;

const KNOWN_RANK = new Map<string, number>(KNOWN_ORDER.map((value, index) => [value, index]));

const stableHash = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100000;
  }
  return hash;
};

export const normalizeSizeLabel = (size: string): string => {
  const raw = String(size || '')
    .replace(DASH_RE, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';

  let value = raw.toUpperCase();
  value = value.replace(/\s*-\s*/g, '-');
  value = value.replace(/\bMONTHS?\b/g, 'M');
  value = value.replace(/\s+/g, ' ').trim();
  value = value.replace(/(\d)\s*T\b/g, '$1T');
  value = value.replace(/\bNEWBORN\b/g, 'NB');
  value = value.replace(/\bPREMIE\b/g, 'P');

  const monthsRange = value.match(/^(\d{1,2})-(\d{1,2})M?$/);
  if (monthsRange) return `${monthsRange[1]}-${monthsRange[2]}`;
  const toddler = value.match(/^(\d)T$/);
  if (toddler) return `${toddler[1]}T`;
  const plainNum = value.match(/^(\d{1,2})$/);
  if (plainNum) return plainNum[1];
  const sixx = value.match(/^6X$/);
  if (sixx) return '6X';

  return value;
};

export const getSizeRank = (label: string): number => {
  const normalized = normalizeSizeLabel(label);
  if (!normalized) return Number.MAX_SAFE_INTEGER;
  const known = KNOWN_RANK.get(normalized);
  if (known !== undefined) return known;

  const monthRange = normalized.match(/^(\d{1,2})-(\d{1,2})$/);
  if (monthRange) {
    return 100 + Number(monthRange[1]);
  }

  const toddler = normalized.match(/^(\d{1,2})T$/);
  if (toddler) {
    return 200 + Number(toddler[1]);
  }

  const youth = normalized.match(/^(\d{1,2})$/);
  if (youth) {
    return 300 + Number(youth[1]);
  }

  if (normalized === '6X') return 306;

  return 1000000 + stableHash(normalized);
};

export const compareSizeLabels = (a: string, b: string): number => {
  const rankDiff = getSizeRank(a) - getSizeRank(b);
  if (rankDiff !== 0) return rankDiff;
  const normalizedDiff = normalizeSizeLabel(a).localeCompare(normalizeSizeLabel(b));
  if (normalizedDiff !== 0) return normalizedDiff;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
};

export const uniqueSortedSizeEntries = (labels: Array<string | null | undefined>): NormalizedSizeEntry[] => {
  const byNormalized = new Map<string, string>();
  for (const rawCandidate of labels) {
    const raw = String(rawCandidate || '').trim();
    if (!raw) continue;
    const normalized = normalizeSizeLabel(raw);
    if (!normalized) continue;
    const existing = byNormalized.get(normalized);
    if (!existing) {
      byNormalized.set(normalized, raw);
      continue;
    }
    const preferCurrent = existing === existing.toLowerCase() && raw !== raw.toLowerCase();
    if (preferCurrent || raw.length < existing.length) byNormalized.set(normalized, raw);
  }

  return Array.from(byNormalized.entries())
    .sort((a, b) => compareSizeLabels(a[0], b[0]))
    .map(([normalized, label]) => ({ normalized, label }));
};

const SIZE_NOTE_HINT_RE = /\b(marked|more|maybe|likely|brand|website|lists?|could|also|fit|fits)\b/i;

export const shouldRenderSizeAsStandardChip = (label: string): boolean => {
  const trimmed = String(label || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return false;

  const normalized = normalizeSizeLabel(trimmed);
  if (!normalized || normalized === 'NONE') return false;

  const compact = trimmed.replace(/\s*\/\s*/g, '/').replace(/\s*-\s*/g, '-').trim();
  const tokenCount = compact.split(/\s+/).filter(Boolean).length;
  const noteLike = /[,;:()]/.test(trimmed) || SIZE_NOTE_HINT_RE.test(trimmed);

  if (noteLike) return false;
  if (tokenCount > 2) return false;
  if (compact.length <= 12) return true;
  if (getSizeRank(normalized) < 1000000 && compact.length <= 14) return true;
  return false;
};

export const partitionSizeEntriesForDisplay = (entries: NormalizedSizeEntry[]): SizeEntryPresentation => (
  entries.reduce<SizeEntryPresentation>((groups, entry) => {
    if (shouldRenderSizeAsStandardChip(entry.label)) groups.standard.push(entry);
    else groups.custom.push(entry);
    return groups;
  }, { standard: [], custom: [] })
);

export const formatSizeFilterDisplayLabel = (label: string, options?: { sentenceCase?: boolean }): string => {
  const trimmed = String(label || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  if (!options?.sentenceCase) return trimmed;

  const hasLetters = /[A-Za-z]/.test(trimmed);
  const hasLowercase = /[a-z]/.test(trimmed);
  if (!hasLetters || hasLowercase) return trimmed;

  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

export type SizeChipMode = 'now' | 'next' | 'both';

export type SizeChipTransitionResult = {
  mode: SizeChipMode;
  selectedSizeChip: string;
};

export const getSizeChipTransitionOnTap = (args: {
  tapped: string;
  currentSize?: string | null;
  nextSize?: string | null;
}): SizeChipTransitionResult => {
  const tapped = normalizeSizeLabel(args.tapped);
  const current = normalizeSizeLabel(args.currentSize || '');
  const next = normalizeSizeLabel(args.nextSize || '');

  if (tapped && current && tapped === current) {
    return { mode: 'now', selectedSizeChip: tapped };
  }
  if (tapped && next && tapped === next) {
    return { mode: 'next', selectedSizeChip: tapped };
  }
  return { mode: 'both', selectedSizeChip: tapped };
};

export const __sizeOrderTestVectors = {
  orderingInput: ['3T', '18-24M', '2T'],
  orderingExpected: ['18-24M', '2T', '3T'],
  dedupeInput: ['2t', '2T', ' 2T '],
  dedupeExpectedNormalized: ['2T'],
  chipClassification: {
    standard: shouldRenderSizeAsStandardChip('XS / 0-6M'),
    custom: shouldRenderSizeAsStandardChip('MARKED AS A 3 BUT MORE A 3.5, MAYBE EVEN A 4'),
    none: shouldRenderSizeAsStandardChip('NONE'),
  },
  transitions: {
    toNow: getSizeChipTransitionOnTap({ tapped: '18-24M', currentSize: '18-24 months', nextSize: '2T' }),
    toNext: getSizeChipTransitionOnTap({ tapped: '2T', currentSize: '18-24M', nextSize: '2t' }),
    toAll: getSizeChipTransitionOnTap({ tapped: '3T', currentSize: '18-24M', nextSize: '2T' }),
  },
} as const;
