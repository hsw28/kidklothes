export type ID = string;
export type SizeCode =
  | 'P'
  | 'NB'
  | '0-3M'
  | '3-6M'
  | '6-9M'
  | '9-12M'
  | '12-18M'
  | '18-24M'
  | '2T'
  | '3T'
  | '4T'
  | '5T'
  | '4-5'
  | '6-7'
  | '8'
  | '10-12'
  | '14-16'
  | 'OTHER';

export type ClothingType =
  | 'sleeper'
  | 'romper'
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'shoes'
  | 'accessory';

export type ItemCategory =
  | 'pants'
  | 'tops'
  | 'pjs'
  | 'swim'
  | 'one-pieces'
  | 'outerwear'
  | 'shoes'
  | 'dresses-skirts'
  | 'accessories'
  | 'sets'
  | 'other'
  // legacy saved values (kept for backward compatibility)
  | 'bottoms'
  | 'one-piece'
  | 'dresses';

export type ItemStatus = 'wishlist' | 'owned' | 'for-sale' | 'sold';
export type FitRating = 'small' | 'true' | 'large';
export type FitException = 'fits-small' | 'fits-big' | 'runs-true' | 'bamboo-stretch';
export type BrandFit = 'tts' | 'small' | 'big';
export type KidFit = 'fits' | 'big' | 'small' | 'unknown';
export type Condition = 'new-with-tags' | 'like-new' | 'good' | 'play' | 'donate';
export type BstSaleDraftStatus = 'draft' | 'exported' | 'archived';
export type BstCondition = 'NWT' | 'NWOT' | 'Like New' | 'Good' | 'Play';
export type BstFlawTag = 'wash wear' | 'pilling' | 'stain' | 'hole' | 'fade' | 'cracking' | 'loose snap' | 'seam issue' | 'other';
export type BstDryingMethod = 'line dried' | 'machine dried';
export type BstSmokeNote = 'smoke-free home' | 'smoking home';
export type BstPetType = 'none' | 'dog' | 'cat' | 'other';
export type BstCollageGridSize = 'Auto' | '2' | '4' | '6' | '8';
export type BstCollageOrderMode = 'highest-price' | 'newest-first' | 'custom';
export type AddItemDefaultViewMode = 'simple' | 'detailed';
export type FitBin = 'current' | 'next' | 'later' | 'unsure';
export type ItemSizeType = 'apparel' | 'shoe';
export type ItemSizeSystem = 'APPAREL' | 'US_SHOE';
export type ItemSizeScheme = 'AGE' | 'ALPHA' | 'CUSTOM' | 'SHOE';
export const ITEM_STATUSES = ['wishlist', 'owned', 'for-sale', 'sold'] as const;
export const CLOTHING_TYPES = ['sleeper', 'romper', 'top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'] as const;
export const BST_CONDITIONS = ['NWT', 'NWOT', 'Like New', 'Good', 'Play'] as const;
export const BST_FLAW_TAGS = ['wash wear', 'pilling', 'stain', 'hole', 'fade', 'cracking', 'loose snap', 'seam issue', 'other'] as const;
export const BST_DRYING_METHODS = ['line dried', 'machine dried'] as const;
export const BST_SMOKE_NOTES = ['smoke-free home', 'smoking home'] as const;
export const BST_PET_TYPES = ['none', 'dog', 'cat', 'other'] as const;
export const BST_COLLAGE_GRID_SIZES = ['Auto', '2', '4', '6', '8'] as const;
export const BST_COLLAGE_ORDER_MODES = ['highest-price', 'newest-first', 'custom'] as const;

