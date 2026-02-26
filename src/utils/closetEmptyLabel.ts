type SizeScope = 'Now' | 'Next' | 'All';

type BuildEmptyCategoryLabelInput = {
  categoryName: string;
  brandFilter?: string | string[] | null;
  sizeScope: SizeScope;
  selectedSizes?: string[];
  query?: string;
};

const MAX_LABEL_LEN = 40;

const toCleanLower = (value: string) => value.trim().toLowerCase();

const getSingleBrand = (brandFilter?: string | string[] | null): string | undefined => {
  if (!brandFilter) return undefined;
  if (Array.isArray(brandFilter)) {
    const clean = brandFilter.map((entry) => entry.trim()).filter(Boolean);
    if (clean.length !== 1) return undefined;
    if (clean[0].toLowerCase() === 'all') return undefined;
    return clean[0];
  }
  const clean = brandFilter.trim();
  if (!clean || clean.toLowerCase() === 'all') return undefined;
  return clean;
};

const getSingleExplicitSize = (selectedSizes?: string[]): string | undefined => {
  const clean = (selectedSizes ?? []).map((entry) => entry.trim()).filter(Boolean);
  return clean.length === 1 ? clean[0] : undefined;
};

const withOptionalClauses = (
  base: string,
  options: { sizeClause?: string; queryClause?: string },
): string => {
  const withAll = `${base}${options.sizeClause ?? ''}${options.queryClause ?? ''}`;
  if (withAll.length <= MAX_LABEL_LEN) return withAll;

  const withoutQuery = `${base}${options.sizeClause ?? ''}`;
  if (withoutQuery.length <= MAX_LABEL_LEN) return withoutQuery;

  return base;
};

export const buildEmptyCategoryLabel = ({
  categoryName,
  brandFilter,
  sizeScope,
  selectedSizes,
  query,
}: BuildEmptyCategoryLabelInput): string => {
  const category = toCleanLower(categoryName);
  const brand = getSingleBrand(brandFilter);
  const singleSize = getSingleExplicitSize(selectedSizes);
  const queryText = (query ?? '').trim();

  const base = brand ? `No ${toCleanLower(brand)} ${category} yet` : `No ${category} yet`;

  const sizeClause = singleSize
    ? ` in ${singleSize}`
    : sizeScope === 'Now'
      ? ' for now'
      : sizeScope === 'Next'
        ? ' for next'
        : '';

  const queryClause = queryText ? ` matching “${queryText}”` : '';
  return withOptionalClauses(base, { sizeClause, queryClause });
};

