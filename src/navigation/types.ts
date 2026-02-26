import { ID, ItemStatus } from '@/models';
import { ClothingType } from '@/models';
import { ClosetSizeMode } from '@/utils/closetViewInsights';

export type RootTabParamList = {
  Closet: undefined;
  Wishlist: undefined;
  Kids: undefined;
  Settings: undefined;
};

export type ItemsStackParamList = {
  ItemsList:
    | {
        initialStatus?: ItemStatus;
        hideInbox?: boolean;
        initialTodayOnly?: boolean;
        initialSinceHours?: number;
        initialChildId?: ID;
        initialSize?: string;
        initialClothingType?: ClothingType;
        initialBrandId?: string;
        initialSizeBucket?: 'All' | 'now' | 'next';
        initialStorageLocationId?: ID;
        initialQuery?: string;
        initialItemIds?: ID[];
      }
    | undefined;
  AddItem: { itemId?: ID; duplicateFromItemId?: ID; url?: string; quick?: boolean; prefillType?: ClothingType; prefillCategory?: string; prefillBrand?: string; prefillStatus?: ItemStatus; prefillChildId?: ID; shoppingMode?: boolean } | undefined;
  ItemDetail: { itemId: ID };
};

export type OutfitsStackParamList = {
  OutfitsList: undefined;
  OutfitBuilder: { outfitId?: ID } | undefined;
};

export type ClosetStackParamList = {
  GuidedStart: undefined;
  GuidedShopping: undefined;
  GuidedOrganizing: undefined;
  GuidedSnapshot: { childId: ID; currentSize: string; clothingType: ClothingType };
  ClosetHome: { showFirstKidAddedHint?: boolean } | undefined;
  BeforeYouBuy: { childId?: ID } | undefined;
  BrandSnapshot: { childId?: ID } | undefined;
  DropPrep: { childId?: ID } | undefined;
  PrintDupGroups: { childId: ID; brandId?: string } | undefined;
  DrawerScan: undefined;
  DrawerScanResults: { childId?: ID; size?: string; counts: Array<{ label: string; count: number }> };
  BatchAdd: undefined;
  ItemsList:
    | {
        initialStatus?: ItemStatus;
        hideInbox?: boolean;
        initialTodayOnly?: boolean;
        initialSinceHours?: number;
        initialChildId?: ID;
        initialSize?: string;
        initialClothingType?: ClothingType;
        initialBrandId?: string;
        initialSizeBucket?: 'All' | 'now' | 'next';
        initialStorageLocationId?: ID;
        initialQuery?: string;
        initialItemIds?: ID[];
      }
    | undefined;
  SellBin: undefined;
  CategorySnapshot: { childId: ID; category: string; sizeMode?: ClosetSizeMode; brandId?: string; season?: string };
  OutfitsList: undefined;
  OutfitBuilder: { outfitId?: ID } | undefined;
  ItemDetail: { itemId: ID };
  AddItem: { itemId?: ID; duplicateFromItemId?: ID; url?: string; quick?: boolean; prefillType?: ClothingType; prefillCategory?: string; prefillBrand?: string; prefillStatus?: ItemStatus; prefillChildId?: ID; shoppingMode?: boolean } | undefined;
};

export type KidsStackParamList = {
  KidsList: undefined;
  ChildDashboard: { childId: ID };
  KidForm: { childId?: ID; returnToClosetAfterCreate?: boolean } | undefined;
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  PrivacySummary: undefined;
  TermsSummary: undefined;
  TermsOfService: undefined;
  ActivityLog: undefined;
  ActivitySnapshot: undefined;
};
