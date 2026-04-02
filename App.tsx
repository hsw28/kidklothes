import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActionSheetIOS, Alert, AlertButton, Linking, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { PrimaryButton } from './src/components/PrimaryButton';
import { UndoToastHost } from './src/components/UndoToastHost';
import { DataProvider } from './src/db/DataContext';
import { linking } from './src/navigation/linking';
import { RootNavigator } from './src/navigation/RootNavigator';
import { registerPostHogClient } from './src/services/analytics/posthog';
import { useData } from './src/db/DataContext';
import { clearPendingSharePayload, getPendingSharePayload } from './src/utils/appGroupStorage';
import { isAppOwnedImageUri } from './src/utils/imageCache';
import { getItemDisplayImageUri, getItemLocalImageUri, getItemRemoteImageUri } from './src/utils/itemMedia';
import { extractUrlFromShareIntent, toAddItemDeepLink } from './src/utils/shareIntent';

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) {
      console.error('[AppErrorBoundary] startup failure', error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={appErrorStyles.safe}>
          <View style={appErrorStyles.card}>
            <Text style={appErrorStyles.title}>Layette Out couldn&apos;t start</Text>
            <Text style={appErrorStyles.body}>
              Please close and reopen the app. If this keeps happening, reinstalling the app should restore a clean local setup.
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const appErrorStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8F4EF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: '#EAE1D8',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F1A17',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#716A63',
  },
});

const isLocalLike = (value: string) => /^(file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/i.test(value);

const MissingPhotoRestoreNudge = () => {
  const { loading, items, settings, updateSettings } = useData();
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (hasPromptedRef.current) return;
    if (settings.missingPhotoRestoreNudgeShown) return;
    if (items.length === 0) {
      hasPromptedRef.current = true;
      void updateSettings({ missingPhotoRestoreNudgeShown: true });
      return;
    }

    let cancelled = false;
    hasPromptedRef.current = true;

    void (async () => {
      let hasMissingPhoto = false;
      for (const item of items) {
        const cached = (item.cachedImageUri ?? '').trim();
        const display = getItemDisplayImageUri(item);
        const remote = getItemRemoteImageUri(item);
        const local = getItemLocalImageUri(item);
        const localSources = [cached, ...(item.imageUrls ?? []), item.imageUrl ?? '']
          .map((value) => value.trim())
          .filter((value) => isLocalLike(value));
        const hasLocalSource = localSources.length > 0 || Boolean(local);
        const hasRemoteSource = Boolean(remote);

        let hasValidAppCopy = false;
        if (cached && isAppOwnedImageUri(cached) && /^file:\/\//i.test(cached)) {
          try {
            const info = await LegacyFileSystem.getInfoAsync(cached);
            hasValidAppCopy = Boolean(info.exists);
          } catch {
            hasValidAppCopy = false;
          }
        }

        const hasAnySource = hasLocalSource || hasRemoteSource;
        const hasAnyDisplay = Boolean(display);
        if (!hasValidAppCopy && (!hasAnyDisplay || hasAnySource)) {
          hasMissingPhoto = true;
          break;
        }
      }

      if (cancelled) return;
      await updateSettings({ missingPhotoRestoreNudgeShown: true });
      if (!hasMissingPhoto) return;

      Alert.alert(
        'Missing Photos',
        'If any older item photos look blank, go to Settings and tap Restore Missing Images.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              void ExpoLinking.openURL('layetteout://settings');
            },
          },
        ],
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [items, loading, settings.missingPhotoRestoreNudgeShown, updateSettings]);

  return null;
};

const AnalyticsRoot: React.FC<React.PropsWithChildren> = ({ children }) => {
  useEffect(() => {
    registerPostHogClient(null);
    return () => registerPostHogClient(null);
  }, []);

  return <>{children}</>;
};

