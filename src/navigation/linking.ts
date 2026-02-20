import { LinkingOptions } from '@react-navigation/native';
import * as ExpoLinking from 'expo-linking';

export const linking: LinkingOptions<any> = {
  prefixes: [ExpoLinking.createURL('/'), 'kidklothes://'],
  config: {
    screens: {
      Items: {
        screens: {
          ItemsList: 'items',
          AddItem: 'items/add',
          ItemDetail: 'items/item/:itemId',
        },
      },
      Outfits: {
        screens: {
          OutfitsList: 'outfits',
          OutfitBuilder: 'outfits/builder/:outfitId?',
        },
      },
      Kids: {
        screens: {
          KidsList: 'kids',
          KidForm: 'kids/edit/:childId?',
        },
      },
      Settings: {
        screens: {
          SettingsHome: 'settings',
        },
      },
    },
  },
};
