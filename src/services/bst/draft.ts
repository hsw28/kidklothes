import { Item, SaleDraft, SaleDraftItem } from '@/models';
import { getItemDisplayImageUri } from '@/utils/itemMedia';

export type SaleDraftWithItems = {
  draft: SaleDraft;
  items: SaleDraftItem[];
};

export type ResolvedSaleDraftItem = {
  draftItem: SaleDraftItem;
  inventoryItem: Item;
  resolvedPhotoUri?: string;
  resolvedSmokeNote?: SaleDraft['defaultSmokeNote'];
  resolvedPetTypes?: SaleDraft['defaultPetTypes'];
  resolvedPetNote?: string;
  resolvedWashNote?: string;
  resolvedDryingMethod?: SaleDraft['defaultDryingMethod'];
  resolvedOffersAccepted?: boolean;
  resolvedBundleOffersAccepted?: boolean;
  resolvedHomeNotes?: string;
};

export const getDraftIncludedItems = (draftItems: SaleDraftItem[]): SaleDraftItem[] =>
  [...draftItems]
    .filter((item) => item.included)
    .sort((a, b) => a.listingOrder - b.listingOrder || a.createdAt - b.createdAt);

export const buildSaleDraftName = (draft: SaleDraft): string => {
  if (draft.title?.trim()) return draft.title.trim();
  const created = new Date(draft.createdAt);
  return `BST Draft ${created.toLocaleDateString()}`;
};

const joinDefined = (...values: Array<string | undefined>): string | undefined => {
  const parts = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(', ') : undefined;
};

const titlePartSeparators = /\s+[|/-]\s+|\s+\|\s+|\s+•\s+|,\s+/;

const toTitleCase = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const sentencePreservingSeparators = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed
    .split('•')
    .map((part) => toTitleCase(part.trim()) || '')
    .filter(Boolean)
    .join(' • ');
};

export const resolveSmokeNote = (draft: SaleDraft, draftItem: SaleDraftItem): SaleDraft['defaultSmokeNote'] | undefined =>
  draftItem.smokeNoteOverride ?? draft.defaultSmokeNote;

export const resolvePetTypes = (draft: SaleDraft, draftItem: SaleDraftItem): SaleDraft['defaultPetTypes'] | undefined =>
  draftItem.petTypesOverride ?? draft.defaultPetTypes;

export const resolvePetNote = (draft: SaleDraft, draftItem: SaleDraftItem): string | undefined => {
  const resolvedPetTypes = resolvePetTypes(draft, draftItem);
  if (draftItem.petNoteOverride !== undefined) return draftItem.petNoteOverride?.trim() || undefined;
  if (resolvedPetTypes?.includes('other')) return draft.defaultPetNote?.trim() || undefined;
  return draft.defaultPetNote?.trim() || undefined;
};

export const resolveWashNote = (draft: SaleDraft, draftItem: SaleDraftItem): string | undefined =>
  draftItem.washNotesOverride?.trim() || draft.defaultWashNote?.trim() || undefined;

export const resolveDryingMethod = (draft: SaleDraft, draftItem: SaleDraftItem): SaleDraft['defaultDryingMethod'] | undefined =>
  draftItem.dryingMethodOverride ?? draft.defaultDryingMethod;

export const resolveOffersAccepted = (draft: SaleDraft, draftItem: SaleDraftItem): boolean | undefined =>
  draftItem.offersAcceptedOverride ?? draft.defaultOffersAccepted;

export const resolveBundleOffersAccepted = (draft: SaleDraft, draftItem: SaleDraftItem): boolean | undefined =>
  draftItem.bundleOffersAcceptedOverride ?? draft.defaultBundleOffersAccepted;

export const describeResolvedHomeNotes = (
  smokeNote?: SaleDraft['defaultSmokeNote'],
  petTypes?: SaleDraft['defaultPetTypes'],
  petNote?: string,
): string | undefined => {
  const normalizedPetTypes = petTypes?.filter(Boolean) ?? [];
  const petLabels = normalizedPetTypes.includes('none')
    ? ['no-pet home']
    : normalizedPetTypes
        .map((petType) => (petType === 'other' ? (petNote || 'pet-friendly home') : `${petType}-friendly home`))
        .filter(Boolean);
  const petLabel = petLabels.length ? petLabels.join(' • ') : undefined;
  const parts = [toTitleCase(smokeNote), toTitleCase(petLabel)].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(' • ') : undefined;
};

