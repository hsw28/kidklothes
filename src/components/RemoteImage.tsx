import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ImageResizeMode, ImageStyle, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme';

type Props = {
  uri?: string | null;
  fallbackUri?: string | null;
  style: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  fallbackLabel?: string;
  accessibilityLabel?: string;
};

// Session-level cache of successfully loaded remote image URIs so rerenders/filter toggles
// can skip showing the loading placeholder again for the same thumbnail.
const loadedRemoteImageUris = new Set<string>();

const isSupportedImageUri = (value?: string | null) => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(https?:\/\/|file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/i.test(trimmed) || trimmed.startsWith('/');
};

const isRemoteHttpUri = (value?: string | null) => {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
};

const RemoteImageComponent: React.FC<Props> = ({
  uri,
  fallbackUri,
  style,
  imageStyle,
  resizeMode = 'cover',
  fallbackLabel,
  accessibilityLabel,
}) => {
  const theme = useAppTheme();
  const normalizeUri = (value?: string | null) => {
    if (!value) return '';
    const trimmed = value.trim();
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('/')) return `file://${trimmed}`;
    return trimmed;
  };
  const primaryUri = useMemo(() => normalizeUri(uri), [uri]);
  const normalizedFallbackUri = useMemo(() => normalizeUri(fallbackUri), [fallbackUri]);
  const [activeUri, setActiveUri] = useState(primaryUri);
  const [isLoading, setIsLoading] = useState(Boolean(isSupportedImageUri(primaryUri) && isRemoteHttpUri(primaryUri)));
  const [failed, setFailed] = useState(false);
  const imageOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setFailed(false);
    setActiveUri(primaryUri);
    const supported = Boolean(isSupportedImageUri(primaryUri));
    const remote = isRemoteHttpUri(primaryUri);
    const alreadyLoaded = remote && primaryUri ? loadedRemoteImageUris.has(primaryUri) : false;
    setIsLoading(supported && remote && !alreadyLoaded);
    imageOpacity.setValue(supported ? (remote && !alreadyLoaded ? 0 : 1) : 0);
  }, [primaryUri, imageOpacity]);

  const remoteAlreadyLoaded = isRemoteHttpUri(activeUri) && loadedRemoteImageUris.has(activeUri);

  const showImage = isSupportedImageUri(activeUri) && !failed;
  const isRemote = isRemoteHttpUri(activeUri);
  const showPlaceholder = !showImage || (isLoading && !remoteAlreadyLoaded);

  useEffect(() => {
    if (!isRemote) return;
    if (!activeUri) return;
    if (!loadedRemoteImageUris.has(activeUri)) return;
    setIsLoading(false);
    imageOpacity.setValue(1);
  }, [isRemote, activeUri, imageOpacity]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.placeholder,
          borderColor: theme.colors.border,
        },
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? (fallbackLabel ? `${fallbackLabel} image` : 'Item image')}
    >
      {showImage ? (
        <Animated.Image
          source={{ uri: activeUri }}
          resizeMode={resizeMode}
          style={[StyleSheet.absoluteFillObject, imageStyle, { opacity: imageOpacity }]}
          onLoadStart={() => {
            if (isRemote && !loadedRemoteImageUris.has(activeUri)) setIsLoading(true);
          }}
          onLoadEnd={() => {
            if (isRemote && activeUri) loadedRemoteImageUris.add(activeUri);
            setIsLoading(false);
            if (!isRemote) {
              imageOpacity.setValue(1);
              return;
            }
            Animated.timing(imageOpacity, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }}
          onError={() => {
            if (normalizedFallbackUri && normalizedFallbackUri !== activeUri) {
              setFailed(false);
              setActiveUri(normalizedFallbackUri);
              const fallbackRemote = isRemoteHttpUri(normalizedFallbackUri);
              const alreadyLoaded = fallbackRemote ? loadedRemoteImageUris.has(normalizedFallbackUri) : false;
              setIsLoading(fallbackRemote && !alreadyLoaded);
              imageOpacity.setValue(fallbackRemote && !alreadyLoaded ? 0 : 1);
              return;
            }
            setFailed(true);
            setIsLoading(false);
            imageOpacity.setValue(0);
            if (__DEV__) console.warn('[RemoteImage] failed to load', activeUri);
          }}
        />
      ) : null}
      {showPlaceholder ? (
        <View style={[styles.placeholder, { backgroundColor: theme.colors.placeholder }]}>
          <Text style={[styles.placeholderText, { color: theme.colors.textMuted }]}>
            {(fallbackLabel?.trim()?.[0] || '•').toUpperCase()}
          </Text>
        </View>
      ) : null}
      {isLoading && showImage && isRemote ? <View style={[styles.loadingVeil, { backgroundColor: theme.colors.surfaceMuted }]} /> : null}
    </View>
  );
};

export const RemoteImage = React.memo(RemoteImageComponent);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  loadingVeil: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
});
