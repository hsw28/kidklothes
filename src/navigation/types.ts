import { ID, ItemStatus } from '@/models';
import { ClothingType } from '@/models';
import { ClosetSizeMode } from '@/utils/closetViewInsights';
import { ClosetCategory } from '@/utils/categories';

export type RootTabParamList = {
  Closet: undefined;
  Wishlist: undefined;
  Kids: undefined;
  Settings: undefined;
};

export type ItemsStackParamList = {
  ProPaywall:
    | {
        source?:
          | 'bst_card_limit'
          | 'bst_draft_limit'
          | 'bst_locked_export'
          | 'bst_locked_card'
          | 'bst_save_all_cards'
          | 'bst_save_collage_locked'
          | 'item_multi_photo';
        draftId?: ID;
        totalItems?: number;
      }
    | undefined;
  ItemsList:
    | {
        initialStatus?: ItemStatus;
        hideInbox?: boolean;
        initialTodayOnly?: boolean;
        initialSinceHours?: number;
        initialChildId?: ID;
        initialSize?: string;
        initialCategory?: ClosetCategory;
        initialClothingType?: ClothingType;
        initialBrandId?: string;
        initialSizeBucket?: 'All' | 'now' | 'next';
        initialStorageLocationId?: ID;
        initialQuery?: string;
        initialItemIds?: ID[];
      }
    | undefined;
  AddItem: { itemId?: ID; duplicateFromItemId?: ID; url?: string; source?: string; quick?: boolean; prefillType?: ClothingType; prefillCategory?: string; prefillBrand?: string; prefillStatus?: ItemStatus; prefillChildId?: ID; shoppingMode?: boolean; sharedTitle?: string; sharedImageUrl?: string; sharedSiteName?: string } | undefined;
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
  ClosetHome: { showFirstKidAddedHint?: boolean; revealLatestAdd?: boolean } | undefined;
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
        initialCategory?: ClosetCategory;
        initialClothingType?: ClothingType;
        initialBrandId?: string;
        initialSizeBucket?: 'All' | 'now' | 'next';
        initialStorageLocationId?: ID;
        initialQuery?: string;
        initialItemIds?: ID[];
      }
    | undefined;
  SellBin: undefined;
  ProPaywall:
    | {
        source?:
          | 'bst_card_limit'
          | 'bst_draft_limit'
          | 'bst_locked_export'
          | 'bst_locked_card'
          | 'bst_save_all_cards'
          | 'bst_save_collage_locked'
          | 'item_multi_photo';
        draftId?: ID;
        totalItems?: number;
      }
    | undefined;
  BstSaleDraftList: undefined;
  BstSaleDraftCreate: { prefillItemIds?: ID[] } | undefined;
  BstSaleDraftEditor: { draftId: ID; editDraftItemId?: ID };
  BstSaleDraftPreview: { draftId: ID; previewMode?: 'full' | 'teaser' };
  CategorySnapshot: { childId: ID; category: string; sizeMode?: ClosetSizeMode; brandId?: string; brandIds?: string[]; season?: string; query?: string; locationFilter?: string };
  OutfitsList: undefined;
  OutfitBuilder: { outfitId?: ID } | undefined;
  ItemDetail: { itemId: ID };
  AddItem: { itemId?: ID; duplicateFromItemId?: ID; url?: string; source?: string; quick?: boolean; prefillType?: ClothingType; prefillCategory?: string; prefillBrand?: string; prefillStatus?: ItemStatus; prefillChildId?: ID; shoppingMode?: boolean; sharedTitle?: string; sharedImageUrl?: string; sharedSiteName?: string } | undefined;
};

export type KidsStackParamList = {
  KidsList: undefined;
  ChildDashboard: { childId: ID };
  KidForm: { childId?: ID; returnToClosetAfterCreate?: boolean } | undefined;
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  MissingPhotoRepair: undefined;
  PrivacySummary: undefined;
  TermsSummary: undefined;
  TermsOfService: undefined;
  ActivityLog: undefined;
  ActivitySnapshot: undefined;
};
