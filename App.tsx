import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as ExpoLinking from 'expo-linking';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { DataProvider } from './src/db/DataContext';
import { linking } from './src/navigation/linking';
import { RootNavigator } from './src/navigation/RootNavigator';
import { extractUrlFromShareIntent, toAddItemDeepLink } from './src/utils/shareIntent';

const ShareToAppBridge = () => {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;

    const sharedUrl = extractUrlFromShareIntent(shareIntent as any);
    if (!sharedUrl) {
      resetShareIntent();
      return;
    }

    const deepLink = toAddItemDeepLink(sharedUrl);
    ExpoLinking.openURL(deepLink).finally(() => {
      resetShareIntent();
    });
  }, [hasShareIntent, resetShareIntent, shareIntent]);

  return null;
};

export default function App() {
  return (
    <ShareIntentProvider>
      <DataProvider>
        <NavigationContainer linking={linking}>
          <StatusBar style="dark" />
          <ShareToAppBridge />
          <RootNavigator />
        </NavigationContainer>
      </DataProvider>
    </ShareIntentProvider>
  );
}