const ShareToAppBridge = () => {
  const { children, settings } = useData();
  const handlingShareRef = useRef(false);
  const lastHandledUrlRef = useRef<string | null>(null);

  const openAddItemFromPayload = React.useCallback((input: {
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
      const buttons: AlertButton[] = [
        { text: 'Cancel', style: 'cancel', onPress: () => { handlingShareRef.current = false; } },
        ...children.map((child) => ({ text: child.name, onPress: () => openForChild(child.id) })),
      ];
      Alert.alert('Choose Child', 'Which kid is this for?', buttons);
      return;
    }

    openForChild(autoChildId);
  }, [children, settings.lastShoppingChildId]);

  const handleNativeShareIntentUrl = React.useCallback(async (incomingUrl: string) => {
    if (!incomingUrl.includes('://dataUrl=')) return false;
    if (lastHandledUrlRef.current === incomingUrl) return true;

    let moduleAny: any = null;
    let parseShareIntent: ((value: unknown, options?: { debug?: boolean }) => any) | null = null;
    try {
      // Keep the native share-intent module fully lazy so normal app startup
      // does not depend on it unless the app was actually opened from share.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      moduleAny = require('expo-share-intent/build/ExpoShareIntentModule').default;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      parseShareIntent = require('expo-share-intent/build/utils').parseShareIntent;
    } catch (error) {
      if (__DEV__) console.warn('[ShareToAppBridge] share-intent module unavailable', error);
      return false;
    }

    if (!moduleAny?.getShareIntent || !moduleAny?.addListener || !parseShareIntent) {
      return false;
    }

    lastHandledUrlRef.current = incomingUrl;
    handlingShareRef.current = true;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        handlingShareRef.current = false;
        changeSubscription?.remove?.();
        errorSubscription?.remove?.();
        void moduleAny?.clearShareIntent?.('layetteoutShareKey');
        resolve();
      };

      const changeSubscription = moduleAny.addListener('onChange', (event: { value?: string }) => {
        try {
          const parsed = parseShareIntent?.(event?.value, { debug: __DEV__ });
          const sharedUrl = extractUrlFromShareIntent(parsed);
          if (!sharedUrl) {
            Alert.alert('No Link Found', 'We could not find a web link in the shared content.');
            finish();
            return;
          }

          const sharedTitle = typeof parsed?.meta?.title === 'string' ? parsed.meta.title.trim() : '';
          const sharedSiteName = typeof parsed?.meta?.['og:site_name'] === 'string'
            ? parsed.meta['og:site_name'].trim()
            : typeof parsed?.meta?.site_name === 'string'
              ? parsed.meta.site_name.trim()
              : '';
          const sharedImageUrlRaw = typeof parsed?.meta?.['og:image'] === 'string'
            ? parsed.meta['og:image'].trim()
            : typeof parsed?.meta?.image === 'string'
              ? parsed.meta.image.trim()
              : '';
          const sharedImageUrl = /^https?:\/\//i.test(sharedImageUrlRaw)
            ? sharedImageUrlRaw
            : sharedImageUrlRaw.startsWith('//')
              ? `https:${sharedImageUrlRaw}`
              : '';

          const promptForDestination = () => {
            const openTarget = (destination: 'closet' | 'wishlist') => {
              const deepLink = toAddItemDeepLink(sharedUrl, { destination, source: 'shareext' });
              const urlObj = new URL(deepLink);
              if (sharedTitle) urlObj.searchParams.set('sharedTitle', sharedTitle);
              if (sharedImageUrl) urlObj.searchParams.set('sharedImageUrl', sharedImageUrl);
              if (sharedSiteName) urlObj.searchParams.set('sharedSiteName', sharedSiteName);
              ExpoLinking.openURL(urlObj.toString()).finally(finish);
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
                  finish();
                },
              );
              return;
            }

            Alert.alert('Add to Layette Out', sharedUrl, [
              { text: 'Cancel', style: 'cancel', onPress: finish },
              { text: 'Add to Closet', onPress: () => openTarget('closet') },
              { text: 'Add to Wishlist', onPress: () => openTarget('wishlist') },
            ]);
          };

          promptForDestination();
        } catch (error) {
          if (__DEV__) console.warn('[ShareToAppBridge] share-intent parse failed', error);
          finish();
        }
      });

      const errorSubscription = moduleAny.addListener('onError', (event: { value?: string }) => {
        if (__DEV__) console.warn('[ShareToAppBridge] native share-intent error', event?.value);
        finish();
      });

      try {
        moduleAny.getShareIntent(incomingUrl);
      } catch (error) {
        if (__DEV__) console.warn('[ShareToAppBridge] getShareIntent failed', error);
        finish();
      }

      setTimeout(finish, 2500);
    });

    return true;
  }, []);

  const handleShareRoute = React.useCallback(async (incomingUrl: string) => {
    try {
      const handledNativeShareIntent = await handleNativeShareIntentUrl(incomingUrl);
      if (handledNativeShareIntent) return true;

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
  }, [handleNativeShareIntentUrl, openAddItemFromPayload]);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      void handleShareRoute(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleShareRoute(url);
    });
    return () => sub.remove();
  }, [handleShareRoute]);

  return null;
};

const appBootStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8F4EF',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: '#EAE1D8',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F1A17',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#716A63',
  },
});

const AppBootstrapGate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { loading, errorMessage, refresh } = useData();
  const [didFinishInitialLoad, setDidFinishInitialLoad] = useState(false);

  useEffect(() => {
    if (!loading && !errorMessage) {
      setDidFinishInitialLoad(true);
    }
  }, [errorMessage, loading]);

  if (!didFinishInitialLoad && loading) {
    return (
      <SafeAreaView style={appBootStyles.safe}>
        <View style={appBootStyles.center}>
          <View style={appBootStyles.card}>
            <Text style={appBootStyles.title}>Opening Layette Out…</Text>
            <Text style={appBootStyles.body}>Loading your local closet data safely.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!didFinishInitialLoad && errorMessage) {
    return (
      <SafeAreaView style={appBootStyles.safe}>
        <View style={appBootStyles.center}>
          <View style={appBootStyles.card}>
            <Text style={appBootStyles.title}>Couldn’t Open Your Closet Yet</Text>
            <Text style={appBootStyles.body}>{errorMessage}</Text>
            <PrimaryButton label="Try Again" onPress={() => void refresh()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <AppErrorBoundary>
      <AnalyticsRoot>
        <DataProvider>
          <AppBootstrapGate>
            <NavigationContainer linking={linking}>
              <StatusBar style="dark" />
              <MissingPhotoRestoreNudge />
              <ShareToAppBridge />
              <RootNavigator />
              <UndoToastHost />
            </NavigationContainer>
          </AppBootstrapGate>
        </DataProvider>
      </AnalyticsRoot>
    </AppErrorBoundary>
  );
}
