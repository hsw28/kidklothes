import { Child, SizeCode } from '@/models';

export const SIZE_OPTIONS: Array<{ code: SizeCode; label: string }> = [
  { code: 'P', label: 'Premie (P)' },
  { code: 'NB', label: 'Newborn (NB)' },
  { code: '0-3M', label: '0-3 months (0-3M)' },
  { code: '3-6M', label: '3-6 months (3-6M)' },
  { code: '6-9M', label: '6-9 months (6-9M)' },
  { code: '9-12M', label: '9-12 months (9-12M)' },
  { code: '12-18M', label: '12-18 months (12-18M)' },
  { code: '18-24M', label: '18-24 months (18-24M)' },
  { code: '2T', label: '2T' },
  { code: '3T', label: '3T' },
  { code: '4T', label: '4T' },
  { code: '5T', label: '5T' },
  { code: '4-5', label: '4-5 (XS)' },
  { code: '6-7', label: '6-7 (S)' },
  { code: '8', label: '8 (M)' },
  { code: '10-12', label: '10-12 (L)' },
  { code: '14-16', label: '14-16 (XL)' },
  { code: 'OTHER', label: 'Other' },
];

const sizeOptionByCode = new Map<SizeCode, { code: SizeCode; label: string }>(SIZE_OPTIONS.map((entry) => [entry.code, entry]));

export const inferNextSize = (code: SizeCode): SizeCode | null => {
  switch (code) {
    case 'P':
      return 'NB';
    case 'NB':
      return '0-3M';
    case '0-3M':
      return '3-6M';
    case '3-6M':
      return '6-9M';
    case '6-9M':
      return '9-12M';
    case '9-12M':
      return '12-18M';
    case '12-18M':
      return '18-24M';
    case '18-24M':
      return '2T';
    case '2T':
      return '3T';
    case '3T':
      return '4T';
    case '4T':
      return '5T';
    case '5T':
      return '4-5';
    case '4-5':
      return '6-7';
    case '6-7':
      return '8';
    case '8':
      return '10-12';
    case '10-12':
      return '14-16';
    case '14-16':
    case 'OTHER':
    default:
      return null;
  }
};

export const formatSizeDisplay = (code?: SizeCode | null, otherText?: string | null): string => {
  if (!code) return '';
  if (code === 'OTHER') return otherText?.trim() || 'Other';
  return sizeOptionByCode.get(code)?.label ?? code;
};

export const sizeCodeToStoredText = (code?: SizeCode | null, otherText?: string | null): string | undefined => {
  if (!code) return undefined;
  if (code === 'OTHER') return otherText?.trim() || undefined;
  return code;
};

export const getChildCurrentSizeTexts = (child?: Child): string[] => {
  if (!child) return [];
  const fromArray = (child.currentSizeCodes ?? [])
    .map((value) => (value || '').trim())
    .filter(Boolean);
  if (fromArray.length > 0) return Array.from(new Set(fromArray));
  const fallback = sizeCodeToStoredText(child.currentSize?.code ?? null, child.currentSize?.otherText ?? null);
  return fallback ? [fallback] : [];
};

export const getChildCurrentSizeText = (child?: Child): string | undefined =>
  getChildCurrentSizeTexts(child)[0];

export const getChildNextSizeText = (child?: Child): string | undefined => {
  if (!child) return undefined;
  if (child.nextSize?.code) {
    return sizeCodeToStoredText(child.nextSize.code, child.nextSize.otherText ?? null);
  }
  const inferred = child.currentSize?.code ? inferNextSize(child.currentSize.code) : null;
  if (!inferred) return undefined;
  return sizeCodeToStoredText(inferred, null);
};

export const sizeOptionLabels = SIZE_OPTIONS.map((entry) => entry.label);

export const sizeCodeFromLabel = (label: string): SizeCode | null => {
  const found = SIZE_OPTIONS.find((entry) => entry.label === label);
  return found?.code ?? null;
};
