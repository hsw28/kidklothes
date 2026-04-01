import React, { useEffect, useRef } from 'react';
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
import { isAppOwnedImageUri } from './src/utils/imageCache';
import { getItemDisplayImageUri, getItemLocalImageUri, getItemRemoteImageUri } from './src/utils/itemMedia';

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

  if (loading) {
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

  if (errorMessage) {
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
              <RootNavigator />
              <UndoToastHost />
            </NavigationContainer>
          </AppBootstrapGate>
        </DataProvider>
      </AnalyticsRoot>
    </AppErrorBoundary>
  );
}
