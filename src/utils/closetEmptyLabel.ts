type SizeScope = 'Now' | 'Next' | 'All';

type BuildEmptyCategoryLabelInput = {
  categoryName: string;
  brandFilter?: string | string[] | null;
  sizeScope: SizeScope;
  selectedSizes?: string[];
  query?: string;
};

const toCleanLower = (value: string) => value.trim().toLowerCase();

const getSingleExplicitSize = (selectedSizes?: string[]): string | undefined => {
  const clean = (selectedSizes ?? []).map((entry) => entry.trim()).filter(Boolean);
  return clean.length === 1 ? clean[0] : undefined;
};

export const buildEmptyCategoryLabel = ({
  categoryName,
  sizeScope,
  selectedSizes,
}: BuildEmptyCategoryLabelInput): string => {
  const category = toCleanLower(categoryName);
  const singleSize = getSingleExplicitSize(selectedSizes);
  const sizeLabel = singleSize
    ? singleSize
    : sizeScope === 'Now'
      ? 'now'
      : sizeScope === 'Next'
        ? 'next'
        : 'all sizes';
  return `No ${category} items yet in ${sizeLabel}`;
};
