import {
  ActivityEvent,
  AppSettings,
  BstCollageOrderMode,
  BackupPayload,
  BstCollageGridSize,
  Child,
  ChildItem,
  FilterPreset,
  ID,
  Item,
  Outfit,
  PrintAlias,
  PurchaseStateSnapshot,
  SaleDraft,
  SaleDraftItem,
  StorageLocation,
} from '@/models';
import { sizeToNumber } from '@/utils/fitInsights';
import { normalizePrintName, resolvePrintName } from '@/utils/printName';
import { normalizePrintKey, normalizeStringArray, normalizeToken as normalizeGenericToken, normalizeUrl, normalizeWhitespace, trimOrNull } from '@/utils/normalize';
import { resolveOutboundLink } from '@/utils/outbound';
import { SAMPLE_CHILD_IDS, SAMPLE_ITEM_IDS } from '@/utils/sampleData';
import { validateNewItemInput } from '@/utils/itemValidation';
import { sanitizeCategoryOrder, sanitizeHiddenCategories, sanitizeCategoryOrder as sanitizeOrder } from '@/utils/categories';
import { getMaxKidsAllowed } from '@/config/betaLimits';
import { makeId } from '@/utils/id';
import { inferSizeScheme, isShoeCategory, normalizeSize as normalizeStructuredSize } from '@/lib/sizing';
import { normalizeInventoryRealityThreshold } from '@/utils/inventoryReality';
import { getDb, initDatabase } from './sqlite';

export interface NewChildInput {
  name: string;
  photoUri?: string;
  notes?: string;
  usesMixedSizes?: boolean;
  currentSizeCodes?: string[];
  hiddenClosetCategories?: string[];
  currentSizeCode?: Child['currentSize']['code'];
  currentSizeOther?: string;
  nextSizeCode?: Child['nextSize']['code'];
  nextSizeOther?: string;
  apparelSizeCurrent?: string;
  apparelSizeNext?: string;
  shoeSizeCurrent?: string;
  shoeSizeNext?: string;
  shoeSizeSystem?: Child['shoeSizeSystem'];
}

export interface NewItemInput {
  childId?: ID;
  childIds?: ID[];
  url?: string;
  sourceDomain?: string;
  canonicalUrl?: string;
  outboundUrl?: string;
  clickCount?: number;
  quantity?: number;
  brand?: string;
  styleName?: string;
  printName?: string;
  printNameNorm?: string;
  brandTags?: string[];
  title: string;
  imageUrl?: string;
  imageUrls?: string[];
  cachedImageUri?: string;
  clothingType: Item['clothingType'];
  size: string;
  status: Item['status'];
  tags?: string[];
  notes?: string;
  purchasePrice?: number;
  targetResalePrice?: number;
  soldPrice?: number;
  soldDate?: string;
  listedAt?: string;
  bundleId?: string;
  sizeNormalized?: string;
  sizeType?: Item['sizeType'];
  sizeSystem?: Item['sizeSystem'];
  sizeScheme?: Item['sizeScheme'];
  sizeRaw?: string;
  category?: Item['category'];
  brandFit?: Item['brandFit'];
  kidFit?: Item['kidFit'];
  brandSizeNote?: string;
  fabric?: string;
  fitRating?: Item['fitRating'];
  fitException?: Item['fitException'];
  condition?: Item['condition'];
  bstSelectedPhotoUri?: string;
  bstCondition?: Item['bstCondition'];
  bstConditionNotes?: string;
  bstFlawTags?: Item['bstFlawTags'];
  bstFlawNotes?: string;
  bstWashNotes?: string;
  bstDryingMethod?: Item['bstDryingMethod'];
  bstSmokeNote?: Item['bstSmokeNote'];
  bstPetTypes?: Item['bstPetTypes'];
  bstPetNote?: string;
  bstOffersAccepted?: boolean;
  bstBundleOffersAccepted?: boolean;
  seasonTags?: string[];
  lastWornAt?: number;
  wornCount?: number;
  fitBin?: Item['fitBin'];
  fitBinTouched?: boolean;
  statusForChild?: Item['status'];
  sizeAtTime?: string;
  notesForChild?: string;
  storageLocationId?: ID;
}

export interface BatchAddInput extends NewItemInput {
  quantity: number;
}

export interface SaveFilterPresetInput {
  name: string;
  childId?: ID;
  status?: Item['status'];
  clothingType?: Item['clothingType'];
  includeUnsorted?: boolean;
  query?: string;
}

export interface BulkItemPatchInput {
  status?: Item['status'];
  appendTag?: string;
}

export interface NewOutfitInput {
  childId: ID;
  name: string;
  itemIds: ID[];
  notes?: string;
  previewUri?: string;
  occasionTags?: string[];
  weatherHint?: string;
}

export interface CreateSaleDraftInput {
  title?: string;
  itemIds: ID[];
}

export interface UpdateSaleDraftInput {
  title?: string;
  status?: SaleDraft['status'];
  defaultSmokeNote?: SaleDraft['defaultSmokeNote'];
  defaultPetTypes?: SaleDraft['defaultPetTypes'];
  defaultPetNote?: string;
  defaultWashNote?: string;
  defaultDryingMethod?: SaleDraft['defaultDryingMethod'];
  defaultBundleOffersAccepted?: boolean;
  defaultOffersAccepted?: boolean;
  defaultShippingNote?: string;
  defaultPaymentNote?: string;
  collageGridSize?: BstCollageGridSize;
  collageOrderMode?: BstCollageOrderMode;
  customHeaderImageUri?: string;
  freeGeneratedCardItemIds?: ID[];
  freeGenerationConsumedAt?: number | null;
}

export interface UpdateSaleDraftItemInput {
  listingOrder?: number;
  included?: boolean;
  itemNumber?: number;
  selectedPhotoUri?: string;
  price?: number;
  condition?: SaleDraftItem['condition'];
  conditionNotes?: string;
  flawTags?: SaleDraftItem['flawTags'];
  flawNotes?: string;
  washNotesOverride?: string;
  dryingMethodOverride?: SaleDraftItem['dryingMethodOverride'];
  smokeNoteOverride?: SaleDraftItem['smokeNoteOverride'];
  petTypesOverride?: SaleDraftItem['petTypesOverride'];
  petNoteOverride?: string;
  offersAcceptedOverride?: boolean;
  bundleOffersAcceptedOverride?: boolean;
  generatedStatus?: string;
}

export interface BulkUpdateSaleDraftItemsInput {
  condition?: SaleDraftItem['condition'] | null;
  dryingMethodOverride?: SaleDraftItem['dryingMethodOverride'] | null;
  offersAcceptedOverride?: boolean | null;
  bundleOffersAcceptedOverride?: boolean | null;
}

interface StoreState {
  children: Child[];
  items: Item[];
  childItems: ChildItem[];
  storageLocations: StorageLocation[];
  printAliases: PrintAlias[];
  purchaseState?: PurchaseStateSnapshot;
  outfits: Outfit[];
  filterPresets: FilterPreset[];
  brands: string[];
  saleDrafts: SaleDraft[];
  saleDraftItems: SaleDraftItem[];
  settings: AppSettings;
}

interface EventInput {
  type: string;
  payload?: Record<string, unknown>;
}

const runInTransaction = async (
  db: Awaited<ReturnType<typeof getDb>>,
  fn: () => Promise<void>,
) => {
  await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');
  try {
    await fn();
    await db.execAsync('COMMIT;');
  } catch (error) {
    try {
      await db.execAsync('ROLLBACK;');
    } catch {
      // Best-effort rollback after transaction failure.
    }
    throw error;
  }
};

export interface ListRecentItemsInput {
  childId?: ID;
  limit?: number;
  sinceHours?: number;
  status?: Item['status'];
}

