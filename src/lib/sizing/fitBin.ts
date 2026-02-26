import { FitBin } from '@/models';
import { normalizeSize } from './normalizeSize';

export type KidSizingLike = {
  apparelSizeCurrent?: string | null;
  apparelSizeNext?: string | null;
  shoeSizeCurrent?: string | null;
  shoeSizeNext?: string | null;
};

export const computeDefaultFitBin = (params: {
  sizeType: 'apparel' | 'shoe';
  sizeNormalized?: string | null;
  kid: KidSizingLike;
}): FitBin => {
  const size = normalizeSize(params.sizeNormalized || '');
  if (!size) return 'unsure';

  if (params.sizeType === 'shoe') {
    const current = normalizeSize(params.kid.shoeSizeCurrent || '');
    const next = normalizeSize(params.kid.shoeSizeNext || '');
    if (current && size === current) return 'current';
    if (next && size === next) return 'next';
    return 'unsure';
  }

  const current = normalizeSize(params.kid.apparelSizeCurrent || '');
  const next = normalizeSize(params.kid.apparelSizeNext || '');
  if (current && size === current) return 'current';
  if (next && size === next) return 'next';
  return 'unsure';
};

