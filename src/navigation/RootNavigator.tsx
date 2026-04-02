import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BrandedHeaderTitle } from '@/components/BrandedHeaderTitle';
import { BeforeYouBuyScreen } from '@/screens/BeforeYouBuyScreen';
import { BatchAddScreen } from '@/screens/BatchAddScreen';
import { BrandSnapshotScreen } from '@/screens/BrandSnapshotScreen';
import { BstSaleDraftCreateScreen } from '@/screens/bst/BstSaleDraftCreateScreen';
import { BstSaleDraftEditorScreen } from '@/screens/bst/BstSaleDraftEditorScreen';
import { BstSaleDraftListScreen } from '@/screens/bst/BstSaleDraftListScreen';
import { BstSaleDraftPreviewScreen } from '@/screens/bst/BstSaleDraftPreviewScreen';
import { CategorySnapshotScreen } from '@/screens/CategorySnapshotScreen';
import { ClosetHomeScreen } from '@/screens/ClosetHomeScreen';
import { DrawerScanResultsScreen } from '@/screens/DrawerScanResultsScreen';
import { DrawerScanScreen } from '@/screens/DrawerScanScreen';
import { DropPrepScreen } from '@/screens/DropPrepScreen';
import { GuidedOrganizingScreen } from '@/screens/GuidedOrganizingScreen';
import { GuidedShoppingScreen } from '@/screens/GuidedShoppingScreen';
import { GuidedSnapshotScreen } from '@/screens/GuidedSnapshotScreen';
import { GuidedStartScreen } from '@/screens/GuidedStartScreen';
import { ItemDetailScreen } from '@/screens/ItemDetailScreen';
import { ItemFormScreen } from '@/screens/ItemFormScreen';
import { ItemsListScreen } from '@/screens/ItemsListScreen';
import { ChildDashboardScreen } from '@/screens/ChildDashboardScreen';
import { KidFormScreen } from '@/screens/KidFormScreen';
import { KidsListScreen } from '@/screens/KidsListScreen';
import { OutfitBuilderScreen } from '@/screens/OutfitBuilderScreen';
import { OutfitsListScreen } from '@/screens/OutfitsListScreen';
import { PrintDupGroupsScreen } from '@/screens/PrintDupGroupsScreen';
import { ProPaywallScreen } from '@/screens/ProPaywallScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { MissingPhotoRepairScreen } from '@/screens/MissingPhotoRepairScreen';
import { ActivityLogScreen } from '@/screens/ActivityLogScreen';
import { ActivitySnapshotScreen } from '@/screens/ActivitySnapshotScreen';
import { PrivacySummaryScreen } from '@/screens/PrivacySummaryScreen';
import { SellBinScreen } from '@/screens/SellBinScreen';
import { TermsOfServiceScreen } from '@/screens/TermsOfServiceScreen';
import { TermsSummaryScreen } from '@/screens/TermsSummaryScreen';
import { useData } from '@/db/DataContext';
import { useAppTheme } from '@/theme';
import {
  ClosetStackParamList,
  ItemsStackParamList,
  KidsStackParamList,
  RootTabParamList,
  SettingsStackParamList,
} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const ClosetStack = createNativeStackNavigator<ClosetStackParamList>();
const WishlistStack = createNativeStackNavigator<ItemsStackParamList>();
const KidsStack = createNativeStackNavigator<KidsStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const ClosetStackNavigator = () => {
  const theme = useAppTheme();
  const { settings } = useData();
  const brandedTitle = (title: string) => () => <BrandedHeaderTitle title={title} />;
  return (
  <ClosetStack.Navigator
    initialRouteName="ClosetHome"
    screenOptions={{
      headerTitleStyle: {
        fontFamily: theme.fonts.serif,
        fontSize: 20,
        fontWeight: '500',
      },
    }}
  >
    <ClosetStack.Screen name="GuidedStart" component={GuidedStartScreen} options={{ title: 'How It Works' }} />
    <ClosetStack.Screen name="GuidedShopping" component={GuidedShoppingScreen} options={{ title: 'Shopping Setup' }} />
    <ClosetStack.Screen name="GuidedOrganizing" component={GuidedOrganizingScreen} options={{ title: 'Organize Setup' }} />
    <ClosetStack.Screen name="GuidedSnapshot" component={GuidedSnapshotScreen} options={{ title: 'Snapshot' }} />
    <ClosetStack.Screen name="ClosetHome" component={ClosetHomeScreen} options={{ headerTitle: brandedTitle('Closet') }} />
    <ClosetStack.Screen name="BeforeYouBuy" component={BeforeYouBuyScreen} options={{ title: 'Going Shopping' }} />
    <ClosetStack.Screen name="BrandSnapshot" component={BrandSnapshotScreen} options={{ title: 'Brand Snapshot' }} />
    <ClosetStack.Screen name="DropPrep" component={DropPrepScreen} options={{ headerTitle: brandedTitle('Drop Prep') }} />
    <ClosetStack.Screen name="PrintDupGroups" component={PrintDupGroupsScreen} options={{ title: 'Print Duplicates' }} />
    <ClosetStack.Screen name="DrawerScan" component={DrawerScanScreen} options={{ title: 'Drawer Scan' }} />
    <ClosetStack.Screen name="DrawerScanResults" component={DrawerScanResultsScreen} options={{ title: 'Scan Results' }} />
    <ClosetStack.Screen name="BatchAdd" component={BatchAddScreen} options={{ title: 'Batch Add' }} />
    <ClosetStack.Screen name="ItemsList" component={ItemsListScreen} options={{ title: 'Items' }} />
    <ClosetStack.Screen name="SellBin" component={SellBinScreen} options={{ title: 'Sell Bin' }} />
    <ClosetStack.Screen name="ProPaywall" component={ProPaywallScreen} options={{ title: 'Unlock Pro', presentation: 'modal' }} />
    {settings.developerModeEnabled ? <ClosetStack.Screen name="BstSaleDraftList" component={BstSaleDraftListScreen} options={{ title: 'BST Drafts' }} /> : null}
    {settings.developerModeEnabled ? <ClosetStack.Screen name="BstSaleDraftCreate" component={BstSaleDraftCreateScreen} options={{ title: 'New BST Draft' }} /> : null}
    {settings.developerModeEnabled ? <ClosetStack.Screen name="BstSaleDraftEditor" component={BstSaleDraftEditorScreen} options={{ title: 'Edit BST Draft' }} /> : null}
    {settings.developerModeEnabled ? <ClosetStack.Screen name="BstSaleDraftPreview" component={BstSaleDraftPreviewScreen} options={{ title: 'BST Preview + Save to Photos' }} /> : null}
    <ClosetStack.Screen name="CategorySnapshot" component={CategorySnapshotScreen} options={{ headerTitle: brandedTitle('Category Snapshot') }} />
    <ClosetStack.Screen name="OutfitsList" component={OutfitsListScreen} options={{ title: 'Outfits (Optional)' }} />
    <ClosetStack.Screen name="OutfitBuilder" component={OutfitBuilderScreen} options={{ title: 'Outfit Builder (Optional)' }} />
    <ClosetStack.Screen name="AddItem" component={ItemFormScreen} options={{ headerTitle: brandedTitle('Add / Edit Item') }} />
    <ClosetStack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Item Details' }} />
  </ClosetStack.Navigator>
  );
};

