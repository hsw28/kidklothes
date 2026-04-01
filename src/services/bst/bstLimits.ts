import { ID, SaleDraft } from '@/models';

export const FREE_BST_DRAFT_LIMIT = 1;
export const FREE_BST_ITEM_CARD_LIMIT = 2;

export const countActiveSaleDrafts = (drafts: SaleDraft[]): number =>
  drafts.filter((draft) => draft.status !== 'archived').length;

export const sanitizeFreeGeneratedCardItemIds = (draftItemIds: ID[], includedDraftItemIds: ID[]): ID[] => {
  const allowedIds = new Set(includedDraftItemIds);
  return Array.from(new Set(draftItemIds)).filter((id) => allowedIds.has(id)).slice(0, FREE_BST_ITEM_CARD_LIMIT);
};

export const getRemainingFreeBstCardSlots = (selectedDraftItemIds: ID[]): number =>
  Math.max(0, FREE_BST_ITEM_CARD_LIMIT - selectedDraftItemIds.length);
