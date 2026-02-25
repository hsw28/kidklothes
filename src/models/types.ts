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
export type DetailPromptMode = 'never' | 'sometimes' | 'always';
export const ITEM_STATUSES = ['wishlist', 'owned', 'for-sale', 'sold'] as const;
export const CLOTHING_TYPES = ['sleeper', 'romper', 'top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'] as const;

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
  hiddenClosetCategories: string[];
  currentSize: { code: SizeCode | null; otherText?: string | null };
  nextSize: { code: SizeCode | null; otherText?: string | null };
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Item extends BaseItem {
  clickCount: number;
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
  brandFit?: BrandFit;
  kidFit?: KidFit;
  brandSizeNote?: string;
  fitRating?: FitRating;
  fitException?: FitException;
  condition?: Condition;
  seasonTags: string[];
  lastWornAt?: number;
  wornCount: number;

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
  detailPromptMode: DetailPromptMode;
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
  developerModeEnabled?: boolean;
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
  settings: AppSettings;
}
