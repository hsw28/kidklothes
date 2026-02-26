import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ImageResizeMode, ImageStyle, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme';

type Props = {
  uri?: string | null;
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
  style,
  imageStyle,
  resizeMode = 'cover',
  fallbackLabel,
  accessibilityLabel,
}) => {
  const theme = useAppTheme();
  const [isLoading, setIsLoading] = useState(Boolean(isSupportedImageUri(uri) && isRemoteHttpUri(uri)));
  const [failed, setFailed] = useState(false);
  const imageOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setFailed(false);
    const supported = Boolean(isSupportedImageUri(uri));
    const remote = isRemoteHttpUri(uri);
    const normalized = (() => {
      if (!uri) return '';
      const trimmed = uri.trim();
      if (trimmed.startsWith('//')) return `https:${trimmed}`;
      if (trimmed.startsWith('/')) return `file://${trimmed}`;
      return trimmed;
    })();
    const alreadyLoaded = remote && normalized ? loadedRemoteImageUris.has(normalized) : false;
    setIsLoading(supported && remote && !alreadyLoaded);
    imageOpacity.setValue(supported ? (remote && !alreadyLoaded ? 0 : 1) : 0);
  }, [uri, imageOpacity]);

  const normalizedUri = useMemo(() => {
    if (!uri) return '';
    const trimmed = uri.trim();
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('/')) return `file://${trimmed}`;
    return trimmed;
  }, [uri]);
  const remoteAlreadyLoaded = isRemoteHttpUri(normalizedUri) && loadedRemoteImageUris.has(normalizedUri);

  const showImage = isSupportedImageUri(normalizedUri) && !failed;
  const isRemote = isRemoteHttpUri(normalizedUri);
  const showPlaceholder = !showImage || (isLoading && !remoteAlreadyLoaded);

  useEffect(() => {
    if (!isRemote) return;
    if (!normalizedUri) return;
    if (!loadedRemoteImageUris.has(normalizedUri)) return;
    setIsLoading(false);
    imageOpacity.setValue(1);
  }, [isRemote, normalizedUri, imageOpacity]);

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
          source={{ uri: normalizedUri }}
          resizeMode={resizeMode}
          style={[StyleSheet.absoluteFillObject, imageStyle, { opacity: imageOpacity }]}
          onLoadStart={() => {
            if (isRemote && !loadedRemoteImageUris.has(normalizedUri)) setIsLoading(true);
          }}
          onLoadEnd={() => {
            if (isRemote && normalizedUri) loadedRemoteImageUris.add(normalizedUri);
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
            setFailed(true);
            setIsLoading(false);
            imageOpacity.setValue(0);
            if (__DEV__) console.warn('[RemoteImage] failed to load', normalizedUri);
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
