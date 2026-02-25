import { PrintAlias } from '@/models';

export const normalizePrintName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenSet = (value: string): Set<string> =>
  new Set(
    normalizePrintName(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );

export const jaccardTokenOverlap = (a: string, b: string): number => {
  const aSet = tokenSet(a);
  const bSet = tokenSet(b);
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) intersection += 1;
  });
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

export const resolvePrintName = (input: string, aliases: PrintAlias[]): string => {
  const normalized = normalizePrintName(input);
  if (!normalized) return '';
  const matched = aliases.find((entry) => normalizePrintName(entry.alias) === normalized);
  return matched ? normalizePrintName(matched.canonical) : normalized;
};

