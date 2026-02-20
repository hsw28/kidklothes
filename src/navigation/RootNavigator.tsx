import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ItemDetailScreen } from '@/screens/ItemDetailScreen';
import { ItemFormScreen } from '@/screens/ItemFormScreen';
import { ItemsListScreen } from '@/screens/ItemsListScreen';
import { KidFormScreen } from '@/screens/KidFormScreen';
import { KidsListScreen } from '@/screens/KidsListScreen';
import { OutfitBuilderScreen } from '@/screens/OutfitBuilderScreen';
import { OutfitsListScreen } from '@/screens/OutfitsListScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import {
  ItemsStackParamList,
  KidsStackParamList,
  OutfitsStackParamList,
  RootTabParamList,
  SettingsStackParamList,
} from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const ItemsStack = createNativeStackNavigator<ItemsStackParamList>();
const OutfitsStack = createNativeStackNavigator<OutfitsStackParamList>();
const KidsStack = createNativeStackNavigator<KidsStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const ItemsStackNavigator = () => (
  <ItemsStack.Navigator>
    <ItemsStack.Screen name="ItemsList" component={ItemsListScreen} options={{ title: 'Items' }} />
    <ItemsStack.Screen name="AddItem" component={ItemFormScreen} options={{ title: 'Add / Edit Item' }} />
    <ItemsStack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Item Details' }} />
  </ItemsStack.Navigator>
);

const OutfitsStackNavigator = () => (
  <OutfitsStack.Navigator>
    <OutfitsStack.Screen name="OutfitsList" component={OutfitsListScreen} options={{ title: 'Outfits' }} />
    <OutfitsStack.Screen name="OutfitBuilder" component={OutfitBuilderScreen} options={{ title: 'Outfit Builder' }} />
  </OutfitsStack.Navigator>
);

const KidsStackNavigator = () => (
  <KidsStack.Navigator>
    <KidsStack.Screen name="KidsList" component={KidsListScreen} options={{ title: 'Kids' }} />
    <KidsStack.Screen name="KidForm" component={KidFormScreen} options={{ title: 'Add / Edit Kid' }} />
  </KidsStack.Navigator>
);

const SettingsStackNavigator = () => (
  <SettingsStack.Navigator>
    <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'Settings' }} />
  </SettingsStack.Navigator>
);

export const RootNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#111827',
      }}
    >
      <Tab.Screen name="Items" component={ItemsStackNavigator} />
      <Tab.Screen name="Outfits" component={OutfitsStackNavigator} />
      <Tab.Screen name="Kids" component={KidsStackNavigator} />
      <Tab.Screen name="Settings" component={SettingsStackNavigator} />
    </Tab.Navigator>
  );
};