type ChildRow = {
  id: string;
  name: string;
  photoUri: string | null;
  notes: string | null;
  hiddenClosetCategories: string | null;
  usesMixedSizes: number | null;
  currentSizeCodes: string | null;
  apparelSizeCurrent: string | null;
  apparelSizeNext: string | null;
  shoeSizeCurrent: string | null;
  shoeSizeNext: string | null;
  shoeSizeSystem: string | null;
  currentSizeCode: Child['currentSize']['code'] | null;
  currentSizeOther: string | null;
  nextSizeCode: Child['nextSize']['code'] | null;
  nextSizeOther: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

type ItemRow = {
  id: string;
  childId: string | null;
  url: string | null;
  sourceDomain: string | null;
  canonicalUrl: string | null;
  outboundUrl: string | null;
  clickCount: number | null;
  quantity: number | null;
  brand: string | null;
  styleName: string | null;
  printName: string | null;
  printNameNorm: string | null;
  title: string | null;
  imageUrl: string | null;
  imageUrls: string | null;
  cachedImageUri: string | null;
  clothingType: string;
  size: string;
  status: string | null;
  notes: string | null;
  purchasePrice: number | null;
  targetResalePrice: number | null;
  soldPrice: number | null;
  soldDate: string | null;
  listedAt: string | null;
  bundleId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  sizeNormalized: string | null;
  sizeType: string | null;
  sizeSystem: string | null;
  sizeScheme: string | null;
  sizeRaw: string | null;
  category: string | null;
  brandFit: string | null;
  kidFit: string | null;
  brandSizeNote: string | null;
  fabric: string | null;
  fitRating: string | null;
  fitException: string | null;
  condition: string | null;
  bstSelectedPhotoUri: string | null;
  bstCondition: string | null;
  bstConditionNotes: string | null;
  bstFlawTagsJson: string | null;
  bstFlawNotes: string | null;
  bstWashNotes: string | null;
  bstDryingMethod: string | null;
  bstSmokeNote: string | null;
  bstPetType: string | null;
  bstPetNote: string | null;
  bstOffersAccepted: number | null;
  bstBundleOffersAccepted: number | null;
  seasonTags: string | null;
  lastWornAt: number | null;
  wornCount: number | null;
  fitBin: string | null;
  fitBinTouched: number | null;
};

type ChildItemRow = {
  id: string;
  childId: string;
  itemId: string;
  storageLocationId: string | null;
  sizeAtTime: string | null;
  statusForChild: string;
  notesForChild: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

type StorageLocationRow = {
  id: string;
  childId: string | null;
  name: string;
  type: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type PrintAliasRow = {
  id: string;
  canonical: string;
  alias: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type OutfitRow = {
  id: string;
  childId: string;
  name: string;
  itemIds: string;
  notes: string | null;
  previewUri: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  occasionTags: string | null;
  weatherHint: string | null;
};

type TagRow = { id: string; name: string; createdAt: number };
type BrandRow = { id: string; name: string; createdAt: number };
type ItemTagRow = { itemId: string; tagName: string };
type ItemBrandRow = { itemId: string; brandName: string };
type OutfitTagRow = { outfitId: string; tagName: string };

type SettingsRow = {
  id: string;
  detailPromptMode: string;
  closetAddDefaultView: string | null;
  notificationsEnabled: number;
  notifyWeeklyTidy: number;
  notifyOutgrow: number;
  monetizationEnabled: number;
  guidedOnboarding: number;
  guidedOnboardingCompleted: number;
  advancedFeaturesUnlocked: number;
  lastShoppingType: string | null;
  lastShoppingChildId: string | null;
  lastPromptedAt: number | null;
  lastUpsellShownAt: number | null;
  closetCategoryOrder: string | null;
  hiddenClosetCategoriesGlobal: string | null;
  wishlistCategoryOrder: string | null;
  hiddenWishlistCategories: string | null;
  kidsPreviewCategories: string | null;
  inventoryRealityCheckOwnedThreshold: number | null;
  developerModeEnabled: number | null;
  devProUnlocked: number | null;
  developerForceProAccessEnabled: number | null;
  betaKidLimitBannerDismissed: number | null;
  proTeaserBannerDismissed: number | null;
  missingPhotoRestoreNudgeShown: number | null;
  hasSeenBstPostingGuide: number | null;
};

type SaleDraftRow = {
  id: string;
  title: string | null;
  status: string | null;
  defaultSmokeNote: string | null;
  defaultPetType: string | null;
  defaultPetNote: string | null;
  defaultWashNote: string | null;
  defaultDryingMethod: string | null;
  defaultBundleOffersAccepted: number | null;
  defaultOffersAccepted: number | null;
  defaultShippingNote: string | null;
  defaultPaymentNote: string | null;
  collageGridSize: string | null;
  collageOrderMode: string | null;
  customHeaderImageUri: string | null;
  freeGeneratedCardItemIdsJson: string | null;
  freeGenerationConsumedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type SaleDraftItemRow = {
  id: string;
  saleDraftId: string;
  itemId: string;
  listingOrder: number;
  included: number | null;
  itemNumber: number;
  selectedPhotoUri: string | null;
  price: number | null;
  condition: string | null;
  conditionNotes: string | null;
  flawTagsJson: string | null;
  flawNotes: string | null;
  washNotesOverride: string | null;
  dryingMethodOverride: string | null;
  smokeNoteOverride: string | null;
  petTypeOverride: string | null;
  petNoteOverride: string | null;
  offersAcceptedOverride: number | null;
  bundleOffersAcceptedOverride: number | null;
  generatedStatus: string | null;
  createdAt: number;
  updatedAt: number;
};

type EventRow = {
  id: string;
  type: string;
  payload: string | null;
  createdAt: number;
};

type FilterPresetRow = {
  id: string;
  name: string;
  childId: string | null;
  status: string | null;
  clothingType: string | null;
  includeUnsorted: number;
  query: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

type PurchaseStateRow = {
  id: number;
  isEntitled: number;
  payloadJson: string;
  updatedAt: string;
};

const defaultSettings: AppSettings = {
  closetAddDefaultView: 'detailed',
  notificationsEnabled: false,
  notifyWeeklyTidy: false,
  notifyOutgrow: false,
  monetizationEnabled: false,
  guidedOnboarding: true,
  guidedOnboardingCompleted: false,
  advancedFeaturesUnlocked: false,
  lastShoppingType: undefined,
  lastShoppingChildId: undefined,
  lastUpsellShownAt: undefined,
  closetCategoryOrder: undefined,
  hiddenClosetCategoriesGlobal: [],
  wishlistCategoryOrder: undefined,
  hiddenWishlistCategories: [],
  kidsPreviewCategories: undefined,
  inventoryRealityCheckOwnedThreshold: 5,
  developerModeEnabled: false,
  developerForceProAccessEnabled: false,
  betaKidLimitBannerDismissed: false,
  proTeaserBannerDismissed: false,
  missingPhotoRestoreNudgeShown: true,
  hasSeenBstPostingGuide: false,
};

const parseStringList = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
};

const normalizeImageUrls = (imageUrl?: string, imageUrls?: string[]): string[] => {
  const merged = [...(imageUrls ?? []), imageUrl ?? '']
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(merged));
};

const normalizeQuantity = (value?: number | null): number => {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
};

const normalizeChildIds = (childId?: ID, childIds?: ID[]): ID[] => (
  Array.from(new Set([childId, ...(childIds ?? [])].filter((entry): entry is ID => Boolean(entry))))
);

const deriveItemSizingFields = (input: {
  clothingType?: string | null;
  category?: string | null;
  size?: string | null;
  sizeRaw?: string | null;
  sizeNormalized?: string | null;
  sizeType?: Item['sizeType'];
  sizeSystem?: Item['sizeSystem'];
  sizeScheme?: Item['sizeScheme'];
  fitBin?: Item['fitBin'];
  fitBinTouched?: boolean | null;
}) => {
  const sizeRaw = normalizeWhitespace(String(input.sizeRaw ?? input.size ?? ''));
  const sizeType: NonNullable<Item['sizeType']> =
    input.sizeType ?? (isShoeCategory(String(input.category ?? input.clothingType ?? '')) ? 'shoe' : 'apparel');
  const sizeNormalized = trimOrNull(input.sizeNormalized) ?? (normalizeStructuredSize(sizeRaw) || undefined);
  const sizeScheme = (input.sizeScheme ?? (sizeRaw ? inferSizeScheme(sizeRaw) : 'CUSTOM')) as NonNullable<Item['sizeScheme']>;
  const sizeSystem: NonNullable<Item['sizeSystem']> = input.sizeSystem ?? (sizeType === 'shoe' ? 'US_SHOE' : 'APPAREL');
  return {
    legacySize: sizeRaw,
    sizeRaw: sizeRaw || undefined,
    sizeNormalized,
    sizeType,
    sizeSystem,
    sizeScheme,
    fitBin: (input.fitBin ?? 'unsure') as NonNullable<Item['fitBin']>,
    fitBinTouched: Boolean(input.fitBinTouched),
  };
};

const mapChild = (row: ChildRow): Child => ({
  id: row.id,
  name: row.name,
  photoUri: row.photoUri ?? undefined,
  notes: row.notes ?? undefined,
  usesMixedSizes: Boolean(row.usesMixedSizes ?? 0),
  currentSizeCodes: parseStringList(row.currentSizeCodes),
  hiddenClosetCategories: parseStringList(row.hiddenClosetCategories),
  apparelSizeCurrent: row.apparelSizeCurrent ?? undefined,
  apparelSizeNext: row.apparelSizeNext ?? undefined,
  shoeSizeCurrent: row.shoeSizeCurrent ?? undefined,
  shoeSizeNext: row.shoeSizeNext ?? undefined,
  shoeSizeSystem: (row.shoeSizeSystem as Child['shoeSizeSystem']) ?? 'US_SHOE',
  currentSize: {
    code: row.currentSizeCode ?? null,
    otherText: row.currentSizeOther ?? null,
  },
  nextSize: {
    code: row.nextSizeCode ?? null,
    otherText: row.nextSizeOther ?? null,
  },
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? undefined,
});

const mapChildItem = (row: ChildItemRow): ChildItem => ({
  id: row.id,
  childId: row.childId,
  itemId: row.itemId,
  storageLocationId: row.storageLocationId ?? undefined,
  sizeAtTime: row.sizeAtTime ?? undefined,
  statusForChild: row.statusForChild as ChildItem['statusForChild'],
  notesForChild: row.notesForChild ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? undefined,
});

const mapStorageLocation = (row: StorageLocationRow): StorageLocation => ({
  id: row.id,
  childId: row.childId ?? undefined,
  name: row.name,
  type: row.type ?? undefined,
  notes: row.notes ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? undefined,
});

const mapPrintAlias = (row: PrintAliasRow): PrintAlias => ({
  id: row.id,
  canonical: row.canonical,
  alias: row.alias,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? undefined,
});

const mapItem = (row: ItemRow, tags: string[], brandTags: string[], childIds: string[]): Item => ({
  id: row.id,
  url: row.url ?? undefined,
  sourceDomain: row.sourceDomain ?? undefined,
  canonicalUrl: row.canonicalUrl ?? undefined,
  outboundUrl: row.outboundUrl ?? undefined,
  clickCount: row.clickCount ?? 0,
  quantity: normalizeQuantity(row.quantity),
  brand: row.brand ?? undefined,
  styleName: row.styleName ?? undefined,
  printName: row.printName ?? undefined,
  printNameNorm: row.printNameNorm ?? undefined,
  brandTags,
  title: row.title ?? '',
  imageUrl: row.imageUrl ?? undefined,
  imageUrls: normalizeImageUrls(row.imageUrl ?? undefined, parseStringList(row.imageUrls)),
  cachedImageUri: row.cachedImageUri ?? undefined,
  clothingType: row.clothingType as Item['clothingType'],
  size: row.size,
  status: (row.status ?? 'wishlist') as Item['status'],
  notes: row.notes ?? undefined,
  purchasePrice: row.purchasePrice ?? undefined,
  targetResalePrice: row.targetResalePrice ?? undefined,
  soldPrice: row.soldPrice ?? undefined,
  soldDate: row.soldDate ?? undefined,
  listedAt: row.listedAt ?? undefined,
  bundleId: row.bundleId ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? undefined,
  sizeNormalized: row.sizeNormalized ?? undefined,
  sizeType: (row.sizeType as Item['sizeType']) ?? undefined,
  sizeSystem: (row.sizeSystem as Item['sizeSystem']) ?? undefined,
  sizeScheme: (row.sizeScheme as Item['sizeScheme']) ?? undefined,
  sizeRaw: row.sizeRaw ?? row.size ?? undefined,
  category: (row.category as Item['category']) ?? undefined,
  brandFit: (row.brandFit as Item['brandFit']) ?? undefined,
  kidFit: (row.kidFit as Item['kidFit']) ?? undefined,
  brandSizeNote: row.brandSizeNote ?? undefined,
  fabric: row.fabric ?? undefined,
  fitRating: (row.fitRating as Item['fitRating']) ?? undefined,
  fitException: (row.fitException as Item['fitException']) ?? undefined,
  condition: (row.condition as Item['condition']) ?? undefined,
  bstSelectedPhotoUri: row.bstSelectedPhotoUri ?? undefined,
  bstCondition: (row.bstCondition as Item['bstCondition']) ?? undefined,
  bstConditionNotes: row.bstConditionNotes ?? undefined,
  bstFlawTags: parseStringList(row.bstFlawTagsJson) as Item['bstFlawTags'],
  bstFlawNotes: row.bstFlawNotes ?? undefined,
  bstWashNotes: row.bstWashNotes ?? undefined,
  bstDryingMethod: (row.bstDryingMethod as Item['bstDryingMethod']) ?? undefined,
  bstSmokeNote: (row.bstSmokeNote as Item['bstSmokeNote']) ?? undefined,
  bstPetTypes: parsePetTypesField(row.bstPetType) as Item['bstPetTypes'],
  bstPetNote: row.bstPetNote ?? undefined,
  bstOffersAccepted: row.bstOffersAccepted === null ? undefined : row.bstOffersAccepted === 1,
  bstBundleOffersAccepted: row.bstBundleOffersAccepted === null ? undefined : row.bstBundleOffersAccepted === 1,
  seasonTags: parseStringList(row.seasonTags),
  lastWornAt: row.lastWornAt ?? undefined,
  wornCount: row.wornCount ?? 0,
  fitBin: (row.fitBin as Item['fitBin']) ?? 'unsure',
  fitBinTouched: row.fitBinTouched === 1,
  tags,
  childIds: childIds.length ? childIds : (row.childId ? [row.childId] : []),
});

const mapOutfit = (row: OutfitRow, tags: string[]): Outfit => ({
  id: row.id,
  childId: row.childId,
  name: row.name,
  itemIds: parseStringList(row.itemIds),
  notes: row.notes ?? undefined,
  previewUri: row.previewUri ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  deletedAt: row.deletedAt ?? undefined,
  occasionTags: tags.length ? tags : parseStringList(row.occasionTags),
  weatherHint: row.weatherHint ?? undefined,
});

const mapSettings = (row?: SettingsRow | null): AppSettings => {
  if (!row) return defaultSettings;
  const legacyDevProUnlocked = row.devProUnlocked === 1;
  return {
    closetAddDefaultView: row.closetAddDefaultView === 'simple' ? 'simple' : 'detailed',
    notificationsEnabled: row.notificationsEnabled === 1,
    notifyWeeklyTidy: row.notifyWeeklyTidy === 1,
    notifyOutgrow: row.notifyOutgrow === 1,
    monetizationEnabled: row.monetizationEnabled === 1,
    guidedOnboarding: row.guidedOnboarding === 1,
    guidedOnboardingCompleted: row.guidedOnboardingCompleted === 1,
    advancedFeaturesUnlocked: row.advancedFeaturesUnlocked === 1,
    lastShoppingType: (row.lastShoppingType as AppSettings['lastShoppingType']) ?? undefined,
    lastShoppingChildId: row.lastShoppingChildId ?? undefined,
    lastPromptedAt: row.lastPromptedAt ?? undefined,
    lastUpsellShownAt: row.lastUpsellShownAt ?? undefined,
    closetCategoryOrder: sanitizeOrder(parseStringList(row.closetCategoryOrder), { includeOther: true }),
    hiddenClosetCategoriesGlobal: sanitizeHiddenCategories(parseStringList(row.hiddenClosetCategoriesGlobal), { includeOther: true }),
    wishlistCategoryOrder: sanitizeCategoryOrder(parseStringList(row.wishlistCategoryOrder), { includeOther: false }),
    hiddenWishlistCategories: sanitizeHiddenCategories(parseStringList(row.hiddenWishlistCategories), { includeOther: false }),
    kidsPreviewCategories: (() => {
      const raw = parseStringList(row.kidsPreviewCategories);
      return sanitizeCategoryOrder(raw, { includeOther: true, fallback: raw as any });
    })(),
    inventoryRealityCheckOwnedThreshold: normalizeInventoryRealityThreshold(row.inventoryRealityCheckOwnedThreshold),
    developerModeEnabled: row.developerModeEnabled === 1,
    developerForceProAccessEnabled: (row.developerForceProAccessEnabled ?? (legacyDevProUnlocked ? 1 : 0)) === 1,
    betaKidLimitBannerDismissed: row.betaKidLimitBannerDismissed === 1,
    proTeaserBannerDismissed: row.proTeaserBannerDismissed === 1,
    missingPhotoRestoreNudgeShown: row.missingPhotoRestoreNudgeShown === 1,
    hasSeenBstPostingGuide: row.hasSeenBstPostingGuide === 1,
  };
};

const mapEvent = (row: EventRow): ActivityEvent => ({
  id: row.id,
  type: row.type,
  payload: row.payload ? (JSON.parse(row.payload) as Record<string, unknown>) : undefined,
  createdAt: row.createdAt,
});

const mapFilterPreset = (row: FilterPresetRow): FilterPreset => ({
  id: row.id,
  name: row.name,
  childId: row.childId ?? undefined,
  status: (row.status as FilterPreset['status']) ?? undefined,
  clothingType: (row.clothingType as FilterPreset['clothingType']) ?? undefined,
  includeUnsorted: row.includeUnsorted === 1,
  query: row.query ?? undefined,
  createdAt: row.createdAt,
});

const mapPurchaseState = (row?: PurchaseStateRow | null): PurchaseStateSnapshot | undefined => {
  if (!row) return undefined;
  try {
    const parsed = JSON.parse(row.payloadJson) as PurchaseStateSnapshot;
    return {
      isEntitled: row.isEntitled === 1,
      activeEntitlements: parsed.activeEntitlements ?? [],
      activeSubscriptions: parsed.activeSubscriptions ?? [],
      nonSubscriptions: parsed.nonSubscriptions ?? [],
      latestPurchaseAt: parsed.latestPurchaseAt,
      updatedAt: row.updatedAt || parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
};

const mapSaleDraft = (row: SaleDraftRow): SaleDraft => ({
  id: row.id,
  title: row.title ?? undefined,
  status: (row.status ?? 'draft') as SaleDraft['status'],
  defaultSmokeNote: (row.defaultSmokeNote as SaleDraft['defaultSmokeNote']) ?? undefined,
  defaultPetTypes: parsePetTypesField(row.defaultPetType),
  defaultPetNote: row.defaultPetNote ?? undefined,
  defaultWashNote: row.defaultWashNote ?? undefined,
  defaultDryingMethod: (row.defaultDryingMethod as SaleDraft['defaultDryingMethod']) ?? undefined,
  defaultBundleOffersAccepted: row.defaultBundleOffersAccepted === null ? undefined : row.defaultBundleOffersAccepted === 1,
  defaultOffersAccepted: row.defaultOffersAccepted === null ? undefined : row.defaultOffersAccepted === 1,
  defaultShippingNote: row.defaultShippingNote ?? undefined,
  defaultPaymentNote: row.defaultPaymentNote ?? undefined,
  collageGridSize: (row.collageGridSize as SaleDraft['collageGridSize']) ?? 'Auto',
  collageOrderMode: (row.collageOrderMode as SaleDraft['collageOrderMode']) ?? 'highest-price',
  customHeaderImageUri: row.customHeaderImageUri ?? undefined,
  freeGeneratedCardItemIds: parseStringList(row.freeGeneratedCardItemIdsJson),
  freeGenerationConsumedAt: row.freeGenerationConsumedAt ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapSaleDraftItem = (row: SaleDraftItemRow): SaleDraftItem => ({
  id: row.id,
  saleDraftId: row.saleDraftId,
  itemId: row.itemId,
  listingOrder: row.listingOrder,
  included: row.included !== 0,
  itemNumber: row.itemNumber,
  selectedPhotoUri: row.selectedPhotoUri ?? undefined,
  price: row.price ?? undefined,
  condition: (row.condition as SaleDraftItem['condition']) ?? undefined,
  conditionNotes: row.conditionNotes ?? undefined,
  flawTags: parseStringList(row.flawTagsJson) as SaleDraftItem['flawTags'],
  flawNotes: row.flawNotes ?? undefined,
  washNotesOverride: row.washNotesOverride ?? undefined,
  dryingMethodOverride: (row.dryingMethodOverride as SaleDraftItem['dryingMethodOverride']) ?? undefined,
  smokeNoteOverride: (row.smokeNoteOverride as SaleDraftItem['smokeNoteOverride']) ?? undefined,
  petTypesOverride: parsePetTypesField(row.petTypeOverride),
  petNoteOverride: row.petNoteOverride ?? undefined,
  offersAcceptedOverride: row.offersAcceptedOverride === null ? undefined : row.offersAcceptedOverride === 1,
  bundleOffersAcceptedOverride: row.bundleOffersAcceptedOverride === null ? undefined : row.bundleOffersAcceptedOverride === 1,
  generatedStatus: row.generatedStatus ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const normalizeTagName = (name: string) => normalizeGenericToken(name).replace(/\s+/g, ' ').trim();
const normalizeBrandName = (name: string) => normalizeGenericToken(name).replace(/\s+/g, ' ').trim();
const normalizeChildName = (name: string) => normalizeWhitespace(name).trim().toLocaleLowerCase();

const duplicateChildNameError = () => {
  const error = new Error('There is already a child with that name.');
  (error as Error & { code?: string }).code = 'DUPLICATE_CHILD_NAME';
  return error;
};

const normalizeOptionalNumber = (value?: number | null): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeSaleDraftTitle = (value?: string | null): string | undefined => trimOrNull(value ?? undefined) ?? undefined;
const normalizeSaleDraftText = (value?: string | null): string | undefined => trimOrNull(value ?? undefined) ?? undefined;
const normalizePetTypes = <T extends string>(value?: T[] | null): T[] | undefined => {
  if (!value) return undefined;
  const normalized = Array.from(new Set(value.map((entry) => trimOrNull(entry) as T | null).filter(Boolean))) as T[];
  return normalized.length ? normalized : undefined;
};

const parsePetTypesField = (value?: string | null): SaleDraft['defaultPetTypes'] | undefined => {
  const trimmed = trimOrNull(value ?? undefined);
  if (!trimmed) return undefined;
  if (trimmed.startsWith('[')) {
    return parseStringList(trimmed) as SaleDraft['defaultPetTypes'];
  }
  return [trimmed as NonNullable<SaleDraft['defaultPetTypes']>[number]];
};

const toNullableBooleanDbValue = (value?: boolean | null): number | null => {
  if (value === undefined || value === null) return null;
  return value ? 1 : 0;
};

const renumberSaleDraftItems = async (db: Awaited<ReturnType<typeof getDb>>, saleDraftId: ID) => {
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM sale_draft_items WHERE saleDraftId = ? ORDER BY listingOrder ASC, createdAt ASC;',
    saleDraftId,
  );
  const now = Date.now();
  for (let index = 0; index < rows.length; index += 1) {
    await db.runAsync(
      'UPDATE sale_draft_items SET listingOrder = ?, itemNumber = ?, updatedAt = ? WHERE id = ?;',
      index,
      index + 1,
      now,
      rows[index].id,
    );
  }
  await db.runAsync('UPDATE sale_drafts SET updatedAt = ? WHERE id = ?;', now, saleDraftId);
};

const cleanupDraftFreeGeneratedCardIds = async (db: Awaited<ReturnType<typeof getDb>>, saleDraftId: ID) => {
  const draftRow = await db.getFirstAsync<{ freeGeneratedCardItemIdsJson: string | null }>(
    'SELECT freeGeneratedCardItemIdsJson FROM sale_drafts WHERE id = ?;',
    saleDraftId,
  );
  if (!draftRow) return;
  const includedRows = await db.getAllAsync<{ id: string }>('SELECT id FROM sale_draft_items WHERE saleDraftId = ?;', saleDraftId);
  const includedIds = new Set(includedRows.map((row) => row.id));
  const nextIds = parseStringList(draftRow.freeGeneratedCardItemIdsJson).filter((id) => includedIds.has(id));
  await db.runAsync(
    'UPDATE sale_drafts SET freeGeneratedCardItemIdsJson = ?, updatedAt = ? WHERE id = ?;',
    JSON.stringify(nextIds),
    Date.now(),
    saleDraftId,
  );
};

const assertUniqueChildName = async (db: Awaited<ReturnType<typeof getDb>>, name: string, excludeId?: ID) => {
  const normalizedName = normalizeChildName(name);
  if (!normalizedName) return;
  const rows = await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM children WHERE deletedAt IS NULL;');
  const duplicate = rows.find((row) => row.id !== excludeId && normalizeChildName(row.name) === normalizedName);
  if (duplicate) throw duplicateChildNameError();
};

const getActivePrintAliases = async (): Promise<PrintAlias[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<PrintAliasRow>('SELECT * FROM print_aliases WHERE deletedAt IS NULL;');
  return rows.map(mapPrintAlias);
};

const upsertTag = async (name: string): Promise<TagRow | null> => {
  const normalized = normalizeTagName(name);
  if (!normalized) return null;

  const db = await getDb();
  const now = Date.now();
  await db.runAsync('INSERT OR IGNORE INTO tags (id, name, createdAt) VALUES (?, ?, ?);', makeId(), normalized, now);
  return db.getFirstAsync<TagRow>('SELECT id, name, createdAt FROM tags WHERE name = ?;', normalized);
};

const upsertBrand = async (name: string): Promise<BrandRow | null> => {
  const normalized = normalizeBrandName(name);
  if (!normalized) return null;

  const db = await getDb();
  const now = Date.now();
  await db.runAsync('INSERT OR IGNORE INTO brands (id, name, createdAt) VALUES (?, ?, ?);', makeId(), normalized, now);
  return db.getFirstAsync<BrandRow>('SELECT id, name, createdAt FROM brands WHERE name = ?;', normalized);
};

const replaceItemTags = async (itemId: ID, tags: string[]) => {
  const db = await getDb();
  await db.runAsync('DELETE FROM item_tags WHERE itemId = ?;', itemId);

  const unique = Array.from(new Set(tags.map(normalizeTagName).filter(Boolean)));
  for (const tagName of unique) {
    const tag = await upsertTag(tagName);
    if (!tag) continue;
    await db.runAsync('INSERT OR REPLACE INTO item_tags (itemId, tagId, createdAt) VALUES (?, ?, ?);', itemId, tag.id, Date.now());
  }
};

const replaceOutfitTags = async (outfitId: ID, tags: string[]) => {
  const db = await getDb();
  await db.runAsync('DELETE FROM outfit_tags WHERE outfitId = ?;', outfitId);

  const unique = Array.from(new Set(tags.map(normalizeTagName).filter(Boolean)));
  for (const tagName of unique) {
    const tag = await upsertTag(tagName);
    if (!tag) continue;
    await db.runAsync('INSERT OR REPLACE INTO outfit_tags (outfitId, tagId, createdAt) VALUES (?, ?, ?);', outfitId, tag.id, Date.now());
  }
};

const replaceItemBrands = async (itemId: ID, brands: string[]) => {
  const db = await getDb();
  await db.runAsync('DELETE FROM item_brands WHERE itemId = ?;', itemId);

  const unique = Array.from(new Set(brands.map(normalizeBrandName).filter(Boolean)));
  for (const brandName of unique) {
    const brand = await upsertBrand(brandName);
    if (!brand) continue;
    await db.runAsync('INSERT OR REPLACE INTO item_brands (itemId, brandId, createdAt) VALUES (?, ?, ?);', itemId, brand.id, Date.now());
  }
};

const upsertChildItem = async (input: {
  childId: ID;
  itemId: ID;
  storageLocationId?: ID;
  sizeAtTime?: string;
  statusForChild: Item['status'];
  notesForChild?: string;
}) => {
  const db = await getDb();
  const existing = await db.getFirstAsync<ChildItemRow>(
    'SELECT * FROM child_items WHERE childId = ? AND itemId = ?;',
    input.childId,
    input.itemId,
  );

  const now = Date.now();
  if (!existing) {
    await db.runAsync(
      `INSERT INTO child_items (id, childId, itemId, storageLocationId, sizeAtTime, statusForChild, notesForChild, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      makeId(),
      input.childId,
      input.itemId,
      input.storageLocationId ?? null,
      input.sizeAtTime ?? null,
      input.statusForChild,
      input.notesForChild ?? null,
      now,
      now,
      null,
    );
    return;
  }

  await db.runAsync(
    `UPDATE child_items SET storageLocationId = ?, sizeAtTime = ?, statusForChild = ?, notesForChild = ?, updatedAt = ?, deletedAt = NULL WHERE id = ?;`,
    input.storageLocationId ?? existing.storageLocationId,
    input.sizeAtTime ?? existing.sizeAtTime,
    input.statusForChild,
    input.notesForChild ?? existing.notesForChild,
    now,
    existing.id,
  );
};

const syncChildItemsForItem = async (input: {
  itemId: ID;
  childIds: ID[];
  sizeAtTime?: string;
  statusForChild: Item['status'];
  notesForChild?: string;
  storageLocationId?: ID;
}) => {
  const db = await getDb();
  const existing = await db.getAllAsync<ChildItemRow>('SELECT * FROM child_items WHERE itemId = ?;', input.itemId);
  const desired = new Set(input.childIds);
  const now = Date.now();

  for (const childId of input.childIds) {
    await upsertChildItem({
      childId,
      itemId: input.itemId,
      storageLocationId: input.storageLocationId,
      sizeAtTime: input.sizeAtTime,
      statusForChild: input.statusForChild,
      notesForChild: input.notesForChild,
    });
  }

  for (const link of existing) {
    if (desired.has(link.childId)) continue;
    await db.runAsync('UPDATE child_items SET deletedAt = ?, updatedAt = ? WHERE id = ?;', now, now, link.id);
  }
};

export const repository = {
  async init() {
    await initDatabase();
  },

  async getAll(): Promise<StoreState> {
    await initDatabase();
    const db = await getDb();

    const [
      childrenRows,
      itemRows,
      childItemRows,
      storageLocationRows,
      printAliasRows,
      purchaseStateRow,
      outfitRows,
      itemTagRows,
      itemBrandRows,
      outfitTagRows,
      settingsRow,
      filterPresetRows,
      brandRows,
      saleDraftRows,
      saleDraftItemRows,
    ] =
      await Promise.all([
      db.getAllAsync<ChildRow>('SELECT * FROM children WHERE deletedAt IS NULL ORDER BY createdAt DESC;'),
      db.getAllAsync<ItemRow>('SELECT * FROM items WHERE deletedAt IS NULL ORDER BY updatedAt DESC;'),
      db.getAllAsync<ChildItemRow>('SELECT * FROM child_items WHERE deletedAt IS NULL ORDER BY updatedAt DESC;'),
      db.getAllAsync<StorageLocationRow>('SELECT * FROM storage_locations WHERE deletedAt IS NULL ORDER BY updatedAt DESC;'),
      db.getAllAsync<PrintAliasRow>('SELECT * FROM print_aliases WHERE deletedAt IS NULL ORDER BY updatedAt DESC;'),
      db.getFirstAsync<PurchaseStateRow>('SELECT * FROM purchase_state WHERE id = 1;'),
      db.getAllAsync<OutfitRow>('SELECT * FROM outfits WHERE deletedAt IS NULL ORDER BY createdAt DESC;'),
      db.getAllAsync<ItemTagRow>(
        `SELECT it.itemId as itemId, t.name as tagName
         FROM item_tags it
         JOIN tags t ON t.id = it.tagId;`,
      ),
      db.getAllAsync<ItemBrandRow>(
        `SELECT ib.itemId as itemId, b.name as brandName
         FROM item_brands ib
         JOIN brands b ON b.id = ib.brandId;`,
      ),
      db.getAllAsync<OutfitTagRow>(
        `SELECT ot.outfitId as outfitId, t.name as tagName
         FROM outfit_tags ot
         JOIN tags t ON t.id = ot.tagId;`,
      ),
      db.getFirstAsync<SettingsRow>('SELECT * FROM settings WHERE id = ?;', 'app'),
      db.getAllAsync<FilterPresetRow>('SELECT * FROM filter_presets WHERE deletedAt IS NULL ORDER BY updatedAt DESC;'),
      db.getAllAsync<BrandRow>('SELECT * FROM brands ORDER BY name ASC;'),
      db.getAllAsync<SaleDraftRow>('SELECT * FROM sale_drafts ORDER BY updatedAt DESC;'),
      db.getAllAsync<SaleDraftItemRow>('SELECT * FROM sale_draft_items ORDER BY saleDraftId ASC, listingOrder ASC, createdAt ASC;'),
    ]);

    const itemTagMap = new Map<string, string[]>();
    itemTagRows.forEach((row) => {
      const prev = itemTagMap.get(row.itemId) ?? [];
      prev.push(row.tagName);
      itemTagMap.set(row.itemId, prev);
    });

    const outfitTagMap = new Map<string, string[]>();
    outfitTagRows.forEach((row) => {
      const prev = outfitTagMap.get(row.outfitId) ?? [];
      prev.push(row.tagName);
      outfitTagMap.set(row.outfitId, prev);
    });

    const itemBrandMap = new Map<string, string[]>();
    itemBrandRows.forEach((row) => {
      const prev = itemBrandMap.get(row.itemId) ?? [];
      prev.push(row.brandName);
      itemBrandMap.set(row.itemId, prev);
    });

    const childIdsByItem = new Map<string, string[]>();
    childItemRows.forEach((row) => {
      const prev = childIdsByItem.get(row.itemId) ?? [];
      if (!prev.includes(row.childId)) prev.push(row.childId);
      childIdsByItem.set(row.itemId, prev);
    });

    return {
      children: childrenRows.map(mapChild),
      items: itemRows.map((row) => mapItem(row, itemTagMap.get(row.id) ?? [], itemBrandMap.get(row.id) ?? [], childIdsByItem.get(row.id) ?? [])),
      childItems: childItemRows.map(mapChildItem),
      storageLocations: storageLocationRows.map(mapStorageLocation),
      printAliases: printAliasRows.map(mapPrintAlias),
      purchaseState: mapPurchaseState(purchaseStateRow),
      outfits: outfitRows.map((row) => mapOutfit(row, outfitTagMap.get(row.id) ?? [])),
      filterPresets: filterPresetRows.map(mapFilterPreset),
      brands: brandRows.map((row) => row.name),
      saleDrafts: saleDraftRows.map(mapSaleDraft),
      saleDraftItems: saleDraftItemRows.map(mapSaleDraftItem),
      settings: mapSettings(settingsRow),
    };
  },

  async getSettings(): Promise<AppSettings> {
    await initDatabase();
    const db = await getDb();
    const row = await db.getFirstAsync<SettingsRow>('SELECT * FROM settings WHERE id = ?;', 'app');
    return mapSettings(row);
  },

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await repository.getSettings();
    const next: AppSettings = {
      ...current,
      ...patch,
      inventoryRealityCheckOwnedThreshold: normalizeInventoryRealityThreshold(
        patch.inventoryRealityCheckOwnedThreshold ?? current.inventoryRealityCheckOwnedThreshold,
      ),
    };

    await initDatabase();
    const db = await getDb();
    await db.runAsync(
      `UPDATE settings SET detailPromptMode = ?, closetAddDefaultView = ?, notificationsEnabled = ?, notifyWeeklyTidy = ?, notifyOutgrow = ?, monetizationEnabled = ?, guidedOnboarding = ?, guidedOnboardingCompleted = ?, advancedFeaturesUnlocked = ?, lastShoppingType = ?, lastShoppingChildId = ?, lastPromptedAt = ?, lastUpsellShownAt = ?, closetCategoryOrder = ?, hiddenClosetCategoriesGlobal = ?, wishlistCategoryOrder = ?, hiddenWishlistCategories = ?, kidsPreviewCategories = ?, inventoryRealityCheckOwnedThreshold = ?, developerModeEnabled = ?, devProUnlocked = ?, developerForceProAccessEnabled = ?, betaKidLimitBannerDismissed = ?, proTeaserBannerDismissed = ?, missingPhotoRestoreNudgeShown = ?, hasSeenBstPostingGuide = ? WHERE id = ?;`,
      'never',
      next.closetAddDefaultView,
      next.notificationsEnabled ? 1 : 0,
      next.notifyWeeklyTidy ? 1 : 0,
      next.notifyOutgrow ? 1 : 0,
      next.monetizationEnabled ? 1 : 0,
      next.guidedOnboarding ? 1 : 0,
      next.guidedOnboardingCompleted ? 1 : 0,
      next.advancedFeaturesUnlocked ? 1 : 0,
      next.lastShoppingType ?? null,
      next.lastShoppingChildId ?? null,
      next.lastPromptedAt ?? null,
      next.lastUpsellShownAt ?? null,
      next.closetCategoryOrder ? JSON.stringify(sanitizeCategoryOrder(next.closetCategoryOrder, { includeOther: true })) : null,
      JSON.stringify(sanitizeHiddenCategories(next.hiddenClosetCategoriesGlobal, { includeOther: true })),
      next.wishlistCategoryOrder ? JSON.stringify(sanitizeCategoryOrder(next.wishlistCategoryOrder, { includeOther: false })) : null,
      JSON.stringify(sanitizeHiddenCategories(next.hiddenWishlistCategories, { includeOther: false })),
      next.kidsPreviewCategories
        ? JSON.stringify(sanitizeCategoryOrder(next.kidsPreviewCategories, { includeOther: true, fallback: next.kidsPreviewCategories as any }))
        : null,
      next.inventoryRealityCheckOwnedThreshold ?? null,
      next.developerModeEnabled ? 1 : 0,
      next.developerForceProAccessEnabled ? 1 : 0,
      next.developerForceProAccessEnabled ? 1 : 0,
      next.betaKidLimitBannerDismissed ? 1 : 0,
      next.proTeaserBannerDismissed ? 1 : 0,
      next.missingPhotoRestoreNudgeShown ? 1 : 0,
      next.hasSeenBstPostingGuide ? 1 : 0,
      'app',
    );

    return next;
  },

  async getKidCount(): Promise<number> {
    await initDatabase();
    const db = await getDb();
    const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM children WHERE deletedAt IS NULL;');
    return row?.count ?? 0;
  },

  async canCreateAnotherKid(): Promise<{ ok: boolean; current: number; max: number }> {
    const current = await repository.getKidCount();
    const rawMax = getMaxKidsAllowed();
    const max = Number.isFinite(rawMax) ? rawMax : Number.MAX_SAFE_INTEGER;
    return { ok: current < rawMax, current, max };
  },

  async addChild(input: NewChildInput): Promise<Child> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    const normalizedName = normalizeWhitespace(input.name);

    const existingChildren = await db.getAllAsync<{ id: string }>('SELECT id FROM children WHERE deletedAt IS NULL;');
    const activeChildIds = existingChildren.map((row) => row.id);
    const hasSampleChildren = activeChildIds.some((id) => SAMPLE_CHILD_IDS.includes(id as (typeof SAMPLE_CHILD_IDS)[number]));
    const hasNonSampleChildren = activeChildIds.some((id) => !SAMPLE_CHILD_IDS.includes(id as (typeof SAMPLE_CHILD_IDS)[number]));
    if (hasSampleChildren && !hasNonSampleChildren) {
      const archiveAt = now - 1;
      const sampleChildPlaceholders = SAMPLE_CHILD_IDS.map(() => '?').join(', ');
      const sampleItemPlaceholders = SAMPLE_ITEM_IDS.map(() => '?').join(', ');
      await db.runAsync(
        `UPDATE children SET deletedAt = ?, updatedAt = ? WHERE id IN (${sampleChildPlaceholders}) AND deletedAt IS NULL;`,
        archiveAt,
        archiveAt,
        ...SAMPLE_CHILD_IDS,
      );
      await db.runAsync(
        `UPDATE child_items SET deletedAt = ?, updatedAt = ? WHERE childId IN (${sampleChildPlaceholders}) AND deletedAt IS NULL;`,
        archiveAt,
        archiveAt,
        ...SAMPLE_CHILD_IDS,
      );
      await db.runAsync(
        `UPDATE outfits SET deletedAt = ?, updatedAt = ? WHERE childId IN (${sampleChildPlaceholders}) AND deletedAt IS NULL;`,
        archiveAt,
        archiveAt,
        ...SAMPLE_CHILD_IDS,
      );
      await db.runAsync(
        `UPDATE storage_locations SET deletedAt = ?, updatedAt = ? WHERE childId IN (${sampleChildPlaceholders}) AND deletedAt IS NULL;`,
        String(archiveAt),
        String(archiveAt),
        ...SAMPLE_CHILD_IDS,
      );
      await db.runAsync(
        `UPDATE items SET deletedAt = ?, updatedAt = ? WHERE id IN (${sampleItemPlaceholders}) AND deletedAt IS NULL;`,
        archiveAt,
        archiveAt,
        ...SAMPLE_ITEM_IDS,
      );
    }

    const kidLimit = await repository.canCreateAnotherKid();
    if (!kidLimit.ok) {
      const error = new Error('KID_LIMIT_REACHED');
      (error as Error & { code?: string }).code = 'KID_LIMIT_REACHED';
      throw error;
    }

    await assertUniqueChildName(db, normalizedName);

    const child: Child = {
      id: makeId(),
      name: normalizedName,
      photoUri: normalizeUrl(input.photoUri) || undefined,
      notes: trimOrNull(input.notes) ?? undefined,
      usesMixedSizes: Boolean(input.usesMixedSizes),
      currentSizeCodes: normalizeStringArray(input.currentSizeCodes),
      hiddenClosetCategories: normalizeStringArray(input.hiddenClosetCategories),
      apparelSizeCurrent: trimOrNull(input.apparelSizeCurrent) ?? undefined,
      apparelSizeNext: trimOrNull(input.apparelSizeNext) ?? undefined,
      shoeSizeCurrent: trimOrNull(input.shoeSizeCurrent) ?? undefined,
      shoeSizeNext: trimOrNull(input.shoeSizeNext) ?? undefined,
      shoeSizeSystem: input.shoeSizeSystem ?? 'US_SHOE',
      currentSize: {
        code: input.currentSizeCode ?? null,
        otherText: trimOrNull(input.currentSizeOther),
      },
      nextSize: {
        code: input.nextSizeCode ?? null,
        otherText: trimOrNull(input.nextSizeOther),
      },
      createdAt: now,
      updatedAt: now,
    };

    await db.runAsync(
      'INSERT INTO children (id, name, photoUri, notes, hiddenClosetCategories, usesMixedSizes, currentSizeCodes, apparelSizeCurrent, apparelSizeNext, shoeSizeCurrent, shoeSizeNext, shoeSizeSystem, currentSizeCode, currentSizeOther, nextSizeCode, nextSizeOther, createdAt, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      child.id,
      child.name,
      child.photoUri ?? null,
      child.notes ?? null,
      JSON.stringify(child.hiddenClosetCategories),
      child.usesMixedSizes ? 1 : 0,
      JSON.stringify(child.currentSizeCodes ?? []),
      child.apparelSizeCurrent ?? null,
      child.apparelSizeNext ?? null,
      child.shoeSizeCurrent ?? null,
      child.shoeSizeNext ?? null,
      child.shoeSizeSystem ?? 'US_SHOE',
      child.currentSize.code ?? null,
      child.currentSize.otherText ?? null,
      child.nextSize.code ?? null,
      child.nextSize.otherText ?? null,
      child.createdAt,
      child.updatedAt,
      null,
    );

    return child;
  },

  async updateChild(id: ID, patch: Partial<NewChildInput>): Promise<Child | undefined> {
    await initDatabase();
    const db = await getDb();
    const row = await db.getFirstAsync<ChildRow>('SELECT * FROM children WHERE id = ? AND deletedAt IS NULL;', id);
    if (!row) return undefined;

    const now = Date.now();
    const updatedName = patch.name !== undefined ? normalizeWhitespace(patch.name) : row.name;
    await assertUniqueChildName(db, updatedName, id);
    const updated: Child = {
      id: row.id,
      name: updatedName,
      photoUri: patch.photoUri !== undefined ? normalizeUrl(patch.photoUri) || undefined : row.photoUri ?? undefined,
      notes: patch.notes !== undefined ? trimOrNull(patch.notes) ?? undefined : row.notes ?? undefined,
      usesMixedSizes: patch.usesMixedSizes !== undefined ? Boolean(patch.usesMixedSizes) : Boolean(row.usesMixedSizes ?? 0),
      currentSizeCodes: patch.currentSizeCodes !== undefined ? normalizeStringArray(patch.currentSizeCodes) : parseStringList(row.currentSizeCodes),
      hiddenClosetCategories:
        patch.hiddenClosetCategories !== undefined
          ? normalizeStringArray(patch.hiddenClosetCategories)
          : parseStringList(row.hiddenClosetCategories),
      apparelSizeCurrent: patch.apparelSizeCurrent !== undefined ? trimOrNull(patch.apparelSizeCurrent) ?? undefined : row.apparelSizeCurrent ?? undefined,
      apparelSizeNext: patch.apparelSizeNext !== undefined ? trimOrNull(patch.apparelSizeNext) ?? undefined : row.apparelSizeNext ?? undefined,
      shoeSizeCurrent: patch.shoeSizeCurrent !== undefined ? trimOrNull(patch.shoeSizeCurrent) ?? undefined : row.shoeSizeCurrent ?? undefined,
      shoeSizeNext: patch.shoeSizeNext !== undefined ? trimOrNull(patch.shoeSizeNext) ?? undefined : row.shoeSizeNext ?? undefined,
      shoeSizeSystem: patch.shoeSizeSystem !== undefined ? (patch.shoeSizeSystem ?? 'US_SHOE') : ((row.shoeSizeSystem as Child['shoeSizeSystem']) ?? 'US_SHOE'),
      currentSize: {
        code: patch.currentSizeCode !== undefined ? patch.currentSizeCode ?? null : row.currentSizeCode ?? null,
        otherText: patch.currentSizeOther !== undefined ? trimOrNull(patch.currentSizeOther) : row.currentSizeOther ?? null,
      },
      nextSize: {
        code: patch.nextSizeCode !== undefined ? patch.nextSizeCode ?? null : row.nextSizeCode ?? null,
        otherText: patch.nextSizeOther !== undefined ? trimOrNull(patch.nextSizeOther) : row.nextSizeOther ?? null,
      },
      createdAt: row.createdAt,
      updatedAt: now,
    };

    await db.runAsync(
      'UPDATE children SET name = ?, photoUri = ?, notes = ?, hiddenClosetCategories = ?, usesMixedSizes = ?, currentSizeCodes = ?, apparelSizeCurrent = ?, apparelSizeNext = ?, shoeSizeCurrent = ?, shoeSizeNext = ?, shoeSizeSystem = ?, currentSizeCode = ?, currentSizeOther = ?, nextSizeCode = ?, nextSizeOther = ?, updatedAt = ? WHERE id = ?;',
      updated.name,
      updated.photoUri ?? null,
      updated.notes ?? null,
      JSON.stringify(updated.hiddenClosetCategories),
      updated.usesMixedSizes ? 1 : 0,
      JSON.stringify(updated.currentSizeCodes ?? []),
      updated.apparelSizeCurrent ?? null,
      updated.apparelSizeNext ?? null,
      updated.shoeSizeCurrent ?? null,
      updated.shoeSizeNext ?? null,
      updated.shoeSizeSystem ?? 'US_SHOE',
      updated.currentSize.code ?? null,
      updated.currentSize.otherText ?? null,
      updated.nextSize.code ?? null,
      updated.nextSize.otherText ?? null,
      now,
      id,
    );
    return updated;
  },

  async deleteChild(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    await db.runAsync('UPDATE children SET deletedAt = ?, updatedAt = ? WHERE id = ?;', now, now, id);
    await db.runAsync('UPDATE child_items SET deletedAt = ?, updatedAt = ? WHERE childId = ?;', now, now, id);
    await db.runAsync('UPDATE storage_locations SET deletedAt = ?, updatedAt = ? WHERE childId = ?;', String(now), String(now), id);
    await db.runAsync('UPDATE outfits SET deletedAt = ?, updatedAt = ? WHERE childId = ?;', now, now, id);
  },

  async getItemById(id: ID): Promise<Item | undefined> {
    const all = await repository.getAll();
    return all.items.find((item) => item.id === id);
  },

  async listRecentItems(input: ListRecentItemsInput = {}): Promise<Item[]> {
    const { childId, limit = 8, sinceHours = 24, status } = input;
    const all = await repository.getAll();
    const since = Date.now() - Math.max(1, sinceHours) * 60 * 60 * 1000;
    return all.items
      .filter((item) => item.createdAt >= since)
      .filter((item) => (childId ? item.childIds.includes(childId) : true))
      .filter((item) => (status ? item.status === status : true))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.max(1, limit));
  },

  async addItem(input: NewItemInput): Promise<Item> {
    try {
      await initDatabase();
      const db = await getDb();
      const now = Date.now();
      validateNewItemInput({
        title: input.title,
        clothingType: input.clothingType,
        status: input.status,
        category: input.category,
        size: input.size,
        quantity: input.quantity,
      });
      const aliases = await getActivePrintAliases();
      const normalizedImageUrls = normalizeImageUrls(input.imageUrl, input.imageUrls);
      const normalizedBrandTags = Array.from(new Set([...(input.brandTags ?? []), input.brand ?? ''].map(normalizeBrandName).filter(Boolean)));
      const normalizedInputUrl = normalizeUrl(input.url);
      const normalizedCanonicalUrl = normalizeUrl(input.canonicalUrl);
      const sizing = deriveItemSizingFields(input);
      const childIds = normalizeChildIds(input.childId, input.childIds);
      const quantity = normalizeQuantity(input.quantity);
      const link = resolveOutboundLink(normalizedInputUrl || '', {
        canonicalUrl: normalizedCanonicalUrl || undefined,
        monetize: false,
      });

      const item: Item = {
      id: makeId(),
      url: normalizedInputUrl || undefined,
      sourceDomain: trimOrNull(input.sourceDomain) ?? link.sourceDomain ?? undefined,
      canonicalUrl: normalizedCanonicalUrl || link.canonicalUrl || undefined,
      outboundUrl: normalizeUrl(input.outboundUrl) || link.outboundUrl || undefined,
      clickCount: input.clickCount ?? 0,
      quantity,
      brand: trimOrNull(input.brand) ?? undefined,
      styleName: trimOrNull(input.styleName) ?? undefined,
      printName: trimOrNull(input.printName) ?? undefined,
      printNameNorm: trimOrNull(input.printNameNorm) ?? (resolvePrintName(trimOrNull(input.printName) ?? '', aliases) || normalizePrintKey(input.printName) || undefined),
      brandTags: normalizedBrandTags,
      title: normalizeWhitespace(input.title),
      imageUrl: normalizedImageUrls[0],
      imageUrls: normalizedImageUrls,
      cachedImageUri: normalizeUrl(input.cachedImageUri) || undefined,
      clothingType: input.clothingType,
      size: sizing.legacySize,
      status: (['wishlist', 'owned', 'for-sale', 'sold'] as const).includes(input.status as any) ? input.status : 'owned',
      notes: trimOrNull(input.notes) ?? undefined,
      purchasePrice: input.purchasePrice,
      targetResalePrice: input.targetResalePrice,
      soldPrice: input.soldPrice,
      soldDate: trimOrNull(input.soldDate) ?? undefined,
      listedAt: trimOrNull(input.listedAt) ?? undefined,
      bundleId: trimOrNull(input.bundleId) ?? undefined,
      createdAt: now,
      updatedAt: now,
      sizeNormalized: sizing.sizeNormalized,
      sizeType: sizing.sizeType,
      sizeSystem: sizing.sizeSystem,
      sizeScheme: sizing.sizeScheme,
      sizeRaw: sizing.sizeRaw,
      category: input.category,
      brandFit: input.brandFit,
      kidFit: input.kidFit,
      brandSizeNote: trimOrNull(input.brandSizeNote) ?? undefined,
      fabric: trimOrNull(input.fabric) ?? undefined,
      fitRating: input.fitRating,
      fitException: input.fitException,
      condition: input.condition,
      bstSelectedPhotoUri: trimOrNull(input.bstSelectedPhotoUri) ?? undefined,
      bstCondition: input.bstCondition,
      bstConditionNotes: trimOrNull(input.bstConditionNotes) ?? undefined,
      bstFlawTags: normalizeStringArray(input.bstFlawTags) as Item['bstFlawTags'],
      bstFlawNotes: trimOrNull(input.bstFlawNotes) ?? undefined,
      bstWashNotes: trimOrNull(input.bstWashNotes) ?? undefined,
      bstDryingMethod: input.bstDryingMethod,
      bstSmokeNote: input.bstSmokeNote,
      bstPetTypes: normalizePetTypes(input.bstPetTypes) as Item['bstPetTypes'],
      bstPetNote: trimOrNull(input.bstPetNote) ?? undefined,
      bstOffersAccepted: input.bstOffersAccepted,
      bstBundleOffersAccepted: input.bstBundleOffersAccepted,
      seasonTags: normalizeStringArray(input.seasonTags),
      lastWornAt: input.lastWornAt,
      wornCount: input.wornCount ?? 0,
      fitBin: sizing.fitBin,
      fitBinTouched: sizing.fitBinTouched,
      tags: normalizeStringArray(input.tags),
      childIds,
    };

    const itemInsertColumns = [
      'id', 'childId', 'url', 'sourceDomain', 'canonicalUrl', 'outboundUrl', 'clickCount', 'quantity', 'brand', 'styleName', 'printName', 'printNameNorm', 'title', 'imageUrl', 'imageUrls', 'cachedImageUri', 'clothingType', 'size', 'status', 'tags', 'notes', 'createdAt', 'updatedAt', 'deletedAt',
      'purchasePrice', 'targetResalePrice', 'soldPrice', 'soldDate', 'listedAt', 'bundleId', 'sizeNormalized', 'sizeType', 'sizeSystem', 'sizeScheme', 'sizeRaw', 'category', 'brandFit', 'kidFit', 'brandSizeNote', 'fabric', 'fitRating', 'fitException', 'condition', 'bstSelectedPhotoUri', 'bstCondition', 'bstConditionNotes', 'bstFlawTagsJson', 'bstFlawNotes', 'bstWashNotes', 'bstDryingMethod', 'bstSmokeNote', 'bstPetType', 'bstPetNote', 'bstOffersAccepted', 'bstBundleOffersAccepted', 'seasonTags', 'lastWornAt', 'wornCount', 'fitBin', 'fitBinTouched',
    ] as const;
    const itemInsertValues: Array<string | number | null> = [
      item.id,
      childIds[0] ?? null,
      item.url ?? null,
      item.sourceDomain ?? null,
      item.canonicalUrl ?? null,
      item.outboundUrl ?? null,
      item.clickCount,
      item.quantity,
      item.brand ?? null,
      item.styleName ?? null,
      item.printName ?? null,
      item.printNameNorm ?? null,
      item.title,
      item.imageUrl ?? null,
      JSON.stringify(item.imageUrls),
      item.cachedImageUri ?? null,
      item.clothingType,
      item.size,
      item.status,
      JSON.stringify(item.tags),
      item.notes ?? null,
      item.createdAt,
      item.updatedAt,
      null,
      item.purchasePrice ?? null,
      item.targetResalePrice ?? null,
      item.soldPrice ?? null,
      item.soldDate ?? null,
      item.listedAt ?? null,
      item.bundleId ?? null,
      item.sizeNormalized ?? null,
      item.sizeType ?? null,
      item.sizeSystem ?? null,
      item.sizeScheme ?? null,
      item.sizeRaw ?? null,
      item.category ?? null,
      item.brandFit ?? null,
      item.kidFit ?? null,
      item.brandSizeNote ?? null,
      item.fabric ?? null,
      item.fitRating ?? null,
      item.fitException ?? null,
      item.condition ?? null,
      item.bstSelectedPhotoUri ?? null,
      item.bstCondition ?? null,
      item.bstConditionNotes ?? null,
      JSON.stringify(item.bstFlawTags),
      item.bstFlawNotes ?? null,
      item.bstWashNotes ?? null,
      item.bstDryingMethod ?? null,
      item.bstSmokeNote ?? null,
      item.bstPetTypes ? JSON.stringify(item.bstPetTypes) : null,
      item.bstPetNote ?? null,
      toNullableBooleanDbValue(item.bstOffersAccepted),
      toNullableBooleanDbValue(item.bstBundleOffersAccepted),
      JSON.stringify(item.seasonTags),
      item.lastWornAt ?? null,
      item.wornCount,
      item.fitBin ?? 'unsure',
      item.fitBinTouched ? 1 : 0,
    ];
      await runInTransaction(db, async () => {
        await db.runAsync(
          `INSERT INTO items (${itemInsertColumns.join(', ')}) VALUES (${itemInsertValues.map(() => '?').join(', ')});`,
          ...itemInsertValues,
        );

        await replaceItemTags(item.id, item.tags);
        await replaceItemBrands(item.id, item.brandTags);

        if (childIds.length > 0) {
          await syncChildItemsForItem({
            itemId: item.id,
            childIds,
            storageLocationId: input.storageLocationId,
            sizeAtTime: input.sizeAtTime ?? item.size,
            statusForChild: input.statusForChild ?? item.status,
            notesForChild: input.notesForChild,
          });
        }
      });

      try {
        const firstSaveRow = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM events WHERE type = ?;', 'first_save');
        if ((firstSaveRow?.count ?? 0) === 0) {
          await repository.logEvent({
            type: 'first_save',
            payload: { itemId: item.id, childId: childIds[0] ?? null, quick: false },
          });
        }
      } catch (eventError) {
        if (__DEV__) console.warn('[repository.addItem] first_save event log failed', eventError);
      }

      return item;
    } catch (error) {
      if (__DEV__) console.error('[repository.addItem] failed', {
        childId: input.childId ?? input.childIds?.[0] ?? null,
        status: input.status,
        clothingType: input.clothingType,
      }, error);
      throw error;
    }
  },

  async updateItem(id: ID, patch: Partial<NewItemInput>): Promise<Item | undefined> {
    try {
      const existing = await repository.getItemById(id);
      if (!existing) return undefined;
      validateNewItemInput({
        title: patch.title ?? existing.title,
        clothingType: patch.clothingType ?? existing.clothingType,
        status: patch.status ?? existing.status,
        category: patch.category ?? existing.category,
        size: patch.size ?? existing.size,
        quantity: patch.quantity ?? existing.quantity,
      });

      await initDatabase();
      const db = await getDb();
      const now = Date.now();
      const aliases = await getActivePrintAliases();
      const nextChildIds = patch.childId !== undefined || patch.childIds !== undefined
        ? normalizeChildIds(patch.childId, patch.childIds ?? existing.childIds)
        : existing.childIds;
      const nextUrl = patch.url !== undefined ? normalizeUrl(patch.url) : existing.url ?? '';
      const sizing = deriveItemSizingFields({
        clothingType: patch.clothingType ?? existing.clothingType,
        category: patch.category ?? existing.category,
        size: patch.size ?? existing.size,
        sizeRaw: patch.sizeRaw ?? existing.sizeRaw ?? existing.size,
        sizeNormalized: patch.sizeNormalized ?? existing.sizeNormalized,
        sizeType: patch.sizeType ?? existing.sizeType,
        sizeSystem: patch.sizeSystem ?? existing.sizeSystem,
        sizeScheme: patch.sizeScheme ?? existing.sizeScheme,
        fitBin: patch.fitBin ?? existing.fitBin,
        fitBinTouched: patch.fitBinTouched ?? existing.fitBinTouched,
      });
      const link = resolveOutboundLink(nextUrl, {
        canonicalUrl: normalizeUrl(patch.canonicalUrl ?? existing.canonicalUrl ?? '') || undefined,
        monetize: false,
      });
      const touchesImageFields = patch.imageUrl !== undefined || patch.imageUrls !== undefined || patch.cachedImageUri !== undefined;
      const normalizedPatchImageUrl = patch.imageUrl !== undefined ? normalizeUrl(patch.imageUrl) || undefined : undefined;
      const normalizedPatchImageUrls = patch.imageUrls !== undefined
        ? normalizeImageUrls(normalizedPatchImageUrl, patch.imageUrls)
        : undefined;
      const normalizedPatchCachedImageUri = patch.cachedImageUri !== undefined ? normalizeUrl(patch.cachedImageUri) || undefined : undefined;
      const hasIncomingImageReplacement = Boolean(
        normalizedPatchCachedImageUri || normalizedPatchImageUrl || (normalizedPatchImageUrls?.length ?? 0) > 0,
      );
      const shouldClearCachedForReplacement = hasIncomingImageReplacement
        && !normalizedPatchCachedImageUri
        && Boolean(normalizedPatchImageUrl || (normalizedPatchImageUrls?.length ?? 0) > 0);

    const nextBrand = patch.brand !== undefined ? trimOrNull(patch.brand) ?? undefined : existing.brand;
    const nextBrandTags =
      patch.brandTags !== undefined || patch.brand !== undefined
        ? Array.from(new Set([...(patch.brandTags ?? existing.brandTags), nextBrand ?? ''].map(normalizeBrandName).filter(Boolean)))
        : existing.brandTags;

    const updated: Item = {
      ...existing,
      url: nextUrl || undefined,
      sourceDomain: patch.sourceDomain !== undefined ? trimOrNull(patch.sourceDomain) ?? undefined : link.sourceDomain || existing.sourceDomain,
      canonicalUrl: patch.canonicalUrl !== undefined ? normalizeUrl(patch.canonicalUrl) || undefined : link.canonicalUrl || existing.canonicalUrl,
      outboundUrl: patch.outboundUrl !== undefined ? normalizeUrl(patch.outboundUrl) || undefined : link.outboundUrl || existing.outboundUrl,
      clickCount: patch.clickCount ?? existing.clickCount,
      quantity: patch.quantity !== undefined ? normalizeQuantity(patch.quantity) : existing.quantity,
      brand: nextBrand,
      styleName: patch.styleName !== undefined ? trimOrNull(patch.styleName) ?? undefined : existing.styleName,
      printName: patch.printName !== undefined ? trimOrNull(patch.printName) ?? undefined : existing.printName,
      printNameNorm:
        patch.printNameNorm !== undefined
          ? trimOrNull(patch.printNameNorm) ?? undefined
          : patch.printName !== undefined
            ? resolvePrintName(trimOrNull(patch.printName) ?? '', aliases) || normalizePrintKey(patch.printName) || undefined
            : existing.printNameNorm,
      brandTags: nextBrandTags,
      title: patch.title !== undefined ? normalizeWhitespace(patch.title) : existing.title,
      imageUrl:
        touchesImageFields
          ? hasIncomingImageReplacement
            ? normalizedPatchImageUrl ?? normalizedPatchImageUrls?.[0] ?? existing.imageUrl
            : existing.imageUrl
          : existing.imageUrl,
      imageUrls:
        touchesImageFields
          ? hasIncomingImageReplacement
            ? normalizeImageUrls(normalizedPatchImageUrl ?? existing.imageUrl, normalizedPatchImageUrls ?? existing.imageUrls)
            : existing.imageUrls
          : existing.imageUrls,
      cachedImageUri:
        touchesImageFields
          ? hasIncomingImageReplacement
            ? normalizedPatchCachedImageUri ?? (shouldClearCachedForReplacement ? undefined : existing.cachedImageUri)
            : existing.cachedImageUri
          : existing.cachedImageUri,
      clothingType: patch.clothingType ?? existing.clothingType,
      size: sizing.legacySize || existing.size,
      status: (patch.status && (['wishlist', 'owned', 'for-sale', 'sold'] as const).includes(patch.status as any) ? patch.status : undefined) ?? existing.status,
      notes: patch.notes !== undefined ? trimOrNull(patch.notes) ?? undefined : existing.notes,
      purchasePrice: patch.purchasePrice !== undefined ? patch.purchasePrice : existing.purchasePrice,
      targetResalePrice: patch.targetResalePrice !== undefined ? patch.targetResalePrice : existing.targetResalePrice,
      soldPrice: patch.soldPrice !== undefined ? patch.soldPrice : existing.soldPrice,
      soldDate: patch.soldDate !== undefined ? trimOrNull(patch.soldDate) ?? undefined : existing.soldDate,
      listedAt: patch.listedAt !== undefined ? trimOrNull(patch.listedAt) ?? undefined : existing.listedAt,
      bundleId: patch.bundleId !== undefined ? trimOrNull(patch.bundleId) ?? undefined : existing.bundleId,
      updatedAt: now,
      sizeNormalized: sizing.sizeNormalized,
      sizeType: sizing.sizeType,
      sizeSystem: sizing.sizeSystem,
      sizeScheme: sizing.sizeScheme,
      sizeRaw: sizing.sizeRaw,
      category: patch.category ?? existing.category,
      brandFit: patch.brandFit ?? existing.brandFit,
      kidFit: patch.kidFit ?? existing.kidFit,
      brandSizeNote: patch.brandSizeNote !== undefined ? trimOrNull(patch.brandSizeNote) ?? undefined : existing.brandSizeNote,
      fabric: patch.fabric !== undefined ? trimOrNull(patch.fabric) ?? undefined : existing.fabric,
      fitRating: patch.fitRating ?? existing.fitRating,
      fitException: patch.fitException ?? existing.fitException,
      condition: patch.condition ?? existing.condition,
      bstSelectedPhotoUri: patch.bstSelectedPhotoUri !== undefined ? trimOrNull(patch.bstSelectedPhotoUri) ?? undefined : existing.bstSelectedPhotoUri,
      bstCondition: patch.bstCondition ?? existing.bstCondition,
      bstConditionNotes: patch.bstConditionNotes !== undefined ? trimOrNull(patch.bstConditionNotes) ?? undefined : existing.bstConditionNotes,
      bstFlawTags: patch.bstFlawTags !== undefined ? normalizeStringArray(patch.bstFlawTags) as Item['bstFlawTags'] : existing.bstFlawTags,
      bstFlawNotes: patch.bstFlawNotes !== undefined ? trimOrNull(patch.bstFlawNotes) ?? undefined : existing.bstFlawNotes,
      bstWashNotes: patch.bstWashNotes !== undefined ? trimOrNull(patch.bstWashNotes) ?? undefined : existing.bstWashNotes,
      bstDryingMethod: patch.bstDryingMethod ?? existing.bstDryingMethod,
      bstSmokeNote: patch.bstSmokeNote ?? existing.bstSmokeNote,
      bstPetTypes: patch.bstPetTypes !== undefined ? normalizePetTypes(patch.bstPetTypes) as Item['bstPetTypes'] : existing.bstPetTypes,
      bstPetNote: patch.bstPetNote !== undefined ? trimOrNull(patch.bstPetNote) ?? undefined : existing.bstPetNote,
      bstOffersAccepted: patch.bstOffersAccepted !== undefined ? patch.bstOffersAccepted : existing.bstOffersAccepted,
      bstBundleOffersAccepted: patch.bstBundleOffersAccepted !== undefined ? patch.bstBundleOffersAccepted : existing.bstBundleOffersAccepted,
      seasonTags: patch.seasonTags !== undefined ? normalizeStringArray(patch.seasonTags) : existing.seasonTags,
      lastWornAt: patch.lastWornAt ?? existing.lastWornAt,
      wornCount: patch.wornCount ?? existing.wornCount,
      fitBin: sizing.fitBin,
      fitBinTouched: sizing.fitBinTouched,
      tags: patch.tags !== undefined ? normalizeStringArray(patch.tags) : existing.tags,
      childIds: nextChildIds,
    };

      await runInTransaction(db, async () => {
      await db.runAsync(
          `UPDATE items SET
        childId = ?,
        url = ?,
        sourceDomain = ?,
        canonicalUrl = ?,
        outboundUrl = ?,
        clickCount = ?,
        quantity = ?,
        brand = ?,
        styleName = ?,
        printName = ?,
        printNameNorm = ?,
        title = ?,
        imageUrl = ?,
        imageUrls = ?,
        cachedImageUri = ?,
        clothingType = ?,
        size = ?,
        status = ?,
        tags = ?,
        notes = ?,
        purchasePrice = ?,
        targetResalePrice = ?,
        soldPrice = ?,
        soldDate = ?,
        listedAt = ?,
        bundleId = ?,
        updatedAt = ?,
        sizeNormalized = ?,
        sizeType = ?,
        sizeSystem = ?,
        sizeScheme = ?,
        sizeRaw = ?,
        category = ?,
        brandFit = ?,
        kidFit = ?,
        brandSizeNote = ?,
        fabric = ?,
        fitRating = ?,
        fitException = ?,
        condition = ?,
        bstSelectedPhotoUri = ?,
        bstCondition = ?,
        bstConditionNotes = ?,
        bstFlawTagsJson = ?,
        bstFlawNotes = ?,
        bstWashNotes = ?,
        bstDryingMethod = ?,
        bstSmokeNote = ?,
        bstPetType = ?,
        bstPetNote = ?,
        bstOffersAccepted = ?,
        bstBundleOffersAccepted = ?,
        seasonTags = ?,
        lastWornAt = ?,
        wornCount = ?,
        fitBin = ?,
        fitBinTouched = ?
      WHERE id = ?;`,
      updated.childIds[0] ?? null,
      updated.url ?? null,
      updated.sourceDomain ?? null,
      updated.canonicalUrl ?? null,
      updated.outboundUrl ?? null,
      updated.clickCount,
      updated.quantity,
      updated.brand ?? null,
      updated.styleName ?? null,
      updated.printName ?? null,
      updated.printNameNorm ?? null,
      updated.title,
      updated.imageUrl ?? null,
      JSON.stringify(updated.imageUrls),
      updated.cachedImageUri ?? null,
      updated.clothingType,
      updated.size,
      updated.status,
      JSON.stringify(updated.tags),
      updated.notes ?? null,
      updated.purchasePrice ?? null,
      updated.targetResalePrice ?? null,
      updated.soldPrice ?? null,
      updated.soldDate ?? null,
      updated.listedAt ?? null,
      updated.bundleId ?? null,
      updated.updatedAt,
      updated.sizeNormalized ?? null,
      updated.sizeType ?? null,
      updated.sizeSystem ?? null,
      updated.sizeScheme ?? null,
      updated.sizeRaw ?? null,
      updated.category ?? null,
      updated.brandFit ?? null,
      updated.kidFit ?? null,
      updated.brandSizeNote ?? null,
      updated.fabric ?? null,
      updated.fitRating ?? null,
      updated.fitException ?? null,
      updated.condition ?? null,
      updated.bstSelectedPhotoUri ?? null,
      updated.bstCondition ?? null,
      updated.bstConditionNotes ?? null,
      JSON.stringify(updated.bstFlawTags),
      updated.bstFlawNotes ?? null,
      updated.bstWashNotes ?? null,
      updated.bstDryingMethod ?? null,
      updated.bstSmokeNote ?? null,
      updated.bstPetTypes ? JSON.stringify(updated.bstPetTypes) : null,
      updated.bstPetNote ?? null,
      toNullableBooleanDbValue(updated.bstOffersAccepted),
      toNullableBooleanDbValue(updated.bstBundleOffersAccepted),
      JSON.stringify(updated.seasonTags),
      updated.lastWornAt ?? null,
      updated.wornCount,
      updated.fitBin ?? 'unsure',
      updated.fitBinTouched ? 1 : 0,
          id,
        );

        await replaceItemTags(id, updated.tags);
        await replaceItemBrands(id, updated.brandTags);

        await syncChildItemsForItem({
          itemId: id,
          childIds: updated.childIds,
          storageLocationId: patch.storageLocationId,
          sizeAtTime: patch.sizeAtTime ?? updated.size,
          statusForChild: patch.statusForChild ?? updated.status,
          notesForChild: patch.notesForChild,
        });
      });

      return updated;
    } catch (error) {
      if (__DEV__) console.error('[repository.updateItem] failed', { id, patchKeys: Object.keys(patch) }, error);
      throw error;
    }
  },

  async addItemsBatch(input: BatchAddInput): Promise<Item[]> {
    const item = await repository.addItem({
      ...input,
      quantity: normalizeQuantity(input.quantity),
    });
    return [item];
  },

  async markItemsWorn(itemIds: ID[], timestamp = Date.now()): Promise<void> {
    if (itemIds.length === 0) return;

    await initDatabase();
    const db = await getDb();
    await Promise.all(
      itemIds.map((itemId) =>
        db.runAsync(
          'UPDATE items SET lastWornAt = ?, wornCount = COALESCE(wornCount, 0) + 1, updatedAt = ? WHERE id = ?;',
          timestamp,
          Date.now(),
          itemId,
        ),
      ),
    );
  },

  async updateItemCachedImage(id: ID, cachedImageUri: string): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    await db.runAsync('UPDATE items SET cachedImageUri = ?, updatedAt = ? WHERE id = ?;', cachedImageUri, now, id);
  },

  async trackOutboundClick(id: ID, outboundUrl: string): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    await db.runAsync(
      'UPDATE items SET clickCount = COALESCE(clickCount, 0) + 1, outboundUrl = ?, updatedAt = ? WHERE id = ?;',
      outboundUrl,
      now,
      id,
    );
  },

  async bulkUpdateItems(itemIds: ID[], patch: BulkItemPatchInput): Promise<void> {
    if (itemIds.length === 0) return;

    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    for (const itemId of itemIds) {
      const existing = await repository.getItemById(itemId);
      if (!existing) continue;

      const tags = patch.appendTag
        ? Array.from(new Set([...existing.tags, normalizeTagName(patch.appendTag)]))
        : existing.tags;
      const status = patch.status ?? existing.status;
      await db.runAsync('UPDATE items SET status = ?, tags = ?, updatedAt = ? WHERE id = ?;', status, JSON.stringify(tags), now, itemId);
      await replaceItemTags(itemId, tags);
    }
  },

  async bulkAssignChild(itemIds: ID[], childId: ID): Promise<void> {
    if (itemIds.length === 0) return;
    await initDatabase();
    const db = await getDb();
    const now = Date.now();

    for (const itemId of itemIds) {
      const item = await repository.getItemById(itemId);
      if (!item) continue;
      const nextChildIds = Array.from(new Set([...item.childIds, childId]));
      await syncChildItemsForItem({
        itemId,
        childIds: nextChildIds,
        sizeAtTime: item.size,
        statusForChild: item.status,
      });
      await db.runAsync('UPDATE items SET childId = ?, updatedAt = ? WHERE id = ?;', nextChildIds[0] ?? null, now, itemId);
    }
  },

  async archiveItems(itemIds: ID[]): Promise<void> {
    if (itemIds.length === 0) return;
    await Promise.all(itemIds.map((itemId) => repository.deleteItem(itemId)));
  },

  async restoreItems(itemIds: ID[]): Promise<void> {
    if (itemIds.length === 0) return;
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    const placeholders = itemIds.map(() => '?').join(', ');
    await db.runAsync(
      `UPDATE items SET deletedAt = NULL, updatedAt = ? WHERE id IN (${placeholders});`,
      now,
      ...itemIds,
    );
    await db.runAsync(
      `UPDATE child_items SET deletedAt = NULL, updatedAt = ? WHERE itemId IN (${placeholders});`,
      now,
      ...itemIds,
    );
  },

  async deleteItem(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();

    await db.runAsync('UPDATE items SET deletedAt = ?, updatedAt = ? WHERE id = ?;', now, now, id);
    await db.runAsync('UPDATE child_items SET deletedAt = ?, updatedAt = ? WHERE itemId = ?;', now, now, id);

    const outfitRows = await db.getAllAsync<OutfitRow>('SELECT * FROM outfits WHERE deletedAt IS NULL;');
    await Promise.all(
      outfitRows.map(async (row) => {
        const existingItemIds = parseStringList(row.itemIds);
        const nextItemIds = existingItemIds.filter((entry) => entry !== id);
        if (nextItemIds.length === existingItemIds.length) return;
        await db.runAsync('UPDATE outfits SET itemIds = ?, updatedAt = ? WHERE id = ?;', JSON.stringify(nextItemIds), now, row.id);
      }),
    );
  },

  async addOutfit(input: NewOutfitInput): Promise<Outfit> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    const outfit: Outfit = {
      id: makeId(),
      childId: input.childId,
      name: input.name.trim(),
      itemIds: input.itemIds,
      notes: input.notes?.trim() || undefined,
      previewUri: input.previewUri?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      occasionTags: input.occasionTags ?? [],
      weatherHint: input.weatherHint?.trim() || undefined,
    };

    await db.runAsync(
      `INSERT INTO outfits (id, childId, name, itemIds, notes, previewUri, createdAt, updatedAt, deletedAt, occasionTags, weatherHint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      outfit.id,
      outfit.childId,
      outfit.name,
      JSON.stringify(outfit.itemIds),
      outfit.notes ?? null,
      outfit.previewUri ?? null,
      outfit.createdAt,
      outfit.updatedAt,
      null,
      JSON.stringify(outfit.occasionTags),
      outfit.weatherHint ?? null,
    );

    await replaceOutfitTags(outfit.id, outfit.occasionTags);

    return outfit;
  },

  async updateOutfit(id: ID, patch: Partial<NewOutfitInput>): Promise<Outfit | undefined> {
    const all = await repository.getAll();
    const existing = all.outfits.find((outfit) => outfit.id === id);
    if (!existing) return undefined;

    await initDatabase();
    const db = await getDb();

    const updated: Outfit = {
      ...existing,
      childId: patch.childId ?? existing.childId,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      itemIds: patch.itemIds ?? existing.itemIds,
      notes: patch.notes !== undefined ? patch.notes.trim() || undefined : existing.notes,
      previewUri: patch.previewUri !== undefined ? patch.previewUri.trim() || undefined : existing.previewUri,
      updatedAt: Date.now(),
      occasionTags: patch.occasionTags ?? existing.occasionTags,
      weatherHint: patch.weatherHint !== undefined ? patch.weatherHint.trim() || undefined : existing.weatherHint,
    };

    await db.runAsync(
      `UPDATE outfits SET
        childId = ?,
        name = ?,
        itemIds = ?,
        notes = ?,
        previewUri = ?,
        updatedAt = ?,
        occasionTags = ?,
        weatherHint = ?
      WHERE id = ?;`,
      updated.childId,
      updated.name,
      JSON.stringify(updated.itemIds),
      updated.notes ?? null,
      updated.previewUri ?? null,
      updated.updatedAt,
      JSON.stringify(updated.occasionTags),
      updated.weatherHint ?? null,
      id,
    );

    await replaceOutfitTags(id, updated.occasionTags);

    return updated;
  },

  async deleteOutfit(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    await db.runAsync('UPDATE outfits SET deletedAt = ?, updatedAt = ? WHERE id = ?;', now, now, id);
  },

  async saveFilterPreset(input: SaveFilterPresetInput): Promise<FilterPreset> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    const preset: FilterPreset = {
      id: makeId(),
      name: input.name.trim(),
      childId: input.childId,
      status: input.status,
      clothingType: input.clothingType,
      includeUnsorted: Boolean(input.includeUnsorted),
      query: input.query?.trim() || undefined,
      createdAt: now,
    };

    await db.runAsync(
      `INSERT INTO filter_presets (id, name, childId, status, clothingType, includeUnsorted, query, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      preset.id,
      preset.name,
      preset.childId ?? null,
      preset.status ?? null,
      preset.clothingType ?? null,
      preset.includeUnsorted ? 1 : 0,
      preset.query ?? null,
      now,
      now,
      null,
    );
    return preset;
  },

  async deleteFilterPreset(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    await db.runAsync('UPDATE filter_presets SET deletedAt = ?, updatedAt = ? WHERE id = ?;', now, now, id);
  },

  async logEvent(input: EventInput): Promise<ActivityEvent> {
    await initDatabase();
    const db = await getDb();
    const event: ActivityEvent = {
      id: makeId(),
      type: input.type,
      payload: input.payload,
      createdAt: Date.now(),
    };
    await db.runAsync(
      'INSERT INTO events (id, type, payload, createdAt) VALUES (?, ?, ?, ?);',
      event.id,
      event.type,
      event.payload ? JSON.stringify(event.payload) : null,
      event.createdAt,
    );
    return event;
  },

  async getEvents(limit = 200): Promise<ActivityEvent[]> {
    await initDatabase();
    const db = await getDb();
    const rows = await db.getAllAsync<EventRow>('SELECT * FROM events ORDER BY createdAt DESC LIMIT ?;', limit);
    return rows.map(mapEvent);
  },

  async getEventCount(type: string, sinceDate: number): Promise<number> {
    await initDatabase();
    const db = await getDb();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM events WHERE type = ? AND createdAt >= ?;',
      type,
      sinceDate,
    );
    return row?.count ?? 0;
  },

  async clearEvents(): Promise<void> {
    await initDatabase();
    const db = await getDb();
    await db.runAsync('DELETE FROM events;');
  },

  async savePurchaseState(snapshot: PurchaseStateSnapshot): Promise<void> {
    await initDatabase();
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO purchase_state (id, isEntitled, payloadJson, updatedAt)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET isEntitled = excluded.isEntitled, payloadJson = excluded.payloadJson, updatedAt = excluded.updatedAt;`,
      snapshot.isEntitled ? 1 : 0,
      JSON.stringify(snapshot),
      snapshot.updatedAt,
    );
  },

  async getPurchaseState(): Promise<PurchaseStateSnapshot | undefined> {
    await initDatabase();
    const db = await getDb();
    const row = await db.getFirstAsync<PurchaseStateRow>('SELECT * FROM purchase_state WHERE id = 1;');
    return mapPurchaseState(row);
  },

  async exportBackup(): Promise<BackupPayload> {
    const data = await repository.getAll();
    return {
      exportedAt: Date.now(),
      version: 1,
      children: data.children,
      items: data.items,
      childItems: data.childItems,
      storageLocations: data.storageLocations,
      printAliases: data.printAliases,
      purchaseState: data.purchaseState,
      outfits: data.outfits,
      filterPresets: data.filterPresets,
      saleDrafts: data.saleDrafts,
      saleDraftItems: data.saleDraftItems,
      settings: data.settings,
    };
  },

  async importBackup(payload: BackupPayload): Promise<void> {
    await initDatabase();
    const db = await getDb();

    await db.execAsync(`
      DELETE FROM outfit_tags;
      DELETE FROM item_tags;
      DELETE FROM item_brands;
      DELETE FROM tags;
      DELETE FROM brands;
      DELETE FROM print_aliases;
      DELETE FROM child_items;
      DELETE FROM storage_locations;
      DELETE FROM purchase_state;
      DELETE FROM sale_draft_items;
      DELETE FROM sale_drafts;
      DELETE FROM outfits;
      DELETE FROM items;
      DELETE FROM children;
      DELETE FROM filter_presets;
    `);

    for (const child of payload.children) {
      await db.runAsync(
        'INSERT INTO children (id, name, photoUri, notes, hiddenClosetCategories, usesMixedSizes, currentSizeCodes, apparelSizeCurrent, apparelSizeNext, shoeSizeCurrent, shoeSizeNext, shoeSizeSystem, currentSizeCode, currentSizeOther, nextSizeCode, nextSizeOther, createdAt, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
        child.id,
        child.name,
        child.photoUri ?? null,
        child.notes ?? null,
        JSON.stringify(child.hiddenClosetCategories ?? []),
        child.usesMixedSizes ? 1 : 0,
        JSON.stringify(child.currentSizeCodes ?? []),
        child.apparelSizeCurrent ?? null,
        child.apparelSizeNext ?? null,
        child.shoeSizeCurrent ?? null,
        child.shoeSizeNext ?? null,
        child.shoeSizeSystem ?? 'US_SHOE',
        child.currentSize?.code ?? null,
        child.currentSize?.otherText ?? null,
        child.nextSize?.code ?? null,
        child.nextSize?.otherText ?? null,
        child.createdAt,
        child.updatedAt,
        child.deletedAt ?? null,
      );
    }

    for (const item of payload.items) {
      const sizing = deriveItemSizingFields({
        clothingType: item.clothingType,
        category: item.category,
        size: item.size,
        sizeRaw: item.sizeRaw ?? item.size,
        sizeNormalized: item.sizeNormalized,
        sizeType: item.sizeType,
        sizeSystem: item.sizeSystem,
        sizeScheme: item.sizeScheme,
        fitBin: item.fitBin,
        fitBinTouched: item.fitBinTouched,
      });
      const importItemColumns = [
        'id', 'childId', 'url', 'sourceDomain', 'canonicalUrl', 'outboundUrl', 'clickCount', 'quantity', 'brand', 'styleName', 'printName', 'printNameNorm', 'title', 'imageUrl', 'imageUrls', 'cachedImageUri', 'clothingType', 'size', 'status', 'tags', 'notes', 'createdAt', 'updatedAt', 'deletedAt',
        'purchasePrice', 'targetResalePrice', 'soldPrice', 'soldDate', 'listedAt', 'bundleId', 'sizeNormalized', 'sizeType', 'sizeSystem', 'sizeScheme', 'sizeRaw', 'category', 'brandFit', 'kidFit', 'brandSizeNote', 'fabric', 'fitRating', 'fitException', 'condition', 'bstSelectedPhotoUri', 'bstCondition', 'bstConditionNotes', 'bstFlawTagsJson', 'bstFlawNotes', 'bstWashNotes', 'bstDryingMethod', 'bstSmokeNote', 'bstPetType', 'bstPetNote', 'bstOffersAccepted', 'bstBundleOffersAccepted', 'seasonTags', 'lastWornAt', 'wornCount', 'fitBin', 'fitBinTouched',
      ] as const;
      const importItemValues: Array<string | number | null> = [
        item.id,
        item.childIds[0] ?? null,
        item.url ?? null,
        item.sourceDomain ?? null,
        item.canonicalUrl ?? null,
        item.outboundUrl ?? null,
        item.clickCount ?? 0,
        normalizeQuantity(item.quantity),
        item.brand ?? null,
        item.styleName ?? null,
        item.printName ?? null,
        item.printNameNorm ?? null,
        item.title,
        item.imageUrl ?? null,
        JSON.stringify(item.imageUrls),
        item.cachedImageUri ?? null,
        item.clothingType,
        sizing.legacySize || item.size,
        item.status,
        JSON.stringify(item.tags),
        item.notes ?? null,
        item.createdAt,
        item.updatedAt,
        item.deletedAt ?? null,
        item.purchasePrice ?? null,
        item.targetResalePrice ?? null,
        item.soldPrice ?? null,
        item.soldDate ?? null,
        item.listedAt ?? null,
        item.bundleId ?? null,
        sizing.sizeNormalized ?? null,
        sizing.sizeType ?? null,
        sizing.sizeSystem ?? null,
        sizing.sizeScheme ?? null,
        sizing.sizeRaw ?? sizing.legacySize ?? null,
        item.category ?? null,
        item.brandFit ?? null,
        item.kidFit ?? null,
        item.brandSizeNote ?? null,
        item.fabric ?? null,
        item.fitRating ?? null,
        item.fitException ?? null,
        item.condition ?? null,
        item.bstSelectedPhotoUri ?? null,
        item.bstCondition ?? null,
        item.bstConditionNotes ?? null,
        JSON.stringify(item.bstFlawTags ?? []),
        item.bstFlawNotes ?? null,
        item.bstWashNotes ?? null,
        item.bstDryingMethod ?? null,
        item.bstSmokeNote ?? null,
        item.bstPetTypes ? JSON.stringify(item.bstPetTypes) : null,
        item.bstPetNote ?? null,
        toNullableBooleanDbValue(item.bstOffersAccepted),
        toNullableBooleanDbValue(item.bstBundleOffersAccepted),
        JSON.stringify(item.seasonTags),
        item.lastWornAt ?? null,
        item.wornCount ?? 0,
        sizing.fitBin ?? 'unsure',
        sizing.fitBinTouched ? 1 : 0,
      ];
      await db.runAsync(
        `INSERT INTO items (${importItemColumns.join(', ')}) VALUES (${importItemValues.map(() => '?').join(', ')});`,
        ...importItemValues,
      );
      await replaceItemTags(item.id, item.tags);
      await replaceItemBrands(item.id, item.brandTags ?? [item.brand ?? '']);
    }

    for (const link of payload.childItems) {
      await db.runAsync(
        `INSERT INTO child_items (id, childId, itemId, storageLocationId, sizeAtTime, statusForChild, notesForChild, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        link.id,
        link.childId,
        link.itemId,
        link.storageLocationId ?? null,
        link.sizeAtTime ?? null,
        link.statusForChild,
        link.notesForChild ?? null,
        link.createdAt,
        link.updatedAt,
        link.deletedAt ?? null,
      );
    }

    for (const location of payload.storageLocations ?? []) {
      await db.runAsync(
        `INSERT INTO storage_locations (id, childId, name, type, notes, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        location.id,
        location.childId ?? null,
        location.name,
        location.type ?? null,
        location.notes ?? null,
        location.createdAt,
        location.updatedAt,
        location.deletedAt ?? null,
      );
    }

    for (const alias of payload.printAliases ?? []) {
      await db.runAsync(
        `INSERT INTO print_aliases (id, canonical, alias, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?);`,
        alias.id,
        normalizePrintName(alias.canonical),
        normalizePrintName(alias.alias),
        alias.createdAt,
        alias.updatedAt,
        alias.deletedAt ?? null,
      );
    }

    if (payload.purchaseState) {
      await repository.savePurchaseState(payload.purchaseState);
    }

    for (const outfit of payload.outfits) {
      await db.runAsync(
        `INSERT INTO outfits (id, childId, name, itemIds, notes, previewUri, createdAt, updatedAt, deletedAt, occasionTags, weatherHint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        outfit.id,
        outfit.childId,
        outfit.name,
        JSON.stringify(outfit.itemIds),
        outfit.notes ?? null,
        outfit.previewUri ?? null,
        outfit.createdAt,
        outfit.updatedAt,
        outfit.deletedAt ?? null,
        JSON.stringify(outfit.occasionTags),
        outfit.weatherHint ?? null,
      );
      await replaceOutfitTags(outfit.id, outfit.occasionTags);
    }

    for (const preset of payload.filterPresets ?? []) {
      await db.runAsync(
        `INSERT INTO filter_presets (id, name, childId, status, clothingType, includeUnsorted, query, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        preset.id,
        preset.name,
        preset.childId ?? null,
        preset.status ?? null,
        preset.clothingType ?? null,
        preset.includeUnsorted ? 1 : 0,
        preset.query ?? null,
        preset.createdAt,
        preset.createdAt,
        null,
      );
    }

    for (const draft of payload.saleDrafts ?? []) {
      await db.runAsync(
        `INSERT INTO sale_drafts (id, title, status, defaultSmokeNote, defaultPetType, defaultPetNote, defaultWashNote, defaultDryingMethod, defaultBundleOffersAccepted, defaultOffersAccepted, defaultShippingNote, defaultPaymentNote, collageGridSize, collageOrderMode, customHeaderImageUri, freeGeneratedCardItemIdsJson, freeGenerationConsumedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        draft.id,
        draft.title ?? null,
        draft.status,
        draft.defaultSmokeNote ?? null,
        draft.defaultPetTypes ? JSON.stringify(draft.defaultPetTypes) : null,
        draft.defaultPetNote ?? null,
        draft.defaultWashNote ?? null,
        draft.defaultDryingMethod ?? null,
        toNullableBooleanDbValue(draft.defaultBundleOffersAccepted),
        toNullableBooleanDbValue(draft.defaultOffersAccepted),
        draft.defaultShippingNote ?? null,
        draft.defaultPaymentNote ?? null,
        draft.collageGridSize ?? 'Auto',
        draft.collageOrderMode ?? 'highest-price',
        draft.customHeaderImageUri ?? null,
        JSON.stringify(draft.freeGeneratedCardItemIds ?? []),
        draft.freeGenerationConsumedAt ?? null,
        draft.createdAt,
        draft.updatedAt,
      );
    }

    for (const draftItem of payload.saleDraftItems ?? []) {
      await db.runAsync(
        `INSERT INTO sale_draft_items (id, saleDraftId, itemId, listingOrder, included, itemNumber, selectedPhotoUri, price, condition, conditionNotes, flawTagsJson, flawNotes, washNotesOverride, dryingMethodOverride, smokeNoteOverride, petTypeOverride, petNoteOverride, offersAcceptedOverride, bundleOffersAcceptedOverride, generatedStatus, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        draftItem.id,
        draftItem.saleDraftId,
        draftItem.itemId,
        draftItem.listingOrder,
        draftItem.included ? 1 : 0,
        draftItem.itemNumber,
        draftItem.selectedPhotoUri ?? null,
        draftItem.price ?? null,
        draftItem.condition ?? null,
        draftItem.conditionNotes ?? null,
        JSON.stringify(draftItem.flawTags ?? []),
        draftItem.flawNotes ?? null,
        draftItem.washNotesOverride ?? null,
        draftItem.dryingMethodOverride ?? null,
        draftItem.smokeNoteOverride ?? null,
        draftItem.petTypesOverride ? JSON.stringify(draftItem.petTypesOverride) : null,
        draftItem.petNoteOverride ?? null,
        toNullableBooleanDbValue(draftItem.offersAcceptedOverride),
        toNullableBooleanDbValue(draftItem.bundleOffersAcceptedOverride),
        draftItem.generatedStatus ?? null,
        draftItem.createdAt,
        draftItem.updatedAt,
      );
    }

    await repository.updateSettings(payload.settings);
  },

  async createSaleDraft(input: CreateSaleDraftInput): Promise<SaleDraft> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    const draft: SaleDraft = {
      id: makeId(),
      title: normalizeSaleDraftTitle(input.title),
      status: 'draft',
      collageGridSize: 'Auto',
      collageOrderMode: 'highest-price',
      customHeaderImageUri: undefined,
      freeGeneratedCardItemIds: [],
      freeGenerationConsumedAt: undefined,
      createdAt: now,
      updatedAt: now,
    };
    const uniqueItemIds = Array.from(new Set(input.itemIds));
    const sourceItems = uniqueItemIds.length
      ? await db.getAllAsync<ItemRow>(`SELECT * FROM items WHERE id IN (${uniqueItemIds.map(() => '?').join(', ')});`, ...uniqueItemIds)
      : [];
    const sourceItemMap = new Map(sourceItems.map((row) => {
      const mapped = mapItem(row, [], row.brand ? [row.brand] : [], row.childId ? [row.childId] : []);
      return [mapped.id, mapped] as const;
    }));
    const originalIndexById = new Map(uniqueItemIds.map((itemId, index) => [itemId, index]));
    const orderedItemIds = [...uniqueItemIds].sort((leftId, rightId) => {
      const leftItem = sourceItemMap.get(leftId);
      const rightItem = sourceItemMap.get(rightId);
      const leftPrice = leftItem?.targetResalePrice;
      const rightPrice = rightItem?.targetResalePrice;
      const leftHasPrice = Number.isFinite(leftPrice);
      const rightHasPrice = Number.isFinite(rightPrice);
      if (leftHasPrice && rightHasPrice && leftPrice !== rightPrice) {
        return (rightPrice ?? 0) - (leftPrice ?? 0);
      }
      if (leftHasPrice !== rightHasPrice) {
        return leftHasPrice ? -1 : 1;
      }
      return (originalIndexById.get(leftId) ?? 0) - (originalIndexById.get(rightId) ?? 0);
    });

    await runInTransaction(db, async () => {
      await db.runAsync(
        `INSERT INTO sale_drafts (id, title, status, collageGridSize, collageOrderMode, customHeaderImageUri, freeGeneratedCardItemIdsJson, freeGenerationConsumedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        draft.id,
        draft.title ?? null,
        draft.status,
        draft.collageGridSize,
        draft.collageOrderMode,
        draft.customHeaderImageUri ?? null,
        JSON.stringify(draft.freeGeneratedCardItemIds),
        draft.freeGenerationConsumedAt ?? null,
        draft.createdAt,
        draft.updatedAt,
      );

      for (let index = 0; index < orderedItemIds.length; index += 1) {
        const itemId = orderedItemIds[index];
        await db.runAsync(
          `INSERT INTO sale_draft_items (id, saleDraftId, itemId, listingOrder, included, itemNumber, selectedPhotoUri, price, condition, conditionNotes, flawTagsJson, flawNotes, washNotesOverride, dryingMethodOverride, smokeNoteOverride, petTypeOverride, petNoteOverride, offersAcceptedOverride, bundleOffersAcceptedOverride, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          makeId(),
          draft.id,
          itemId,
          index,
          1,
          index + 1,
          sourceItemMap.get(itemId)?.bstSelectedPhotoUri ?? null,
          sourceItemMap.get(itemId)?.targetResalePrice ?? null,
          sourceItemMap.get(itemId)?.bstCondition ?? null,
          sourceItemMap.get(itemId)?.bstConditionNotes ?? null,
          JSON.stringify(sourceItemMap.get(itemId)?.bstFlawTags ?? []),
          sourceItemMap.get(itemId)?.bstFlawNotes ?? null,
          sourceItemMap.get(itemId)?.bstWashNotes ?? null,
          sourceItemMap.get(itemId)?.bstDryingMethod ?? null,
          sourceItemMap.get(itemId)?.bstSmokeNote ?? null,
          sourceItemMap.get(itemId)?.bstPetTypes ? JSON.stringify(sourceItemMap.get(itemId)?.bstPetTypes) : null,
          sourceItemMap.get(itemId)?.bstPetNote ?? null,
          toNullableBooleanDbValue(sourceItemMap.get(itemId)?.bstOffersAccepted),
          toNullableBooleanDbValue(sourceItemMap.get(itemId)?.bstBundleOffersAccepted),
          now,
          now,
        );
      }
    });
    return draft;
  },

  async updateSaleDraft(id: ID, patch: UpdateSaleDraftInput): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const existing = await db.getFirstAsync<SaleDraftRow>('SELECT * FROM sale_drafts WHERE id = ?;', id);
    if (!existing) throw new Error('Sale draft not found.');
    const next = {
      ...mapSaleDraft(existing),
      ...patch,
      title: patch.title === undefined ? mapSaleDraft(existing).title : normalizeSaleDraftTitle(patch.title),
      defaultPetTypes: patch.defaultPetTypes === undefined ? mapSaleDraft(existing).defaultPetTypes : normalizePetTypes(patch.defaultPetTypes),
      defaultPetNote: patch.defaultPetNote === undefined ? mapSaleDraft(existing).defaultPetNote : normalizeSaleDraftText(patch.defaultPetNote),
      defaultWashNote: patch.defaultWashNote === undefined ? mapSaleDraft(existing).defaultWashNote : normalizeSaleDraftText(patch.defaultWashNote),
      defaultShippingNote: patch.defaultShippingNote === undefined ? mapSaleDraft(existing).defaultShippingNote : normalizeSaleDraftText(patch.defaultShippingNote),
      defaultPaymentNote: patch.defaultPaymentNote === undefined ? mapSaleDraft(existing).defaultPaymentNote : normalizeSaleDraftText(patch.defaultPaymentNote),
      customHeaderImageUri: patch.customHeaderImageUri === undefined ? mapSaleDraft(existing).customHeaderImageUri : normalizeSaleDraftText(patch.customHeaderImageUri),
      freeGeneratedCardItemIds: patch.freeGeneratedCardItemIds === undefined ? mapSaleDraft(existing).freeGeneratedCardItemIds : patch.freeGeneratedCardItemIds,
      freeGenerationConsumedAt:
        patch.freeGenerationConsumedAt === undefined ? mapSaleDraft(existing).freeGenerationConsumedAt : patch.freeGenerationConsumedAt ?? undefined,
      updatedAt: Date.now(),
    };
    await db.runAsync(
      `UPDATE sale_drafts
       SET title = ?, status = ?, defaultSmokeNote = ?, defaultPetType = ?, defaultPetNote = ?, defaultWashNote = ?, defaultDryingMethod = ?, defaultBundleOffersAccepted = ?, defaultOffersAccepted = ?, defaultShippingNote = ?, defaultPaymentNote = ?, collageGridSize = ?, collageOrderMode = ?, customHeaderImageUri = ?, freeGeneratedCardItemIdsJson = ?, freeGenerationConsumedAt = ?, updatedAt = ?
       WHERE id = ?;`,
      next.title ?? null,
      next.status,
      next.defaultSmokeNote ?? null,
      next.defaultPetTypes ? JSON.stringify(next.defaultPetTypes) : null,
      next.defaultPetNote ?? null,
      next.defaultWashNote ?? null,
      next.defaultDryingMethod ?? null,
      toNullableBooleanDbValue(next.defaultBundleOffersAccepted),
      toNullableBooleanDbValue(next.defaultOffersAccepted),
      next.defaultShippingNote ?? null,
      next.defaultPaymentNote ?? null,
      next.collageGridSize ?? 'Auto',
      next.collageOrderMode ?? 'highest-price',
      next.customHeaderImageUri ?? null,
      JSON.stringify(next.freeGeneratedCardItemIds ?? []),
      next.freeGenerationConsumedAt ?? null,
      next.updatedAt,
      id,
    );
  },

  async updateSaleDraftItem(id: ID, patch: UpdateSaleDraftItemInput): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const existing = await db.getFirstAsync<SaleDraftItemRow>('SELECT * FROM sale_draft_items WHERE id = ?;', id);
    if (!existing) throw new Error('Sale draft item not found.');
    const current = mapSaleDraftItem(existing);
    const next: SaleDraftItem = {
      ...current,
      ...patch,
      selectedPhotoUri: patch.selectedPhotoUri === undefined ? current.selectedPhotoUri : normalizeSaleDraftText(patch.selectedPhotoUri),
      price: patch.price === undefined ? current.price : normalizeOptionalNumber(patch.price),
      conditionNotes: patch.conditionNotes === undefined ? current.conditionNotes : normalizeSaleDraftText(patch.conditionNotes),
      flawTags: patch.flawTags === undefined ? current.flawTags : patch.flawTags,
      flawNotes: patch.flawNotes === undefined ? current.flawNotes : normalizeSaleDraftText(patch.flawNotes),
      washNotesOverride: patch.washNotesOverride === undefined ? current.washNotesOverride : normalizeSaleDraftText(patch.washNotesOverride),
      petTypesOverride: patch.petTypesOverride === undefined ? current.petTypesOverride : normalizePetTypes(patch.petTypesOverride),
      petNoteOverride: patch.petNoteOverride === undefined ? current.petNoteOverride : normalizeSaleDraftText(patch.petNoteOverride),
      generatedStatus: patch.generatedStatus === undefined ? current.generatedStatus : normalizeSaleDraftText(patch.generatedStatus),
      updatedAt: Date.now(),
    };
    await db.runAsync(
      `UPDATE sale_draft_items
       SET listingOrder = ?, included = ?, itemNumber = ?, selectedPhotoUri = ?, price = ?, condition = ?, conditionNotes = ?, flawTagsJson = ?, flawNotes = ?, washNotesOverride = ?, dryingMethodOverride = ?, smokeNoteOverride = ?, petTypeOverride = ?, petNoteOverride = ?, offersAcceptedOverride = ?, bundleOffersAcceptedOverride = ?, generatedStatus = ?, updatedAt = ?
       WHERE id = ?;`,
      next.listingOrder,
      next.included ? 1 : 0,
      next.itemNumber,
      next.selectedPhotoUri ?? null,
      next.price ?? null,
      next.condition ?? null,
      next.conditionNotes ?? null,
      JSON.stringify(next.flawTags ?? []),
      next.flawNotes ?? null,
      next.washNotesOverride ?? null,
      next.dryingMethodOverride ?? null,
      next.smokeNoteOverride ?? null,
      next.petTypesOverride ? JSON.stringify(next.petTypesOverride) : null,
      next.petNoteOverride ?? null,
      toNullableBooleanDbValue(next.offersAcceptedOverride),
      toNullableBooleanDbValue(next.bundleOffersAcceptedOverride),
      next.generatedStatus ?? null,
      next.updatedAt,
      id,
    );
    await db.runAsync('UPDATE sale_drafts SET updatedAt = ? WHERE id = ?;', next.updatedAt, next.saleDraftId);
  },

  async bulkUpdateSaleDraftItems(saleDraftId: ID, patch: BulkUpdateSaleDraftItemsInput): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (!entries.length) return;

    const assignments: string[] = [];
    const values: Array<string | number | null> = [];

    if (Object.prototype.hasOwnProperty.call(patch, 'condition')) {
      assignments.push('condition = ?');
      values.push(patch.condition ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'dryingMethodOverride')) {
      assignments.push('dryingMethodOverride = ?');
      values.push(patch.dryingMethodOverride ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'offersAcceptedOverride')) {
      assignments.push('offersAcceptedOverride = ?');
      values.push(toNullableBooleanDbValue(patch.offersAcceptedOverride));
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'bundleOffersAcceptedOverride')) {
      assignments.push('bundleOffersAcceptedOverride = ?');
      values.push(toNullableBooleanDbValue(patch.bundleOffersAcceptedOverride));
    }

    if (!assignments.length) return;
    const now = Date.now();
    await runInTransaction(db, async () => {
      await db.runAsync(
        `UPDATE sale_draft_items
         SET ${assignments.join(', ')}, updatedAt = ?
         WHERE saleDraftId = ? AND included = 1;`,
        ...values,
        now,
        saleDraftId,
      );
      await db.runAsync('UPDATE sale_drafts SET updatedAt = ? WHERE id = ?;', now, saleDraftId);
    });
  },

  async deleteSaleDraft(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    await runInTransaction(db, async () => {
      await db.runAsync('DELETE FROM sale_draft_items WHERE saleDraftId = ?;', id);
      await db.runAsync('DELETE FROM sale_drafts WHERE id = ?;', id);
    });
  },

  async removeSaleDraftItem(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const row = await db.getFirstAsync<{ saleDraftId: string }>('SELECT saleDraftId FROM sale_draft_items WHERE id = ?;', id);
    if (!row) return;
    await db.runAsync('DELETE FROM sale_draft_items WHERE id = ?;', id);
    await cleanupDraftFreeGeneratedCardIds(db, row.saleDraftId);
    await renumberSaleDraftItems(db, row.saleDraftId);
  },

  async reorderSaleDraftItems(saleDraftId: ID, orderedDraftItemIds: ID[]): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    await runInTransaction(db, async () => {
      for (let index = 0; index < orderedDraftItemIds.length; index += 1) {
        await db.runAsync(
          'UPDATE sale_draft_items SET listingOrder = ?, itemNumber = ?, updatedAt = ? WHERE id = ? AND saleDraftId = ?;',
          index,
          index + 1,
          now,
          orderedDraftItemIds[index],
          saleDraftId,
        );
      }
      await db.runAsync('UPDATE sale_drafts SET updatedAt = ? WHERE id = ?;', now, saleDraftId);
    });
  },

  async createStorageLocation(input: { childId?: ID; name: string; type?: string; notes?: string }): Promise<StorageLocation> {
    await initDatabase();
    const db = await getDb();
    const now = new Date().toISOString();
    const location: StorageLocation = {
      id: makeId(),
      childId: input.childId,
      name: input.name.trim(),
      type: input.type?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    await db.runAsync(
      `INSERT INTO storage_locations (id, childId, name, type, notes, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      location.id,
      location.childId ?? null,
      location.name,
      location.type ?? null,
      location.notes ?? null,
      location.createdAt,
      location.updatedAt,
      null,
    );
    return location;
  },

  async updateStorageLocation(id: ID, patch: { name?: string; type?: string; notes?: string; childId?: ID }): Promise<StorageLocation | undefined> {
    await initDatabase();
    const db = await getDb();
    const existing = await db.getFirstAsync<StorageLocationRow>('SELECT * FROM storage_locations WHERE id = ? AND deletedAt IS NULL;', id);
    if (!existing) return undefined;
    const updated: StorageLocation = {
      id: existing.id,
      childId: patch.childId !== undefined ? patch.childId : existing.childId ?? undefined,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      type: patch.type !== undefined ? patch.type.trim() || undefined : existing.type ?? undefined,
      notes: patch.notes !== undefined ? patch.notes.trim() || undefined : existing.notes ?? undefined,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      deletedAt: existing.deletedAt ?? undefined,
    };
    await db.runAsync(
      'UPDATE storage_locations SET childId = ?, name = ?, type = ?, notes = ?, updatedAt = ? WHERE id = ?;',
      updated.childId ?? null,
      updated.name,
      updated.type ?? null,
      updated.notes ?? null,
      updated.updatedAt,
      id,
    );
    return updated;
  },

  async listStorageLocations(childId?: ID): Promise<StorageLocation[]> {
    await initDatabase();
    const db = await getDb();
    const rows = childId
      ? await db.getAllAsync<StorageLocationRow>(
          'SELECT * FROM storage_locations WHERE deletedAt IS NULL AND (childId = ? OR childId IS NULL) ORDER BY updatedAt DESC;',
          childId,
        )
      : await db.getAllAsync<StorageLocationRow>('SELECT * FROM storage_locations WHERE deletedAt IS NULL ORDER BY updatedAt DESC;');
    return rows.map(mapStorageLocation);
  },

  async deleteStorageLocation(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync('UPDATE storage_locations SET deletedAt = ?, updatedAt = ? WHERE id = ?;', now, now, id);
  },

  async assignChildItemToLocation(childItemId: ID, storageLocationId?: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    await db.runAsync(
      'UPDATE child_items SET storageLocationId = ?, updatedAt = ? WHERE id = ?;',
      storageLocationId ?? null,
      Date.now(),
      childItemId,
    );
  },

  async createPrintAlias(input: { canonical: string; alias: string }): Promise<PrintAlias | undefined> {
    const canonical = normalizePrintName(input.canonical);
    const alias = normalizePrintName(input.alias);
    if (!canonical || !alias) return undefined;
    await initDatabase();
    const db = await getDb();
    const now = new Date().toISOString();
    const entry: PrintAlias = {
      id: makeId(),
      canonical,
      alias,
      createdAt: now,
      updatedAt: now,
    };
    await db.runAsync(
      `INSERT INTO print_aliases (id, canonical, alias, createdAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?);`,
      entry.id,
      entry.canonical,
      entry.alias,
      entry.createdAt,
      entry.updatedAt,
      null,
    );
    return entry;
  },

  async listPrintAliases(): Promise<PrintAlias[]> {
    await initDatabase();
    const db = await getDb();
    const rows = await db.getAllAsync<PrintAliasRow>('SELECT * FROM print_aliases WHERE deletedAt IS NULL ORDER BY updatedAt DESC;');
    return rows.map(mapPrintAlias);
  },

  async findItemsByPrint(printName: string, childId?: ID): Promise<Item[]> {
    const aliases = await getActivePrintAliases();
    const normalized = resolvePrintName(printName, aliases);
    if (!normalized) return [];
    const all = await repository.getAll();
    return all.items.filter((item) => {
      const itemCanonical = item.printNameNorm || resolvePrintName(item.printName ?? '', aliases);
      if (itemCanonical !== normalized) return false;
      if (!childId) return true;
      return item.childIds.includes(childId);
    });
  },

  async findNearbySizeSamePrint(childId: ID, printName: string, size: string): Promise<Item[]> {
    const aliases = await getActivePrintAliases();
    const normalized = resolvePrintName(printName, aliases);
    if (!normalized) return [];
    const target = sizeToNumber(size);
    if (target === undefined) return [];

    const byPrint = await repository.findItemsByPrint(normalized, childId);
    return byPrint.filter((item) => {
      const itemSize = sizeToNumber(item.size);
      if (itemSize === undefined) return false;
      return Math.abs(itemSize - target) <= 10;
    });
  },
};