const WishlistStackNavigator = () => {
  const theme = useAppTheme();
  const brandedTitle = (title: string) => () => <BrandedHeaderTitle title={title} />;
  return (
    <WishlistStack.Navigator
      screenOptions={{
        headerTitleStyle: {
          fontFamily: theme.fonts.serif,
          fontSize: 20,
          fontWeight: '500',
        },
      }}
    >
      <WishlistStack.Screen
        name="ItemsList"
        component={ItemsListScreen}
        initialParams={{ initialStatus: 'wishlist', hideInbox: true }}
        options={{ headerTitle: brandedTitle('Wishlist') }}
      />
      <WishlistStack.Screen name="ProPaywall" component={ProPaywallScreen} options={{ title: 'Unlock Pro', presentation: 'modal' }} />
      <WishlistStack.Screen name="AddItem" component={ItemFormScreen} options={{ headerTitle: brandedTitle('Add / Edit Item') }} />
      <WishlistStack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Item Details' }} />
    </WishlistStack.Navigator>
  );
};

const KidsStackNavigator = () => {
  const theme = useAppTheme();
  return (
    <KidsStack.Navigator
      screenOptions={{
        headerTitleStyle: {
          fontFamily: theme.fonts.serif,
          fontSize: 20,
          fontWeight: '500',
        },
      }}
    >
      <KidsStack.Screen name="KidsList" component={KidsListScreen} options={{ title: 'Kids' }} />
      <KidsStack.Screen name="ChildDashboard" component={ChildDashboardScreen} options={{ title: 'Size-Up Dashboard' }} />
      <KidsStack.Screen name="KidForm" component={KidFormScreen} options={{ title: 'Add / Edit Kid' }} />
    </KidsStack.Navigator>
  );
};

const SettingsStackNavigator = () => {
  const theme = useAppTheme();
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerTitleStyle: {
          fontFamily: theme.fonts.serif,
          fontSize: 20,
          fontWeight: '500',
        },
      }}
    >
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'Settings' }} />
      <SettingsStack.Screen name="MissingPhotoRepair" component={MissingPhotoRepairScreen} options={{ title: 'Missing Photos' }} />
      <SettingsStack.Screen name="PrivacySummary" component={PrivacySummaryScreen} options={{ title: 'Privacy Summary' }} />
      <SettingsStack.Screen name="TermsSummary" component={TermsSummaryScreen} options={{ title: 'Terms Summary' }} />
      <SettingsStack.Screen name="TermsOfService" component={TermsOfServiceScreen} options={{ title: 'Terms of Service' }} />
      <SettingsStack.Screen name="ActivityLog" component={ActivityLogScreen} options={{ title: 'Activity Log' }} />
      <SettingsStack.Screen name="ActivitySnapshot" component={ActivitySnapshotScreen} options={{ title: 'Activity Snapshot' }} />
    </SettingsStack.Navigator>
  );
};

export const RootNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#111827',
      }}
    >
      <Tab.Screen name="Closet" component={ClosetStackNavigator} />
      <Tab.Screen name="Wishlist" component={WishlistStackNavigator} />
      <Tab.Screen name="Kids" component={KidsStackNavigator} />
      <Tab.Screen name="Settings" component={SettingsStackNavigator} />
    </Tab.Navigator>
  );
};