export const resolveSaleDraftItem = (draft: SaleDraft, draftItem: SaleDraftItem, inventoryItem: Item): ResolvedSaleDraftItem => {
  const resolvedSmoke = resolveSmokeNote(draft, draftItem);
  const resolvedPetTypes = resolvePetTypes(draft, draftItem);
  const resolvedPetNote = resolvePetNote(draft, draftItem);
  const selectedPhotoUri = draftItem.selectedPhotoUri?.trim();
  const availablePhotoUris = new Set(
    [inventoryItem.cachedImageUri, inventoryItem.imageUrl, ...(inventoryItem.imageUrls ?? [])]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  return {
    draftItem,
    inventoryItem,
    resolvedPhotoUri: selectedPhotoUri && availablePhotoUris.has(selectedPhotoUri) ? selectedPhotoUri : getItemDisplayImageUri(inventoryItem),
    resolvedSmokeNote: resolvedSmoke,
    resolvedPetTypes,
    resolvedPetNote,
    resolvedWashNote: resolveWashNote(draft, draftItem),
    resolvedDryingMethod: resolveDryingMethod(draft, draftItem),
    resolvedOffersAccepted: resolveOffersAccepted(draft, draftItem),
    resolvedBundleOffersAccepted: resolveBundleOffersAccepted(draft, draftItem),
    resolvedHomeNotes: describeResolvedHomeNotes(resolvedSmoke, resolvedPetTypes, resolvedPetNote),
  };
};

export const resolveSaleDraftItems = (draft: SaleDraft, draftItems: SaleDraftItem[], inventoryItems: Item[]): ResolvedSaleDraftItem[] => {
  const itemMap = new Map(inventoryItems.map((item) => [item.id, item]));
  return getDraftIncludedItems(draftItems)
    .map((draftItem) => {
      const inventoryItem = itemMap.get(draftItem.itemId);
      if (!inventoryItem) return undefined;
      return resolveSaleDraftItem(draft, draftItem, inventoryItem);
    })
    .filter((entry): entry is ResolvedSaleDraftItem => Boolean(entry));
};

export const summarizeDraftSizes = (resolvedItems: ResolvedSaleDraftItem[]): string | undefined => {
  const sizes = Array.from(new Set(resolvedItems.map((entry) => entry.inventoryItem.size?.trim()).filter(Boolean)));
  if (!sizes.length) return undefined;
  if (sizes.length <= 3) return sizes.join(', ');
  return `${sizes.slice(0, 3).join(', ')} + more`;
};

export const summarizeDraftBrands = (resolvedItems: ResolvedSaleDraftItem[]): string | undefined => {
  const brands = Array.from(new Set(resolvedItems.map((entry) => entry.inventoryItem.brand?.trim()).filter(Boolean)));
  if (!brands.length) return undefined;
  if (brands.length <= 3) return brands.join(', ');
  return `${brands.slice(0, 3).join(', ')} + more`;
};

export const formatMoney = (value?: number): string | undefined => {
  if (value === undefined || value === null || !Number.isFinite(value)) return undefined;
  return `$${value.toFixed(2)}`;
};

export const isNewBstCondition = (condition?: SaleDraftItem['condition']): boolean =>
  condition === 'NWT' || condition === 'NWOT';

export const formatBstNoteLabel = (value?: string): string | undefined => sentencePreservingSeparators(value);

export const splitBstTitle = (title?: string): { primary: string; secondary?: string } => {
  const cleaned = (title ?? '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return { primary: 'Untitled item' };
  const parts = cleaned.split(titlePartSeparators).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return { primary: cleaned };
  return {
    primary: parts[0],
    secondary: parts.slice(1).join(' • '),
  };
};
