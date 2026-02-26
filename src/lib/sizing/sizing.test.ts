import { computeDefaultFitBin } from './fitBin';
import { inferSizeScheme, normalizeSize } from './normalizeSize';
import { APPAREL_AGE_SIZES, APPAREL_ALPHA_SIZES, US_SHOE_SIZES, getSizeUIModel, isShoeCategory } from './sizeOptions';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

export const runSizingLightweightTests = () => {
  assert(normalizeSize('newborn') === 'NB', 'normalizes newborn -> NB');
  assert(normalizeSize('18 – 24 months') === '18-24M', 'normalizes month range with unicode dash');
  assert(normalizeSize(' medium ') === 'M', 'normalizes alpha words');
  assert(normalizeSize('10 c') === '10C', 'normalizes shoe sizes');

  assert(inferSizeScheme('2T') === 'AGE', 'infers apparel age');
  assert(inferSizeScheme('large') === 'ALPHA', 'infers alpha');
  assert(inferSizeScheme('4C') === 'SHOE', 'infers shoe');
  assert(inferSizeScheme('EU 28') === 'CUSTOM', 'infers custom');

  assert(isShoeCategory('Shoes') === true, 'shoe category predicate matches shoes');
  assert(isShoeCategory('winter boots') === true, 'shoe category predicate matches boots');
  assert(isShoeCategory('tops') === false, 'shoe category predicate ignores apparel');

  const apparelModel = getSizeUIModel({ categoryIdOrName: 'tops' });
  assert(apparelModel.sizeType === 'apparel', 'apparel model type');
  assert(apparelModel.sections[0]?.key === 'AGE' && apparelModel.sections[1]?.key === 'ALPHA', 'apparel sections include age/alpha');
  assert(apparelModel.sections[0]?.options?.[0] === APPAREL_AGE_SIZES[0], 'apparel options use source list');
  assert(Boolean(apparelModel.sections[1]?.options?.includes(APPAREL_ALPHA_SIZES[2])), 'alpha options use source list');

  const shoeModel = getSizeUIModel({ categoryIdOrName: 'sandals', shoeSystem: 'US_SHOE' });
  assert(shoeModel.sizeType === 'shoe', 'shoe model type');
  assert(shoeModel.sizeSystem === 'US_SHOE', 'shoe model system');
  assert(shoeModel.sections[0]?.key === 'SHOE', 'shoe section key');
  assert(Boolean(shoeModel.sections[0]?.options?.includes(US_SHOE_SIZES[0])), 'shoe options use source list');

  assert(
    computeDefaultFitBin({
      sizeType: 'apparel',
      sizeNormalized: '2t',
      kid: { apparelSizeCurrent: '2T', apparelSizeNext: '3T' },
    }) === 'current',
    'fit bin apparel current match',
  );
  assert(
    computeDefaultFitBin({
      sizeType: 'shoe',
      sizeNormalized: '5c',
      kid: { shoeSizeCurrent: '4C', shoeSizeNext: '5C' },
    }) === 'next',
    'fit bin shoe next match',
  );
  assert(
    computeDefaultFitBin({
      sizeType: 'apparel',
      sizeNormalized: 'M',
      kid: { apparelSizeCurrent: '2T', apparelSizeNext: '3T' },
    }) === 'unsure',
    'fit bin unknown defaults to unsure',
  );
};
