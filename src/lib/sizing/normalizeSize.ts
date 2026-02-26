import { APPAREL_AGE_SIZES, APPAREL_ALPHA_SIZES, US_SHOE_SIZES } from './sizeOptions';

const ALIAS_MAP: Record<string, string> = {
  NEWBORN: 'NB',
  SMALL: 'S',
  MEDIUM: 'M',
  LARGE: 'L',
  XSMALL: 'XS',
  XSM: 'XS',
  XLARGE: 'XL',
};

const normalizeDashes = (value: string) => value.replace(/[–—−]/g, '-');

export const normalizeSize = (input: string): string => {
  const raw = normalizeDashes(String(input || '').trim()).toUpperCase().replace(/\s+/g, ' ');
  if (!raw) return '';

  const compactAlpha = raw.replace(/[\s-]/g, '');
  if (ALIAS_MAP[compactAlpha]) return ALIAS_MAP[compactAlpha];
  if (/^X{0,2}S$/.test(compactAlpha) && compactAlpha === 'XS') return 'XS';
  if (/^X{0,2}L$/.test(compactAlpha) && compactAlpha === 'XL') return 'XL';

  const monthRange = raw.match(/^(\d+)\s*-\s*(\d+)\s*M(?:ONTHS?)?$/);
  if (monthRange) return `${monthRange[1]}-${monthRange[2]}M`;

  const toddler = raw.match(/^(\d+)\s*T$/);
  if (toddler) return `${toddler[1]}T`;

  const shoe = raw.match(/^(\d+(?:\.\d+)?)\s*([CY])$/);
  if (shoe) return `${shoe[1]}${shoe[2]}`;

  if (ALIAS_MAP[raw]) return ALIAS_MAP[raw];
  return raw;
};

export type InferredSizeScheme = 'AGE' | 'ALPHA' | 'CUSTOM' | 'SHOE';

const APPAREL_AGE_SET = new Set<string>(APPAREL_AGE_SIZES);
const APPAREL_ALPHA_SET = new Set<string>(APPAREL_ALPHA_SIZES);
const US_SHOE_SET = new Set<string>(US_SHOE_SIZES);

export const inferSizeScheme = (input: string): InferredSizeScheme => {
  const normalized = normalizeSize(input);
  if (!normalized) return 'CUSTOM';
  if (APPAREL_AGE_SET.has(normalized as (typeof APPAREL_AGE_SIZES)[number])) return 'AGE';
  if (APPAREL_ALPHA_SET.has(normalized as (typeof APPAREL_ALPHA_SIZES)[number])) return 'ALPHA';
  if (US_SHOE_SET.has(normalized as (typeof US_SHOE_SIZES)[number])) return 'SHOE';
  if (/^\d+(?:\.\d+)?[CY]$/.test(normalized) || /^\d+Y$/.test(normalized)) return 'SHOE';
  return 'CUSTOM';
};

