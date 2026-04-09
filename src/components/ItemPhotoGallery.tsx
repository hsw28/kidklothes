import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { useAppTheme } from '@/theme';

type Props = {
  photoUris: string[];
  canAddMore: boolean;
  onAddPhoto: () => void;
  onLockedPress?: () => void;
  lockedJoined?: boolean;
  onMakePrimary: (index: number) => void;
  onRemove: (index: number) => void;
};

export const ItemPhotoGallery: React.FC<Props> = ({
  photoUris,
  canAddMore,
  onAddPhoto,
  onLockedPress,
  lockedJoined = false,
  onMakePrimary,
  onRemove,
}) => {
  const theme = useAppTheme();
  const mainScrollRef = useRef<ScrollView | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);

  useEffect(() => {
    if (photoUris.length === 0) {
      setSelectedIndex(0);
      return;
    }
    if (selectedIndex > photoUris.length - 1) {
      setSelectedIndex(photoUris.length - 1);
    }
  }, [photoUris.length, selectedIndex]);

  useEffect(() => {
    if (!carouselWidth || photoUris.length === 0) return;
    mainScrollRef.current?.scrollTo({ x: selectedIndex * carouselWidth, animated: false });
  }, [carouselWidth, photoUris.length, selectedIndex]);

  const currentUri = photoUris[selectedIndex];
  const imageHeight = useMemo(() => Math.max(260, Math.min(380, carouselWidth * 0.88 || 320)), [carouselWidth]);

  const styles = StyleSheet.create({
    shell: {
      gap: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    header: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    counter: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    mainViewport: {
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceMuted,
    },
    mainSlide: {
      backgroundColor: theme.colors.surfaceMuted,
    },
    mainImage: {
      width: '100%',
      height: imageHeight,
      backgroundColor: theme.colors.surfaceMuted,
    },
    emptyState: {
      height: 220,
      borderRadius: 22,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    emptyBody: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    actionText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.accentPeriwinkle,
    },
    removeText: {
      color: theme.colors.accentCoral,
    },
    thumbRow: {
      flexDirection: 'row',
      gap: 10,
      paddingRight: 4,
    },
    thumbButton: {
      width: 68,
      gap: 6,
    },
    thumbImage: {
      width: 68,
      height: 68,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
    },
    thumbSelected: {
      borderWidth: 2,
      borderColor: theme.colors.accentPeriwinkle,
    },
    thumbLabel: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      fontWeight: '600',
      textAlign: 'center',
    },
    addThumb: {
      width: 68,
      height: 68,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
    },
    addThumbText: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    lockedThumb: {
      width: 120,
      height: 68,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
      gap: 2,
    },
    lockedThumbText: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    lockedThumbSubtext: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
  });

  const onCarouselLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth && nextWidth !== carouselWidth) {
      setCarouselWidth(nextWidth);
    }
  };

  return (
    <View style={styles.shell}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Photos</Text>
        {photoUris.length ? <Text style={styles.counter}>{selectedIndex + 1}/{photoUris.length}</Text> : null}
      </View>

      {photoUris.length ? (
        <>
          <View style={styles.mainViewport} onLayout={onCarouselLayout}>
            <ScrollView
              ref={mainScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                if (!carouselWidth) return;
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
                setSelectedIndex(Math.max(0, Math.min(photoUris.length - 1, nextIndex)));
              }}
            >
              {photoUris.map((uri, index) => (
                <View key={`${uri}-${index}`} style={[styles.mainSlide, { width: carouselWidth || 1 }]}>
                  <RemoteImage uri={uri} style={styles.mainImage} fallbackLabel={`Photo ${index + 1}`} />
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.actionsRow}>
            {selectedIndex > 0 ? (
              <Pressable onPress={() => onMakePrimary(selectedIndex)}>
                <Text style={styles.actionText}>Use as Main Photo</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => onRemove(selectedIndex)}>
              <Text style={[styles.actionText, styles.removeText]}>Delete Photo</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {photoUris.map((uri, index) => (
              <Pressable
                key={`thumb-${uri}-${index}`}
                style={styles.thumbButton}
                onPress={() => {
                  setSelectedIndex(index);
                  if (carouselWidth) {
                    mainScrollRef.current?.scrollTo({ x: index * carouselWidth, animated: true });
                  }
                }}
              >
                <RemoteImage
                  uri={uri}
                  style={[styles.thumbImage, index === selectedIndex ? styles.thumbSelected : undefined]}
                  fallbackLabel={`${index + 1}`}
                />
                <Text style={styles.thumbLabel}>{`Photo ${index + 1}`}</Text>
              </Pressable>
            ))}

            {canAddMore ? (
              <Pressable style={styles.addThumb} onPress={onAddPhoto}>
                <Text style={styles.addThumbText}>+ Add Photo</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.lockedThumb} onPress={onLockedPress}>
                <Text style={styles.lockedThumbText}>Add more photos   Pro</Text>
              </Pressable>
            )}
          </ScrollView>
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Add a photo</Text>
          <Text style={styles.emptyBody}>Add your main photo first.</Text>
          <Pressable style={styles.addThumb} onPress={onAddPhoto}>
            <Text style={styles.addThumbText}>Add Photo</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};
