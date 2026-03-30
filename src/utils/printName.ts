import { PrintAlias } from '@/models';

export const normalizePrintName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const PRINT_WORD_STOP_WORDS = new Set([
  'and',
  'for',
  'girl',
  'girls',
  'kids',
  'little',
  'mini',
  'pattern',
  'print',
  'prints',
  'the',
  'with',
]);

const singularizePrintWord = (token: string): string => {
  if (!/^[a-z]+$/.test(token)) return token;
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses') || token.endsWith('us')) return token;
  if (token.endsWith('es') && /(ches|shes|xes|zes|ses)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
};

export const extractPrintWords = (value: string): string[] =>
  normalizePrintName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !PRINT_WORD_STOP_WORDS.has(token) && !/^\d+$/.test(token))
    .map(singularizePrintWord)
    .filter(Boolean);

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
