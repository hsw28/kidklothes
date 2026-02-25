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

const isSupportedImageUri = (value?: string | null) => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(https?:\/\/|file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/i.test(trimmed);
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
  const [isLoading, setIsLoading] = useState(Boolean(isSupportedImageUri(uri)));
  const [failed, setFailed] = useState(false);
  const imageOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setFailed(false);
    setIsLoading(Boolean(isSupportedImageUri(uri)));
    imageOpacity.setValue(0);
  }, [uri, imageOpacity]);

  const normalizedUri = useMemo(() => {
    if (!uri) return '';
    const trimmed = uri.trim();
    return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  }, [uri]);

  const showImage = isSupportedImageUri(normalizedUri) && !failed;
  const showPlaceholder = !showImage || isLoading;

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
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => {
            setIsLoading(false);
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
      {isLoading && showImage ? <View style={[styles.loadingVeil, { backgroundColor: theme.colors.surfaceMuted }]} /> : null}
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
