export const isoNow = (): string => new Date().toISOString();

export const formatShortDate = (iso?: string): string => {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString();
};
