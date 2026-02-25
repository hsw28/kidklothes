import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActionSheetIOS, Alert, AlertButton, Linking, Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { UndoToastHost } from './src/components/UndoToastHost';
import { DataProvider } from './src/db/DataContext';
import { linking } from './src/navigation/linking';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useData } from './src/db/DataContext';
import { clearPendingSharePayload, getPendingSharePayload } from './src/utils/appGroupStorage';
import { extractUrlFromShareIntent, toAddItemDeepLink } from './src/utils/shareIntent';

const ShareToAppBridge = () => {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { children, settings } = useData();
  const handlingShareRef = useRef(false);
  const lastHandledUrlRef = useRef<string | null>(null);

  const promptForDestination = (sharedUrl: string) => {
    const openTarget = (destination: 'closet' | 'wishlist') => {
      const deepLink = toAddItemDeepLink(sharedUrl, { destination, source: 'shareext' });
      ExpoLinking.openURL(deepLink).finally(() => {
        resetShareIntent();
        handlingShareRef.current = false;
      });
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Add to Layette Out',
          message: sharedUrl,
          options: ['Cancel', 'Add to Closet', 'Add to Wishlist'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) {
            openTarget('closet');
            return;
          }
          if (index === 2) {
            openTarget('wishlist');
            return;
          }
          resetShareIntent();
          handlingShareRef.current = false;
        },
      );
      return;
    }

    Alert.alert('Add to Layette Out', sharedUrl, [
      { text: 'Cancel', style: 'cancel', onPress: () => { resetShareIntent(); handlingShareRef.current = false; } },
      { text: 'Add to Closet', onPress: () => openTarget('closet') },
      { text: 'Add to Wishlist', onPress: () => openTarget('wishlist') },
    ]);
  };

  const openAddItemFromPayload = (input: {
    url: string;
    destination?: 'closet' | 'wishlist' | null;
    childMode?: 'auto' | 'choose';
  }) => {
    const finalStatus = input.destination === 'closet' ? 'owned' : 'wishlist';
    const lastUsedChildId = settings.lastShoppingChildId;
    const oneChildId = children.length === 1 ? children[0]?.id : undefined;
    const autoChildId = lastUsedChildId || oneChildId;

    const openForChild = (childId?: string) => {
      const deepLink = toAddItemDeepLink(input.url, {
        destination: input.destination === 'closet' ? 'closet' : 'wishlist',
        status: finalStatus,
        source: 'shareext',
      });
      const urlObj = new URL(deepLink);
      if (childId) urlObj.searchParams.set('prefillChildId', childId);
      ExpoLinking.openURL(urlObj.toString()).finally(() => {
        handlingShareRef.current = false;
      });
    };

    if (input.childMode === 'choose' && children.length > 0) {
      const options = ['Cancel', ...children.map((child) => child.name)];
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Choose Child',
            message: 'Which kid is this for?',
            options,
            cancelButtonIndex: 0,
          },
          (index) => {
            if (!index) {
              handlingShareRef.current = false;
              return;
            }
            const selected = children[index - 1];
            openForChild(selected?.id);
          },
        );
        return;
      }
      const buttons: AlertButton[] = [{ text: 'Cancel', style: 'cancel', onPress: () => { handlingShareRef.current = false; } }, ...children.map((child) => ({ text: child.name, onPress: () => openForChild(child.id) }))];
      Alert.alert(
        'Choose Child',
        'Which kid is this for?',
        buttons,
      );
      return;
    }

    openForChild(autoChildId);
  };

  const handleShareRoute = async (incomingUrl: string) => {
    try {
      const parsed = new URL(incomingUrl);
      const hostOrPath = `${parsed.host}${parsed.pathname}`;
      const looksLikeShareRoute =
        parsed.protocol.replace(':', '') === 'layetteout' &&
        (parsed.host === 'share' || parsed.pathname === '/share' || hostOrPath.endsWith('/share'));
      if (!looksLikeShareRoute) return false;

      if (lastHandledUrlRef.current === incomingUrl) return true;
      lastHandledUrlRef.current = incomingUrl;
      handlingShareRef.current = true;

      const payload = await getPendingSharePayload();
      await clearPendingSharePayload();
      if (!payload?.url) {
        handlingShareRef.current = false;
        if (__DEV__) console.warn('[ShareToAppBridge] /share opened without pending payload');
        return true;
      }
      openAddItemFromPayload({
        url: payload.url,
        destination: payload.destination ?? null,
        childMode: payload.childMode ?? 'auto',
      });
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      void handleShareRoute(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleShareRoute(url);
    });
    return () => sub.remove();
  }, [children, settings.lastShoppingChildId]);

  useEffect(() => {
    if (!hasShareIntent || handlingShareRef.current) return;

    const sharedUrl = extractUrlFromShareIntent(shareIntent as any);
    if (!sharedUrl) {
      if (__DEV__) console.warn('[ShareToAppBridge] share intent received without URL', shareIntent);
      Alert.alert('No Link Found', 'We could not find a web link in the shared content.');
      resetShareIntent();
      return;
    }

    handlingShareRef.current = true;
    promptForDestination(sharedUrl);
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
          <UndoToastHost />
        </NavigationContainer>
      </DataProvider>
    </ShareIntentProvider>
  );
}
