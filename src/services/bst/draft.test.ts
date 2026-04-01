import { SaleDraft, SaleDraftItem } from '@/models';
import { describeResolvedHomeNotes, resolveBundleOffersAccepted, resolveOffersAccepted, resolvePetNote, resolvePetTypes, resolveSmokeNote, resolveWashNote } from './draft';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const baseDraft: SaleDraft = {
  id: 'draft-1',
  status: 'draft',
  title: 'Test Draft',
  defaultSmokeNote: 'smoke-free home',
  defaultPetTypes: ['dog', 'cat'],
  defaultPetNote: 'friendly lab',
  defaultWashNote: 'washed on delicate',
  defaultDryingMethod: 'line dried',
  defaultOffersAccepted: true,
  defaultBundleOffersAccepted: false,
  collageGridSize: 'Auto',
  freeGeneratedCardItemIds: [],
  createdAt: 1,
  updatedAt: 1,
};

const baseDraftItem: SaleDraftItem = {
  id: 'draft-item-1',
  saleDraftId: 'draft-1',
  itemId: 'item-1',
  listingOrder: 0,
  included: true,
  itemNumber: 1,
  flawTags: [],
  createdAt: 1,
  updatedAt: 1,
};

export const runBstDraftLightweightTests = () => {
  assert(resolveSmokeNote(baseDraft, baseDraftItem) === 'smoke-free home', 'inherits smoke note from draft');
  assert(JSON.stringify(resolvePetTypes(baseDraft, baseDraftItem)) === JSON.stringify(['dog', 'cat']), 'inherits pet types from draft');
  assert(resolvePetNote(baseDraft, baseDraftItem) === 'friendly lab', 'inherits pet note from draft');
  assert(resolveWashNote(baseDraft, baseDraftItem) === 'washed on delicate', 'inherits wash note from draft');
  assert(resolveOffersAccepted(baseDraft, baseDraftItem) === true, 'inherits offers accepted');
  assert(resolveBundleOffersAccepted(baseDraft, baseDraftItem) === false, 'inherits bundle offers accepted');

  const overrideItem: SaleDraftItem = {
    ...baseDraftItem,
    smokeNoteOverride: 'smoking home',
    petTypesOverride: ['other'],
    petNoteOverride: 'rabbit home',
    washNotesOverride: 'hand washed',
    offersAcceptedOverride: false,
    bundleOffersAcceptedOverride: true,
  };

  assert(resolveSmokeNote(baseDraft, overrideItem) === 'smoking home', 'override smoke note wins');
  assert(JSON.stringify(resolvePetTypes(baseDraft, overrideItem)) === JSON.stringify(['other']), 'override pet types win');
  assert(resolvePetNote(baseDraft, overrideItem) === 'rabbit home', 'override pet note wins');
  assert(resolveWashNote(baseDraft, overrideItem) === 'hand washed', 'override wash note wins');
  assert(resolveOffersAccepted(baseDraft, overrideItem) === false, 'override offers accepted wins');
  assert(resolveBundleOffersAccepted(baseDraft, overrideItem) === true, 'override bundle offers accepted wins');

  assert(
    describeResolvedHomeNotes(resolveSmokeNote(baseDraft, overrideItem), resolvePetTypes(baseDraft, overrideItem), resolvePetNote(baseDraft, overrideItem))
      === 'Smoking home • Rabbit home',
    'resolved home note text should combine smoke and other-pet note',
  );
};
