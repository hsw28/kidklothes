import { SaleDraft } from '@/models';
import { buildSaleDraftName, describeResolvedHomeNotes, formatBstNoteLabel, formatMoney, isNewBstCondition, ResolvedSaleDraftItem, splitBstTitle, summarizeDraftBrands, summarizeDraftSizes } from '@/services/bst/draft';

const joinNotes = (values: Array<string | undefined>): string[] =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));

const describeHomeNotes = (draft: SaleDraft, resolvedItems: ResolvedSaleDraftItem[]): string | undefined => {
  const notes = joinNotes([describeResolvedHomeNotes(draft.defaultSmokeNote, draft.defaultPetTypes, draft.defaultPetNote)]);
  if (notes.length) return notes.join(', ');
  const itemDerived = resolvedItems
    .flatMap((entry) => joinNotes([entry.resolvedHomeNotes]))
    .slice(0, 2);
  return itemDerived.length ? Array.from(new Set(itemDerived)).join(', ') : undefined;
};

export const buildSaleDraftMainPostText = (draft: SaleDraft, resolvedItems: ResolvedSaleDraftItem[]): string => {
  const lines: string[] = [];
  lines.push(buildSaleDraftName(draft));

  const descriptors = joinNotes([
    summarizeDraftSizes(resolvedItems) ? `Sizes: ${summarizeDraftSizes(resolvedItems)}` : undefined,
    summarizeDraftBrands(resolvedItems) ? `Brands: ${summarizeDraftBrands(resolvedItems)}` : undefined,
    describeHomeNotes(draft, resolvedItems),
    draft.defaultDryingMethod,
    draft.defaultWashNote,
    draft.defaultBundleOffersAccepted ? 'Bundle offers welcome' : undefined,
    draft.defaultOffersAccepted ? 'Offers welcome' : undefined,
    draft.defaultShippingNote,
    draft.defaultPaymentNote,
  ]);

  if (descriptors.length) lines.push(descriptors.join('. ') + '.');
  lines.push('Details in comments. Made with Layette Out.');
  return lines.join('\n\n').trim();
};

export const buildSaleDraftItemCommentText = (entry: ResolvedSaleDraftItem): string => {
  const { draftItem, inventoryItem } = entry;
  const titleParts = splitBstTitle(inventoryItem.title);
  const titleLine = `#${draftItem.itemNumber} ${titleParts.primary}`;
  const detailLines = joinNotes([
    titleParts.secondary,
    [inventoryItem.brand, inventoryItem.size].filter(Boolean).join(' • ') || undefined,
    draftItem.condition ? `Condition: ${draftItem.condition}` : undefined,
    formatMoney(draftItem.price),
    isNewBstCondition(draftItem.condition) ? undefined : formatBstNoteLabel(entry.resolvedDryingMethod),
    entry.resolvedHomeNotes,
    formatBstNoteLabel(draftItem.conditionNotes),
    draftItem.flawTags.length ? `Flaws: ${draftItem.flawTags.join(', ')}` : undefined,
    formatBstNoteLabel(draftItem.flawNotes),
    isNewBstCondition(draftItem.condition) ? undefined : formatBstNoteLabel(entry.resolvedWashNote),
    entry.resolvedBundleOffersAccepted ? 'Bundle offers accepted' : undefined,
    entry.resolvedOffersAccepted ? 'Offers accepted' : undefined,
  ]);
  return [titleLine, ...detailLines].join('\n').trim();
};

export const buildSaleDraftAllItemCommentsText = (resolvedItems: ResolvedSaleDraftItem[]): string =>
  resolvedItems.map((entry) => buildSaleDraftItemCommentText(entry)).join('\n\n');

export const buildSaleDraftBstCaptionText = (draft: SaleDraft, resolvedItems: ResolvedSaleDraftItem[]): string => {
  const lines = ['BST 🌿'];
  const contextLine = [summarizeDraftBrands(resolvedItems), summarizeDraftSizes(resolvedItems)].filter(Boolean).join(' • ');
  const homeNotes = describeHomeNotes(draft, resolvedItems);

  if (contextLine) lines.push(contextLine);
  if (homeNotes) lines.push(homeNotes);

  lines.push('', 'Details in comments');
  return lines.join('\n').trim();
};
