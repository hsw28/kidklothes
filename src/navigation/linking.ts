import { LinkingOptions } from '@react-navigation/native';
import * as ExpoLinking from 'expo-linking';

export const linking: LinkingOptions<any> = {
  prefixes: [ExpoLinking.createURL('/', { scheme: 'layetteout' }), 'layetteout://'],
  config: {
    screens: {
      Closet: {
        screens: {
          GuidedStart: 'start',
          GuidedShopping: 'start/shopping',
          GuidedOrganizing: 'start/organizing',
          GuidedSnapshot: 'start/snapshot/:childId/:currentSize/:clothingType',
          ClosetHome: 'closet',
          BeforeYouBuy: 'closet/buy/:childId?',
          BrandSnapshot: 'closet/brands/:childId?',
          DropPrep: 'closet/drop-prep/:childId?',
          PrintDupGroups: 'closet/drop-prep/prints/:childId',
          DrawerScan: 'closet/drawer-scan',
          DrawerScanResults: 'closet/drawer-scan/results',
          BatchAdd: 'closet/batch-add',
          ItemsList: 'closet/items',
          SellBin: 'closet/sell-bin',
          CategorySnapshot: 'closet/category/:childId/:category',
          OutfitsList: 'closet/outfits',
          OutfitBuilder: 'closet/outfits/builder/:outfitId?',
          AddItem: 'closet/items/add',
          ItemDetail: 'closet/items/:itemId',
        },
      },
      Wishlist: {
        screens: {
          ItemsList: 'wishlist',
          AddItem: 'wishlist/add',
          ItemDetail: 'wishlist/item/:itemId',
        },
      },
      Kids: {
        screens: {
          KidsList: 'kids',
          ChildDashboard: 'kids/dashboard/:childId',
          KidForm: 'kids/edit/:childId?',
        },
      },
      Settings: {
        screens: {
          SettingsHome: 'settings',
          ActivityLog: 'settings/activity',
        },
      },
    },
  },
};