export interface BaseItem {
  id: ID;
  title: string;
  brand?: string;
  category?: ItemCategory;
  size: string;
  notes?: string;
  url?: string;
  sourceDomain?: string;
  canonicalUrl?: string;
  outboundUrl?: string;
  imageUrl?: string;
  imageUrls: string[];
  cachedImageUri?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Child {
  id: ID;
  name: string;
  photoUri?: string;
  notes?: string;
  usesMixedSizes: boolean;
  currentSizeCodes?: string[];
  hiddenClosetCategories: string[];
  apparelSizeCurrent?: string;
  apparelSizeNext?: string;
  shoeSizeCurrent?: string;
  shoeSizeNext?: string;
  shoeSizeSystem?: ItemSizeSystem;
  currentSize: { code: SizeCode | null; otherText?: string | null };
  nextSize: { code: SizeCode | null; otherText?: string | null };
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Item extends BaseItem {
  clickCount: number;
  quantity: number;
  styleName?: string;
  printName?: string;
  printNameNorm?: string;
  brandTags: string[];
  clothingType: ClothingType;
  status: ItemStatus;
  purchasePrice?: number;
  targetResalePrice?: number;
  soldPrice?: number;
  soldDate?: string;
  listedAt?: string;
  bundleId?: string;
  sizeNormalized?: string;
  sizeType?: ItemSizeType;
  sizeSystem?: ItemSizeSystem;
  sizeScheme?: ItemSizeScheme;
  sizeRaw?: string;
  brandFit?: BrandFit;
  kidFit?: KidFit;
  brandSizeNote?: string;
  fabric?: string;
  fitRating?: FitRating;
  fitException?: FitException;
  condition?: Condition;
  bstSelectedPhotoUri?: string;
  bstCondition?: BstCondition;
  bstConditionNotes?: string;
  bstFlawTags: BstFlawTag[];
  bstFlawNotes?: string;
  bstWashNotes?: string;
  bstDryingMethod?: BstDryingMethod;
  bstSmokeNote?: BstSmokeNote;
  bstPetTypes?: BstPetType[];
  bstPetNote?: string;
  bstOffersAccepted?: boolean;
  bstBundleOffersAccepted?: boolean;
  seasonTags: string[];
  lastWornAt?: number;
  wornCount: number;
  fitBin?: FitBin;
  fitBinTouched?: boolean;

  tags: string[];
  childIds: ID[];
}

export type WishlistItem = Item & { status: 'wishlist' };
export type ClosetItem = Item & { status: Exclude<ItemStatus, 'wishlist'> };

export interface ChildItem {
  id: ID;
  childId: ID;
  itemId: ID;
  storageLocationId?: ID;
  sizeAtTime?: string;
  statusForChild: ItemStatus;
  notesForChild?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface StorageLocation {
  id: ID;
  childId?: ID;
  name: string;
  type?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface PrintAlias {
  id: ID;
  canonical: string;
  alias: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Outfit {
  id: ID;
  childId: ID;
  name: string;
  itemIds: ID[];
  notes?: string;
  previewUri?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  occasionTags: string[];
  weatherHint?: string;
}

export interface SaleDraft {
  id: ID;
  title?: string;
  status: BstSaleDraftStatus;
  defaultSmokeNote?: BstSmokeNote;
  defaultPetTypes?: BstPetType[];
  defaultPetNote?: string;
  defaultWashNote?: string;
  defaultDryingMethod?: BstDryingMethod;
  defaultBundleOffersAccepted?: boolean;
  defaultOffersAccepted?: boolean;
  defaultShippingNote?: string;
  defaultPaymentNote?: string;
  collageGridSize: BstCollageGridSize;
  collageOrderMode: BstCollageOrderMode;
  customHeaderImageUri?: string;
  freeGeneratedCardItemIds: ID[];
  freeGenerationConsumedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SaleDraftItem {
  id: ID;
  saleDraftId: ID;
  itemId: ID;
  listingOrder: number;
  included: boolean;
  itemNumber: number;
  selectedPhotoUri?: string;
  price?: number;
  condition?: BstCondition;
  conditionNotes?: string;
  flawTags: BstFlawTag[];
  flawNotes?: string;
  washNotesOverride?: string;
  dryingMethodOverride?: BstDryingMethod;
  smokeNoteOverride?: BstSmokeNote;
  petTypesOverride?: BstPetType[];
  petNoteOverride?: string;
  offersAcceptedOverride?: boolean;
  bundleOffersAcceptedOverride?: boolean;
  generatedStatus?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: ID;
  name: string;
  createdAt: number;
}

export interface FilterPreset {
  id: ID;
  name: string;
  childId?: ID;
  status?: ItemStatus;
  clothingType?: ClothingType;
  includeUnsorted?: boolean;
  query?: string;
  createdAt: number;
}

export interface AppSettings {
  closetAddDefaultView: AddItemDefaultViewMode;
  notificationsEnabled: boolean;
  notifyWeeklyTidy: boolean;
  notifyOutgrow: boolean;
  monetizationEnabled: boolean;
  guidedOnboarding: boolean;
  guidedOnboardingCompleted: boolean;
  advancedFeaturesUnlocked: boolean;
  lastShoppingType?: ClothingType;
  lastShoppingChildId?: ID;
  lastPromptedAt?: number;
  lastUpsellShownAt?: number;
  closetCategoryOrder?: string[];
  hiddenClosetCategoriesGlobal?: string[];
  wishlistCategoryOrder?: string[];
  hiddenWishlistCategories?: string[];
  kidsPreviewCategories?: string[];
  inventoryRealityCheckOwnedThreshold?: number;
  developerModeEnabled?: boolean;
  developerForceProAccessEnabled?: boolean;
  betaKidLimitBannerDismissed?: boolean;
  proTeaserBannerDismissed?: boolean;
  missingPhotoRestoreNudgeShown?: boolean;
  hasSeenBstPostingGuide?: boolean;
}

export interface ActivityEvent {
  id: ID;
  type: string;
  payload?: Record<string, unknown>;
  createdAt: number;
}

export interface PurchaseStateSnapshot {
  isEntitled: boolean;
  activeEntitlements: string[];
  activeSubscriptions: string[];
  nonSubscriptions: string[];
  latestPurchaseAt?: string;
  updatedAt: string;
}

export interface BackupPayload {
  exportedAt: number;
  version: number;
  children: Child[];
  items: Item[];
  childItems: ChildItem[];
  storageLocations?: StorageLocation[];
  printAliases?: PrintAlias[];
  purchaseState?: PurchaseStateSnapshot;
  outfits: Outfit[];
  filterPresets: FilterPreset[];
  saleDrafts?: SaleDraft[];
  saleDraftItems?: SaleDraftItem[];
  settings: AppSettings;
}
