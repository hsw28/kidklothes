import { ID } from '@/models';

export type RootTabParamList = {
  Items: undefined;
  Outfits: undefined;
  Kids: undefined;
  Settings: undefined;
};

export type ItemsStackParamList = {
  ItemsList: undefined;
  AddItem: { itemId?: ID; url?: string } | undefined;
  ItemDetail: { itemId: ID };
};

export type OutfitsStackParamList = {
  OutfitsList: undefined;
  OutfitBuilder: { outfitId?: ID } | undefined;
};

export type KidsStackParamList = {
  KidsList: undefined;
  KidForm: { childId?: ID } | undefined;
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
};
