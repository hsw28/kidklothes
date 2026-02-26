export const APPAREL_AGE_SIZES = [
  'NB',
  '0-3M',
  '3-6M',
  '6-9M',
  '9-12M',
  '12-18M',
  '18-24M',
  '2T',
  '3T',
  '4T',
  '5T',
  '6',
  '7',
  '8',
  '10',
  '12',
  '14',
  '16',
] as const;

export const APPAREL_ALPHA_SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;

export const US_SHOE_SIZES = [
  '4C',
  '5C',
  '6C',
  '7C',
  '8C',
  '9C',
  '10C',
  '11C',
  '12C',
  '13C',
  '1Y',
  '2Y',
  '3Y',
  '4Y',
  '5Y',
  '6Y',
  '7Y',
] as const;

export type SizeUISectionKey = 'AGE' | 'ALPHA' | 'CUSTOM' | 'SHOE';

export type SizeUIModel = {
  sizeType: 'shoe' | 'apparel';
  sizeSystem: string | null;
  sections: Array<{ key: SizeUISectionKey; title: string; options?: string[] }>;
};

const SHOE_CATEGORY_MARKERS = ['shoe', 'shoes', 'boot', 'sneaker', 'sandal', 'slipper'] as const;

export const isShoeCategory = (categoryIdOrName: string): boolean => {
  const haystack = String(categoryIdOrName || '').trim().toLowerCase();
  if (!haystack) return false;
  return SHOE_CATEGORY_MARKERS.some((marker) => haystack.includes(marker));
};

export const getSizeUIModel = (params: {
  categoryIdOrName: string;
  shoeSystem?: string;
}): SizeUIModel => {
  const shoe = isShoeCategory(params.categoryIdOrName);
  if (shoe) {
    return {
      sizeType: 'shoe',
      sizeSystem: params.shoeSystem || 'US_SHOE',
      sections: [
        { key: 'SHOE', title: 'US shoe sizes', options: [...US_SHOE_SIZES] },
        { key: 'CUSTOM', title: 'Custom' },
      ],
    };
  }

  return {
    sizeType: 'apparel',
    sizeSystem: 'APPAREL',
    sections: [
      { key: 'AGE', title: 'Age sizes', options: [...APPAREL_AGE_SIZES] },
      { key: 'ALPHA', title: 'Alpha sizes', options: [...APPAREL_ALPHA_SIZES] },
      { key: 'CUSTOM', title: 'Custom' },
    ],
  };
};

