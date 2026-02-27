import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { BetaKidLimitModal } from '@/components/BetaKidLimitModal';
import { ChipSelector } from '@/components/ChipSelector';
import { DraggableCategoryPrefsEditor } from '@/components/DraggableCategoryPrefsEditor';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { FormInput } from '@/components/FormInput';
import { RemoteImage } from '@/components/RemoteImage';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme';
import { isAdvancedUnlocked } from '@/utils/featureUnlock';
import {
  ClosetSizeMode,
  closetCategoryForItem,
  getDuplicatePrintGroups,
  getNewThisWeek,
  getOwnedItemsForChild,
  getSizeAnchors,
  getSizeUpsStash,
  getVisibleClosetCategories,
  topBrands,
} from '@/utils/closetViewInsights';
import { ClosetCategory, categoryGlyph, closetCategories, closetCategoryToClothingType, closetLabel, getCategoryEmptyMicrocopy, getConfiguredClosetCategories, sanitizeCategoryOrder, sanitizeHiddenCategories } from '@/utils/categories';
import { normalizePrintName } from '@/utils/printName';
import { normalizeStyleName } from '@/utils/styleName';
import { formatPieceCount } from '@/utils/formatCounts';
import { formatItemCategoryLabel, getBrandShortLabel } from '@/utils/itemLabels';
import { getItemDisplayImageUri } from '@/utils/itemMedia';
import { cacheRemoteImage } from '@/utils/imageCache';
import { showActionMenu } from '@/utils/actionSheets';
import { compareSizeLabels, getSizeChipTransitionOnTap, normalizeSizeLabel, uniqueSortedSizeEntries } from '@/utils/sizeOrder';
import { openKidLimitFeedbackEmail } from '@/utils/betaKidLimitFeedback';
import { getChildCurrentSizeText, getChildNextSizeText } from '@/utils/sizes';
import { buildEmptyCategoryLabel } from '@/utils/closetEmptyLabel';

type Props = NativeStackScreenProps<ClosetStackParamList, 'ClosetHome'>;

const sizeModeLabels: Record<ClosetSizeMode, string> = {
  now: 'Now',
  next: 'Next',
  both: 'All',
};

const sizeModeToSelection = (mode: ClosetSizeMode): { now: boolean; next: boolean } => ({
  now: mode === 'now' || mode === 'both',
  next: mode === 'next' || mode === 'both',
});

const selectionToSizeMode = (selection: { now: boolean; next: boolean }, fallback: ClosetSizeMode): ClosetSizeMode => {
  if (selection.now && selection.next) return 'both';
  if (selection.now) return 'now';
  if (selection.next) return 'next';
  return fallback;
};
const FEATURE_SINGLE_RECENT = false;
const CLOSET_GRID_COLUMNS = 2;

type TileProps = {
  category: ClosetCategory;
  count: number;
  thumbs: string[];
  emptyLabel?: string;
  hasUps: boolean;
  hasDupes: boolean;
  hasStyleDupes: boolean;
  activeBrandLabel?: string;
  activeBrandName?: string;
  onPress: () => void;
  onLongPress?: () => void;
  isReorderMode?: boolean;
  panHandlers?: any;
  onTileLayout?: (category: ClosetCategory, x: number, y: number, width: number, height: number) => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
};

const ClosetTileComponent: React.FC<TileProps> = ({
  category,
  count,
  thumbs,
  emptyLabel,
  hasUps,
  hasDupes,
  hasStyleDupes,
  activeBrandLabel,
  activeBrandName,
  onPress,
  onLongPress,
  isReorderMode = false,
  panHandlers,
  onTileLayout,
  canMoveLeft = false,
  canMoveRight = false,
  canMoveUp = false,
  canMoveDown = false,
  onMoveLeft,
  onMoveRight,
  onMoveUp,
  onMoveDown,
}) => {
  const theme = useAppTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const tileOpacity = useRef(new Animated.Value(1)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const hasBadge = hasUps || hasDupes || hasStyleDupes;
  const heroImages = thumbs.filter(Boolean);
  const [heroWidth, setHeroWidth] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const heroDidDragRef = useRef(false);
  const extraCount = Math.max(0, count - 1);
  const countLabel = String(count);

  React.useEffect(() => {
    Animated.timing(badgeOpacity, {
      toValue: hasBadge ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [badgeOpacity, hasBadge]);

  const pressIn = () => {
    if (isReorderMode) return;
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 0.98,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.timing(tileOpacity, {
        toValue: 0.94,
        duration: 110,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const pressOut = () => {
    if (isReorderMode) return;
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.timing(tileOpacity, {
        toValue: 1,
        duration: 110,
        useNativeDriver: true,
      }),
    ]).start();
  };




  const styles = StyleSheet.create({
    tileShell: {
      width: '48%',
      transform: [{ scale }],
      opacity: tileOpacity,
    },
    tile: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.tile,
      padding: 15,
      gap: 12,
      minHeight: 198,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
      ...(isReorderMode
        ? {
            borderColor: theme.colors.accentPeriwinkleSoft,
            shadowOpacity: 0.1,
          }
        : null),
    },
    badges: {
      position: 'absolute',
      top: 10,
      right: 10,
      gap: 6,
      alignItems: 'flex-end',
    },
    badge: {
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    heroWrap: {
      height: 96,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    heroMatte: {
      position: 'absolute',
      inset: 6,
      borderRadius: 12,
      backgroundColor: theme.isDark ? '#34343A' : '#FFFBF7',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(31,26,23,0.04)',
      overflow: 'hidden',
    },
    heroPager: {
      width: '100%',
      height: '100%',
    },
    heroImage: {
      height: '100%',
      backgroundColor: theme.colors.placeholder,
    },
    heroPage: {
      height: '100%',
    },
    heroPlaceholderStackBack: {
      position: 'absolute',
      width: '72%',
      height: '62%',
      borderRadius: 12,
      backgroundColor: theme.isDark ? '#3A3A40' : '#F0E8E0',
      transform: [{ translateY: -6 }, { rotate: '-4deg' }],
      opacity: 0.55,
    },
    heroPlaceholderStackFront: {
      width: '74%',
      height: '64%',
      borderRadius: 12,
      backgroundColor: theme.colors.placeholder,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    heroPlaceholderGlyph: {
      color: theme.colors.textSecondary,
      opacity: 0.9,
    },
    heroPlaceholderCopy: {
      marginTop: 6,
      fontSize: 10,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    stackBadge: {
      position: 'absolute',
      left: 8,
      bottom: 8,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: theme.colors.accentSecondarySoft,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(31,26,23,0.05)',
    },
    stackBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    reorderBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      zIndex: 2,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    reorderBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      letterSpacing: 0.3,
    },
    reorderControls: {
      position: 'absolute',
      top: 8,
      right: 8,
      zIndex: 3,
      flexDirection: 'row',
      flexWrap: 'wrap',
      width: 58,
      gap: 4,
      justifyContent: 'center',
    },
    reorderCtrlBtn: {
      width: 27,
      height: 24,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reorderCtrlBtnDisabled: {
      opacity: 0.35,
    },
    reorderCtrlTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      lineHeight: 14,
    },
    heroDots: {
      position: 'absolute',
      alignSelf: 'center',
      bottom: 8,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.isDark ? 'rgba(28,28,30,0.45)' : 'rgba(255,255,255,0.65)',
    },
    heroDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.35)' : 'rgba(17,24,39,0.2)',
    },
    heroDotActive: {
      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.9)' : 'rgba(17,24,39,0.75)',
      width: 12,
    },
    heroChevron: {
      position: 'absolute',
      right: 8,
      top: '50%',
      marginTop: -10,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.isDark ? 'rgba(28,28,30,0.45)' : 'rgba(255,255,255,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroChevronText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      marginLeft: 1,
    },
    brandChip: {
      position: 'absolute',
      top: 10,
      left: 10,
      minHeight: 24,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: theme.isDark ? 'rgba(42,42,46,0.88)' : 'rgba(255,255,255,0.88)',
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(17,24,39,0.05)',
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1,
      justifyContent: 'center',
    },
    brandChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    label: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    count: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
  });

  return (
    <Animated.View style={styles.tileShell} {...(isReorderMode ? panHandlers : {})}>
      <Pressable
        pointerEvents="auto"
        onPress={() => {
          if (isReorderMode) return;
          if (heroDidDragRef.current) {
            heroDidDragRef.current = false;
            return;
          }
          onPress();
        }}
        onLongPress={() => { if (isReorderMode) return; onLongPress?.(); }}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isReorderMode}
        style={styles.tile}
        onLayout={(event) => {
          const { x, y, width, height } = event.nativeEvent.layout;
          onTileLayout?.(category, x, y, width, height);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${closetLabel[category]} category, ${formatPieceCount(count)}`}
      >
        {isReorderMode ? (
          <View style={styles.reorderBadge}>
            <Text style={styles.reorderBadgeText}>Move</Text>
          </View>
        ) : null}
        {isReorderMode ? (
          <View style={styles.reorderControls}>
            <Pressable
              onPress={onMoveUp}
              disabled={!canMoveUp}
              style={[styles.reorderCtrlBtn, !canMoveUp ? styles.reorderCtrlBtnDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel={`Move ${closetLabel[category]} up`}
            >
              <Text style={styles.reorderCtrlTxt}>↑</Text>
            </Pressable>
            <Pressable
              onPress={onMoveLeft}
              disabled={!canMoveLeft}
              style={[styles.reorderCtrlBtn, !canMoveLeft ? styles.reorderCtrlBtnDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel={`Move ${closetLabel[category]} left`}
            >
              <Text style={styles.reorderCtrlTxt}>←</Text>
            </Pressable>
            <Pressable
              onPress={onMoveRight}
              disabled={!canMoveRight}
              style={[styles.reorderCtrlBtn, !canMoveRight ? styles.reorderCtrlBtnDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel={`Move ${closetLabel[category]} right`}
            >
              <Text style={styles.reorderCtrlTxt}>→</Text>
            </Pressable>
            <Pressable
              onPress={onMoveDown}
              disabled={!canMoveDown}
              style={[styles.reorderCtrlBtn, !canMoveDown ? styles.reorderCtrlBtnDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel={`Move ${closetLabel[category]} down`}
            >
              <Text style={styles.reorderCtrlTxt}>↓</Text>
            </Pressable>
          </View>
        ) : null}
        <Animated.View style={[styles.badges, { opacity: badgeOpacity }]}>
          {hasDupes ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.accentPeriwinkleSoft }]}>
              <Text style={[styles.badgeText, { color: theme.colors.accentPeriwinkle }]}>Dup prints</Text>
            </View>
          ) : null}
          {hasStyleDupes ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.accentCoralSoft }]}>
              <Text style={[styles.badgeText, { color: theme.colors.accentCoral }]}>Dup styles</Text>
            </View>
          ) : null}
          {hasUps ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.accentSageSoft }]}>
              <Text style={[styles.badgeText, { color: theme.colors.accentSage }]}>Size-ups</Text>
            </View>
          ) : null}
        </Animated.View>
        <View
          style={styles.heroWrap}
          onStartShouldSetResponderCapture={() => false}
          onMoveShouldSetResponderCapture={() => false}
          onLayout={(event) => {
            const nextWidth = Math.round(event.nativeEvent.layout.width);
            if (nextWidth && nextWidth !== heroWidth) setHeroWidth(nextWidth);
          }}
        >
          <View style={styles.heroMatte} pointerEvents="none" />
          {heroImages.length > 0 ? (
            isReorderMode ? (
              <View style={[styles.heroPage, heroWidth ? { width: heroWidth } : { width: '100%' }]}>
                <RemoteImage
                  uri={heroImages[0]}
                  style={[styles.heroImage, heroWidth ? { width: heroWidth } : { width: '100%' }]}
                  fallbackLabel={closetLabel[category]}
                />
              </View>
            ) : (
            <FlatList
              data={heroImages}
              keyExtractor={(uri, index) => `${category}-${uri}-${index}`}
              horizontal
              pagingEnabled
              initialNumToRender={1}
              windowSize={3}
              maxToRenderPerBatch={2}
              removeClippedSubviews
              nestedScrollEnabled
              directionalLockEnabled
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={false}
              style={styles.heroPager}
              scrollEnabled={!isReorderMode && heroImages.length > 1}
              onTouchStart={() => { heroDidDragRef.current = false; }}
              onScrollBeginDrag={() => { heroDidDragRef.current = true; }}
              onMomentumScrollEnd={(event) => {
                const width = heroWidth || event.nativeEvent.layoutMeasurement.width || 1;
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
                if (nextIndex !== heroIndex) setHeroIndex(nextIndex);
              }}
              renderItem={({ item }) => (
                <View style={[styles.heroPage, heroWidth ? { width: heroWidth } : { width: '100%' }]}>
                  <RemoteImage
                    uri={item}
                    style={[styles.heroImage, heroWidth ? { width: heroWidth } : { width: '100%' }]}
                    fallbackLabel={closetLabel[category]}
                  />
                </View>
              )}
            />
            )
          ) : (
            <>
              <View style={styles.heroPlaceholderStackBack} />
              <View style={styles.heroPlaceholderStackFront}>
                <Text style={styles.heroPlaceholderGlyph}>{categoryGlyph[category]}</Text>
                <Text numberOfLines={2} style={styles.heroPlaceholderCopy}>{emptyLabel || getCategoryEmptyMicrocopy(category, count)}</Text>
              </View>
            </>
          )}
          {heroImages.length > 1 && !isReorderMode ? (
            <>
              <View style={styles.heroDots} pointerEvents="none">
                {heroImages.slice(0, 5).map((_, index) => (
                  <View key={`${category}-dot-${index}`} style={[styles.heroDot, index === heroIndex ? styles.heroDotActive : null]} />
                ))}
              </View>
              <View style={styles.heroChevron} pointerEvents="none">
                <Text style={styles.heroChevronText}>›</Text>
              </View>
            </>
          ) : null}
          {activeBrandLabel ? (
            <View
              style={styles.brandChip}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`Filtered by brand ${activeBrandName || activeBrandLabel}`}
            >
              <Text style={styles.brandChipText} numberOfLines={1}>{activeBrandLabel}</Text>
            </View>
          ) : null}
          {extraCount > 0 ? (
            <View style={styles.stackBadge}>
              <Text style={styles.stackBadgeText}>+{extraCount}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.label}>{closetLabel[category]}</Text>
        <Text style={styles.count}>{countLabel}</Text>
      </Pressable>
    </Animated.View>
  );
};

const shallowEqualThumbs = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const ClosetTile = React.memo(ClosetTileComponent, (prev, next) =>
  prev.category === next.category
  && prev.count === next.count
  && prev.emptyLabel === next.emptyLabel
  && prev.hasUps === next.hasUps
  && prev.hasDupes === next.hasDupes
  && prev.hasStyleDupes === next.hasStyleDupes
  && prev.activeBrandLabel === next.activeBrandLabel
  && prev.activeBrandName === next.activeBrandName
  && prev.onPress === next.onPress
  && prev.onLongPress === next.onLongPress
  && prev.isReorderMode === next.isReorderMode
  && prev.panHandlers === next.panHandlers
  && prev.onTileLayout === next.onTileLayout
  && prev.canMoveLeft === next.canMoveLeft
  && prev.canMoveRight === next.canMoveRight
  && prev.canMoveUp === next.canMoveUp
  && prev.canMoveDown === next.canMoveDown
  && prev.onMoveLeft === next.onMoveLeft
  && prev.onMoveRight === next.onMoveRight
  && prev.onMoveUp === next.onMoveUp
  && prev.onMoveDown === next.onMoveDown
  && shallowEqualThumbs(prev.thumbs, next.thumbs),
);

type RecentlyAddedItemCardProps = {
  id: string;
  title: string;
  size: string;
  thumb?: string;
  onPress: (itemId: string) => void;
};

const RecentlyAddedItemCardComponent: React.FC<RecentlyAddedItemCardProps> = ({ id, title, size, thumb, onPress }) => {
  const theme = useAppTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);
  const localStyles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          width: 128,
          gap: 8,
          backgroundColor: theme.colors.surface,
          borderRadius: 16,
          padding: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        thumb: {
          width: '100%',
          height: 84,
          borderRadius: 10,
          backgroundColor: theme.colors.placeholder,
        },
        title: {
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.textPrimary,
        },
        meta: {
          fontSize: 12,
          color: theme.colors.textSecondary,
        },
      }),
    [theme.colors.border, theme.colors.placeholder, theme.colors.surface, theme.colors.textPrimary, theme.colors.textSecondary],
  );
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
    <Pressable
      style={({ pressed }) => [
        localStyles.card,
        pressed ? { opacity: 0.94, backgroundColor: theme.colors.surfaceMuted } : null,
      ]}
      onPress={() => onPress(id)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, size ${size || 'unknown'}`}
    >
      <RemoteImage uri={thumb} style={localStyles.thumb} fallbackLabel={title} />
      <Text numberOfLines={1} style={localStyles.title}>{title}</Text>
      <Text numberOfLines={1} style={localStyles.meta}>{size || 'N/A'}</Text>
    </Pressable>
    </Animated.View>
  );
};

const RecentlyAddedItemCard = React.memo(RecentlyAddedItemCardComponent);

export const ClosetHomeScreen: React.FC<Props> = ({ navigation, route }) => {
  const { children, items, childItems, storageLocations, settings, logEvent, updateChild, updateSettings, canCreateAnotherKid, updateItemCachedImage } = useData();
  const [childId, setChildId] = useState(children[0]?.id ?? '');
  const [sizeMode, setSizeMode] = useState<ClosetSizeMode>('now');
  const [selectedSizeChip, setSelectedSizeChip] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string>('All');
  const [seasonFilter, setSeasonFilter] = useState<string>('All');
  const [closetSearch, setClosetSearch] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [showCategoryLayoutEditor, setShowCategoryLayoutEditor] = useState(false);
  const [showTileGridReorderMode, setShowTileGridReorderMode] = useState(false);
  const [tileGridOrder, setTileGridOrder] = useState<ClosetCategory[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showStash, setShowStash] = useState(false);
  const [showDupes, setShowDupes] = useState(false);
  const [showStyleDupesList, setShowStyleDupesList] = useState(false);
  const [showModesModal, setShowModesModal] = useState(false);
  const [showFirstKidAddedHint, setShowFirstKidAddedHint] = useState(false);
  const hasAutoPromptedGuidedRef = useRef(false);
  const sizeModeOverridesRef = useRef<Record<string, ClosetSizeMode>>({});
  const lastDefaultedChildRef = useRef<string>('');
  const loggedBrandChangeRef = useRef(false);
  const loggedSeasonChangeRef = useRef(false);
  const tileOrderRef = useRef<ClosetCategory[]>([]);
  const tileLayoutsRef = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const tileDragStateRef = useRef<{ category: ClosetCategory } | null>(null);
  const tilePanRespondersRef = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const theme = useAppTheme();
  const renderDebugRef = useRef<{ count: number; windowStart: number }>({ count: 0, windowStart: Date.now() });
  const [showKidLimitModal, setShowKidLimitModal] = useState(false);
  const [kidLimitCurrentCount, setKidLimitCurrentCount] = useState(children.length);

  const openAddKidFromEmptyState = useCallback(async () => {
    const result = await canCreateAnotherKid();
    if (!result.ok) {
      setKidLimitCurrentCount(result.current);
      setShowKidLimitModal(true);
      return;
    }
    (navigation.getParent() as any)?.navigate('Kids', { screen: 'KidForm', params: { returnToClosetAfterCreate: true } });
  }, [canCreateAnotherKid, navigation]);

  const advancedUnlocked = isAdvancedUnlocked(settings, children, childItems, items);
  const selectedChild = children.find((child) => child.id === childId) ?? children[0];

  useEffect(() => {
    if (!__DEV__ || !settings.developerModeEnabled) return;
    const now = Date.now();
    const windowMs = 3000;
    if (now - renderDebugRef.current.windowStart > windowMs) {
      renderDebugRef.current = { count: 1, windowStart: now };
      return;
    }
    renderDebugRef.current.count += 1;
    if (renderDebugRef.current.count === 12) {
      console.warn('[ClosetHomeScreen] high render count in short window', {
        childId: selectedChild?.id ?? null,
        sizeMode,
        brandId,
        seasonFilter,
      });
    }
  });

  useEffect(() => {
    if (!selectedChild) return;
    const override = sizeModeOverridesRef.current[selectedChild.id];
    const defaultMode: ClosetSizeMode = selectedChild.usesMixedSizes ? 'both' : 'now';
    if (override) {
      if (sizeMode !== override) setSizeMode(override);
      lastDefaultedChildRef.current = selectedChild.id;
      return;
    }
    if (lastDefaultedChildRef.current !== selectedChild.id || sizeMode !== defaultMode) {
      setSizeMode(defaultMode);
      lastDefaultedChildRef.current = selectedChild.id;
    }
  }, [selectedChild?.id, selectedChild?.usesMixedSizes]);

  useEffect(() => {
    setSelectedSizeChip(null);
  }, [selectedChild?.id]);

  const styles = StyleSheet.create({
    headerTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    headerTagline: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: -4,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 16,
    },
    sectionToggle: {
      fontSize: 18,
      fontWeight: '500',
      color: theme.colors.textPrimary,
    },
    horizontalWrap: {
      gap: 10,
      marginTop: 8,
    },
    horizontalCard: {
      borderRadius: 16,
      padding: 12,
      backgroundColor: theme.isDark ? '#34343A' : '#F8FAFB',
    },
    horizontalTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    meta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    duplicateLinkRow: {
      minHeight: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    duplicateLinkText: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.textPrimary,
      fontWeight: '600',
    },
    duplicateLinkChevron: {
      fontSize: 14,
      color: theme.colors.accentPeriwinkle,
      fontWeight: '700',
    },
    headerAction: {
      color: theme.colors.accentPeriwinkle,
      fontSize: 14,
      fontWeight: '700',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(17,24,39,0.28)',
      justifyContent: 'flex-end',
      padding: 16,
    },
    modalCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      padding: 16,
      gap: 10,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    filtersToggle: {
      borderRadius: 999,
      backgroundColor: theme.colors.card,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 40,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.03,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    filtersToggleLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    filtersSummary: {
      flex: 1,
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    chipScroller: {
      marginHorizontal: -4,
    },
    chipRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 4,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: theme.colors.chipBg,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1,
    },
    filterChipActive: {
      backgroundColor: theme.colors.accentCoralSoft,
    },
    filterChipSeasonActive: {
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    filterChipTextActiveCoral: {
      color: theme.colors.accentCoral,
    },
    filterChipTextActivePeriwinkle: {
      color: theme.colors.accentPeriwinkle,
    },
    screenContent: {
      paddingBottom: 96,
    },
    topBrandRowWrap: {
      gap: 8,
      marginTop: -2,
    },
    topBrandHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    sizeToggleWrap: {
      gap: 8,
      marginTop: 2,
    },
    sizeToggleRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    sizeToggleChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: theme.colors.chipBg,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    sizeToggleChipActive: {
      backgroundColor: theme.colors.accentPrimarySoft,
      borderColor: theme.colors.accentPrimary,
    },
    sizeToggleChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    sizeToggleChipTextActive: {
      color: theme.colors.textPrimary,
    },
    topBrandLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    topBrandModeText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    topBrandChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.chipBg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topBrandChipActive: {
      backgroundColor: theme.colors.accentPrimarySoft,
      borderColor: theme.colors.accentPrimary,
    },
    topBrandChipMore: {
      backgroundColor: theme.colors.surfaceMuted,
    },
    topBrandChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    topBrandChipTextActive: {
      color: theme.colors.textPrimary,
    },
    recentHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    recentStripTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    recentSeeAll: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.accentPeriwinkle,
    },
    recentStripRow: {
      flexDirection: 'row',
      gap: 10,
      paddingRight: 12,
    },
    recentStripCard: {
      width: 128,
      borderRadius: 14,
      padding: 8,
      gap: 5,
      backgroundColor: theme.isDark ? '#34343A' : '#F8FAFB',
    },
    recentStripScroller: {
      marginRight: -6,
    },
    recentStripThumb: {
      width: '100%',
      height: 78,
      borderRadius: 10,
      backgroundColor: theme.colors.chipBg,
    },
    recentStripThumbPlaceholder: {
      width: '100%',
      height: 78,
      borderRadius: 10,
      backgroundColor: theme.colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recentStripItemTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    recentStripItemMeta: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    singleRecentWrap: {
      alignItems: 'center',
    },
    singleRecentCard: {
      width: '78%',
      borderRadius: 16,
      padding: 10,
      gap: 6,
      backgroundColor: theme.isDark ? '#34343A' : '#F8FAFB',
      position: 'relative',
    },
    singleRecentThumb: {
      width: '100%',
      height: 104,
      borderRadius: 12,
      backgroundColor: theme.colors.chipBg,
    },
    singleRecentThumbPlaceholder: {
      width: '100%',
      height: 104,
      borderRadius: 12,
      backgroundColor: theme.colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    singleRecentBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      zIndex: 2,
      borderRadius: 999,
      backgroundColor: theme.colors.accentSecondarySoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(31,26,23,0.05)',
    },
    singleRecentBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    emptyCard: {
      gap: 10,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    actionsBlock: {
      gap: 10,
    },
    actionsTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    actionsPrimaryWrap: {
      gap: 4,
    },
    actionsPrimarySubtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginLeft: 4,
    },
    secondaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 12,
    },
    actionCard: {
      width: '48%',
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.colors.card,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
      minHeight: 66,
      justifyContent: 'center',
      gap: 4,
    },
    actionCardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    actionCardMeta: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Pressable onPress={() => selectedChild && navigation.navigate('DropPrep', { childId: selectedChild.id })}>
            <Text style={styles.headerAction}>Drop Prep</Text>
          </Pressable>
          <Pressable onPress={() => setShowModesModal(true)}>
            <Text style={styles.headerAction}>Today</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, styles.headerAction, selectedChild?.id]);

  useEffect(() => {
    if (!settings.guidedOnboardingCompleted) return;
    hasAutoPromptedGuidedRef.current = true;
  }, [settings.guidedOnboardingCompleted]);

  useEffect(() => {
    if (!route.params?.showFirstKidAddedHint) return;
    setShowFirstKidAddedHint(true);
    navigation.setParams({ showFirstKidAddedHint: undefined });
    const timer = setTimeout(() => setShowFirstKidAddedHint(false), 4200);
    return () => clearTimeout(timer);
  }, [navigation, route.params?.showFirstKidAddedHint]);
  const visibleCategories = useMemo(() => {
    const globallyVisible = getConfiguredClosetCategories(settings);
    const childVisible = new Set(getVisibleClosetCategories(selectedChild));
    return globallyVisible.filter((category) => childVisible.has(category));
  }, [selectedChild, settings]);
  const closetCategoryOrderForEdit = useMemo(
    () => sanitizeCategoryOrder(settings.closetCategoryOrder, { includeOther: true, fallback: closetCategories }),
    [settings.closetCategoryOrder],
  );
  const hiddenClosetCategoriesForEdit = useMemo(
    () => new Set(sanitizeHiddenCategories(settings.hiddenClosetCategoriesGlobal, { includeOther: true })),
    [settings.hiddenClosetCategoriesGlobal],
  );
  useEffect(() => {
    if (showTileGridReorderMode) return;
    setTileGridOrder(visibleCategories);
    tileOrderRef.current = visibleCategories;
  }, [visibleCategories, showTileGridReorderMode]);
  useEffect(() => {
    if (!showTileGridReorderMode) return;
    // Rebuild responders when entering reorder mode so gesture callbacks use fresh state.
    tilePanRespondersRef.current = {};
  }, [showTileGridReorderMode, visibleCategories]);

  const ownedItems = useMemo(() => {
    if (!selectedChild) return [];
    return getOwnedItemsForChild(selectedChild.id, items, childItems);
  }, [selectedChild, items, childItems]);
  const sizeAnchors = useMemo(() => getSizeAnchors(ownedItems, selectedChild), [ownedItems, selectedChild]);

  const normalize = (value: string) => value.toLowerCase().trim();
  const currentSizeLabel = getChildCurrentSizeText(selectedChild);
  const nextSizeLabel = getChildNextSizeText(selectedChild);
  const currentSizeNormalized = normalizeSizeLabel(currentSizeLabel || '');
  const nextSizeNormalized = normalizeSizeLabel(nextSizeLabel || '');

  const activeSizeEntries = useMemo(
    () => uniqueSortedSizeEntries([currentSizeLabel, nextSizeLabel]),
    [currentSizeLabel, nextSizeLabel],
  );

  const presentSizeEntries = useMemo(
    () => uniqueSortedSizeEntries(ownedItems.map((item) => item.sizeNormalized || item.size)),
    [ownedItems],
  );

  const visibleSizeChipEntries = useMemo(() => {
    if (sizeMode === 'both') return presentSizeEntries;
    return activeSizeEntries.length > 0 ? activeSizeEntries : presentSizeEntries;
  }, [sizeMode, activeSizeEntries, presentSizeEntries]);

  const activeSizesNormalized = useMemo(() => activeSizeEntries.map((entry) => entry.normalized), [activeSizeEntries]);
  const activeSizesNormalizedSet = useMemo(() => new Set(activeSizesNormalized), [activeSizesNormalized]);

  const itemSizeKey = useCallback((item: (typeof ownedItems)[number]) => normalizeSizeLabel(item.sizeNormalized || item.size || ''), []);

  const matchesSizeMode = useCallback((item: (typeof ownedItems)[number]) => {
    const itemSize = itemSizeKey(item);
    if (!itemSize) return sizeMode === 'both' && !selectedSizeChip;

    if (selectedSizeChip) return itemSize === selectedSizeChip;

    if (sizeMode === 'both') return true;

    if (sizeMode === 'now') {
      if (item.fitBin) return item.fitBin === 'current';
      if (selectedChild?.usesMixedSizes && activeSizesNormalizedSet.size > 0) {
        return activeSizesNormalizedSet.has(itemSize);
      }
      return Boolean(currentSizeNormalized && itemSize === currentSizeNormalized);
    }

    if (item.fitBin) return item.fitBin === 'next';
    return Boolean(nextSizeNormalized && itemSize === nextSizeNormalized);
  }, [itemSizeKey, sizeMode, selectedSizeChip, selectedChild?.usesMixedSizes, activeSizesNormalizedSet, currentSizeNormalized, nextSizeNormalized]);

  useEffect(() => {
    if (!selectedSizeChip) return;
    const allowed = new Set([...presentSizeEntries, ...activeSizeEntries].map((entry) => entry.normalized));
    if (!allowed.has(selectedSizeChip)) setSelectedSizeChip(null);
  }, [selectedSizeChip, presentSizeEntries, activeSizeEntries]);

  useEffect(() => {
    if (sizeMode === 'now') {
      setSelectedSizeChip(currentSizeNormalized || null);
      return;
    }
    if (sizeMode === 'next') {
      setSelectedSizeChip(nextSizeNormalized || null);
    }
  }, [sizeMode, currentSizeNormalized, nextSizeNormalized]);

  const matchesBrand = (item: (typeof ownedItems)[number], selectedBrand: string) => {
    if (selectedBrand === 'All') return true;
    if ((item.brand ?? '').toLowerCase().trim() === selectedBrand.toLowerCase().trim()) return true;
    return item.brandTags.some((tag) => tag.toLowerCase().trim() === selectedBrand.toLowerCase().trim());
  };
  const matchesSeason = (item: (typeof ownedItems)[number], selectedSeason: string) => {
    if (selectedSeason === 'All') return true;
    return item.seasonTags.some((tag) => tag.toLowerCase().trim() === selectedSeason.toLowerCase().trim());
  };

  const matchesClosetSearch = useCallback((item: (typeof ownedItems)[number], rawQuery: string) => {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      item.title,
      item.printName,
      item.brand,
      ...(item.brandTags ?? []),
      ...(item.tags ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  }, []);

  const sizeScopedItems = useMemo(() => ownedItems.filter(matchesSizeMode), [ownedItems, matchesSizeMode]);
  const seasonOptions = useMemo(() => {
    const values = new Set<string>();
    sizeScopedItems
      .filter((item) => matchesBrand(item, brandId))
      .forEach((item) => item.seasonTags.forEach((tag) => tag.trim() && values.add(tag.trim())));
    return ['All', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [sizeScopedItems, brandId]);

  const brandOptions = useMemo(() => {
    const values = new Map<string, { count: number; label: string }>();
    const normalizeBrandKey = (value: string) => value.trim().toLowerCase();
    sizeScopedItems
      .filter((item) => matchesSeason(item, seasonFilter))
      .forEach((item) => {
        const candidate = (item.brandTags[0] || item.brand || '').trim();
        if (!candidate) return;
        const key = normalizeBrandKey(candidate);
        const current = values.get(key);
        if (!current) {
          values.set(key, { count: 1, label: candidate });
          return;
        }
        const preferredLabel =
          current.label.toLowerCase() === current.label && candidate.toLowerCase() !== candidate
            ? candidate
            : current.label;
        values.set(key, { count: current.count + 1, label: preferredLabel });
      });
    return [
      'All',
      ...Array.from(values.values())
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .map((entry) => entry.label),
    ];
  }, [sizeScopedItems, seasonFilter]);

  const filteredOwnedItems = useMemo(
    () => sizeScopedItems.filter((item) => matchesBrand(item, brandId)).filter((item) => matchesSeason(item, seasonFilter)).filter((item) => matchesClosetSearch(item, closetSearch)),
    [sizeScopedItems, brandId, seasonFilter, matchesClosetSearch, closetSearch],
  );
  useEffect(() => {
    let cancelled = false;
    const warmVisibleImages = async () => {
      const candidates = filteredOwnedItems
        .filter((item) => !item.cachedImageUri)
        .map((item) => ({ id: item.id, url: getItemDisplayImageUri(item) || '' }))
        .filter((entry) => /^https?:\/\//i.test(entry.url))
        .slice(0, 16);

      for (const candidate of candidates) {
        if (cancelled) return;
        try {
          const uri = await cacheRemoteImage(candidate.id, candidate.url);
          if (!uri || cancelled) continue;
          await updateItemCachedImage(candidate.id, uri);
        } catch {
          // Best-effort cache warm for faster closet thumbnails.
        }
      }
    };
    void warmVisibleImages();
    return () => {
      cancelled = true;
    };
  }, [filteredOwnedItems, updateItemCachedImage]);

  useEffect(() => {
    if (brandId !== 'All' && !brandOptions.includes(brandId)) setBrandId('All');
  }, [brandId, brandOptions]);
  useEffect(() => {
    if (seasonFilter !== 'All' && !seasonOptions.includes(seasonFilter)) setSeasonFilter('All');
  }, [seasonFilter, seasonOptions]);

  useEffect(() => {
    if (!loggedBrandChangeRef.current) {
      loggedBrandChangeRef.current = true;
      return;
    }
    void logEvent('closet_brand_filter_changed', { brandId: brandId === 'All' ? 'all' : brandId });
  }, [brandId]);
  useEffect(() => {
    if (!loggedSeasonChangeRef.current) {
      loggedSeasonChangeRef.current = true;
      return;
    }
    void logEvent('closet_season_filter_changed', { season: seasonFilter === 'All' ? 'all' : seasonFilter });
  }, [seasonFilter]);

  const counts = useMemo(() => {
    const base = Object.fromEntries(closetCategories.map((key) => [key, 0])) as Record<ClosetCategory, number>;
    filteredOwnedItems.forEach((item) => {
      base[closetCategoryForItem(item)] += 1;
    });
    return base;
  }, [filteredOwnedItems]);

  const thumbnailsByCategory = useMemo(() => {
    const map = new Map<ClosetCategory, string[]>();
    filteredOwnedItems.forEach((item) => {
      const key = closetCategoryForItem(item);
      const prev = map.get(key) ?? [];
      if (prev.length >= 3) return;
      const uri = getItemDisplayImageUri(item) || '';
      if (!uri) return;
      prev.push(uri);
      map.set(key, prev);
    });
    return map;
  }, [filteredOwnedItems]);

  useEffect(() => {
    const uris = Array.from(thumbnailsByCategory.values())
      .flat()
      .filter((uri) => /^https?:\/\//i.test(uri))
      .slice(0, 24);
    uris.forEach((uri) => {
      void Image.prefetch(uri).catch(() => undefined);
    });
  }, [thumbnailsByCategory]);

  const tileSignals = useMemo(() => {
    const result = new Map<ClosetCategory, { hasUps: boolean; hasDupes: boolean; hasStyleDupes: boolean }>();
    visibleCategories.forEach((category) => {
      const scoped = ownedItems.filter((item) => closetCategoryForItem(item) === category).filter((item) => matchesBrand(item, brandId)).filter((item) => matchesSeason(item, seasonFilter));
      const next = sizeAnchors.nextByCategory.get(category);
      const hasUps = next ? scoped.some((item) => normalize(item.size) === normalize(next)) : false;
      const printGroups = new Map<string, number>();
      const styleGroups = new Map<string, number>();
      scoped.forEach((item) => {
        const key = item.printNameNorm || normalizePrintName(item.printName ?? '');
        if (!key) return;
        printGroups.set(key, (printGroups.get(key) ?? 0) + 1);
      });
      scoped.forEach((item) => {
        const styleKey = normalizeStyleName(item.styleName || item.title || '');
        if (!styleKey) return;
        const key = `${styleKey}|${normalize(item.brand ?? '')}`;
        styleGroups.set(key, (styleGroups.get(key) ?? 0) + 1);
      });
      const hasDupes = Array.from(printGroups.values()).some((count) => count > 1);
      const hasStyleDupes = Array.from(styleGroups.values()).some((count) => count > 1);
      result.set(category, { hasUps, hasDupes, hasStyleDupes });
    });
    return result;
  }, [visibleCategories, ownedItems, brandId, seasonFilter, sizeAnchors]);

  const totalFilteredCount = useMemo(() => visibleCategories.reduce((sum, category) => sum + (counts[category] ?? 0), 0), [visibleCategories, counts]);
  const selectedSizeChipLabel = useMemo(
    () =>
      (visibleSizeChipEntries.find((entry) => entry.normalized === selectedSizeChip)?.label
        ?? presentSizeEntries.find((entry) => entry.normalized === selectedSizeChip)?.label
        ?? activeSizeEntries.find((entry) => entry.normalized === selectedSizeChip)?.label
        ?? selectedSizeChip
        ?? ''),
    [visibleSizeChipEntries, presentSizeEntries, activeSizeEntries, selectedSizeChip],
  );
  const emptyLabelByCategory = useMemo(() => {
    const labels = new Map<ClosetCategory, string>();
    const sizeScope = sizeMode === 'both' ? 'All' : sizeMode === 'now' ? 'Now' : 'Next';
    visibleCategories.forEach((category) => {
      labels.set(
        category,
        buildEmptyCategoryLabel({
          categoryName: closetLabel[category],
          brandFilter: brandId,
          sizeScope,
          selectedSizes: selectedSizeChipLabel ? [selectedSizeChipLabel] : [],
          query: closetSearch,
        }),
      );
    });
    return labels;
  }, [visibleCategories, brandId, sizeMode, selectedSizeChipLabel, closetSearch]);

  const newThisWeek = useMemo(() => (selectedChild ? getNewThisWeek(selectedChild.id, items, childItems).slice(0, 12) : []), [selectedChild, items, childItems]);
  const sizeUpsStash = useMemo(
    () => (selectedChild ? getSizeUpsStash(selectedChild.id, items, childItems, storageLocations, selectedChild).slice(0, 12) : []),
    [selectedChild, items, childItems, storageLocations],
  );
  const duplicatePrints = useMemo(() => {
    const groups = new Map<string, { printName: string; sizes: Set<string>; count: number }>();
    filteredOwnedItems
      .filter((item) => item.printNameNorm || item.printName?.trim())
      .forEach((item) => {
        const key = item.printNameNorm || normalizePrintName(item.printName ?? '');
        if (!key) return;
        const prev = groups.get(key) ?? { printName: item.printName?.trim() || key, sizes: new Set<string>(), count: 0 };
        prev.sizes.add(item.size);
        prev.count += 1;
        groups.set(key, prev);
      });
    return Array.from(groups.values())
      .filter((entry) => entry.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((entry) => ({ printName: entry.printName, sizes: Array.from(entry.sizes), count: entry.count }));
  }, [filteredOwnedItems]);
  const duplicateStyles = useMemo(() => {
    const groups = new Map<string, { label: string; brand?: string; sizes: Set<string>; count: number }>();
    filteredOwnedItems.forEach((item) => {
      const styleLabel = (item.styleName || item.title || '').trim();
      if (!styleLabel) return;
      const styleKey = normalizeStyleName(styleLabel);
      if (!styleKey) return;
      const brandLabel = (item.brand || item.brandTags[0] || '').trim();
      const key = `${styleKey}|${normalize(brandLabel)}`;
      const prev = groups.get(key) ?? { label: styleLabel, brand: brandLabel || undefined, sizes: new Set<string>(), count: 0 };
      prev.sizes.add(item.size);
      prev.count += 1;
      groups.set(key, prev);
    });
    return Array.from(groups.values())
      .filter((entry) => entry.count > 1)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 8)
      .map((entry) => ({
        label: entry.label,
        brand: entry.brand,
        sizes: Array.from(entry.sizes),
        count: entry.count,
      }));
  }, [filteredOwnedItems]);
  const recentlyAdded = useMemo(
    () => filteredOwnedItems.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
    [filteredOwnedItems],
  );
  const showSingleRecent = FEATURE_SINGLE_RECENT && recentlyAdded.length === 1;
  const showRecentStrip = recentlyAdded.length >= 2;
  const renderedCategories = showTileGridReorderMode ? tileGridOrder : visibleCategories;
  const openItemDetail = useCallback((itemId: string) => {
    navigation.navigate('ItemDetail', { itemId });
  }, [navigation]);
  const openClosetSearchResults = useCallback(() => {
    const q = closetSearch.trim();
    if (!q) return;
    navigation.navigate('ItemsList', {
      initialChildId: selectedChild?.id,
      initialStatus: 'owned',
      hideInbox: true,
      initialQuery: q,
    });
  }, [closetSearch, navigation, selectedChild?.id]);

  const toggleClosetSizeSelection = useCallback((key: 'now' | 'next') => {
    const current = sizeModeToSelection(sizeMode);
    const nextSelection = { ...current, [key]: !current[key] };
    const nextMode = selectionToSizeMode(nextSelection, 'both');
    setSizeMode(nextMode);
    if (nextMode === 'now') setSelectedSizeChip(currentSizeNormalized || null);
    else if (nextMode === 'next') setSelectedSizeChip(nextSizeNormalized || null);
    else setSelectedSizeChip(null);
    if (selectedChild?.id) sizeModeOverridesRef.current[selectedChild.id] = nextMode;
  }, [sizeMode, selectedChild?.id, currentSizeNormalized, nextSizeNormalized]);

  const selectAllClosetSizes = useCallback(() => {
    setSelectedSizeChip(null);
    setSizeMode('both');
    if (selectedChild?.id) sizeModeOverridesRef.current[selectedChild.id] = 'both';
  }, [selectedChild?.id]);

  const selectClosetSizeChip = useCallback((value: string) => {
    const transition = getSizeChipTransitionOnTap({
      tapped: value,
      currentSize: currentSizeNormalized,
      nextSize: nextSizeNormalized,
    });
    setSelectedSizeChip(transition.selectedSizeChip || null);
    setSizeMode(transition.mode);
    if (selectedChild?.id) sizeModeOverridesRef.current[selectedChild.id] = transition.mode;
  }, [currentSizeNormalized, nextSizeNormalized, selectedChild?.id]);

  const moveCategoryInList = useCallback((list: ClosetCategory[], from: number, to: number): ClosetCategory[] => {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }, []);

  const moveCategoryByDirection = useCallback((category: ClosetCategory, direction: 'left' | 'right' | 'up' | 'down') => {
    const current = tileOrderRef.current;
    const from = current.indexOf(category);
    if (from < 0) return;
    const row = Math.floor(from / CLOSET_GRID_COLUMNS);
    const col = from % CLOSET_GRID_COLUMNS;
    let targetRow = row;
    let targetCol = col;
    if (direction === 'left') targetCol -= 1;
    if (direction === 'right') targetCol += 1;
    if (direction === 'up') targetRow -= 1;
    if (direction === 'down') targetRow += 1;
    if (targetCol < 0 || targetCol >= CLOSET_GRID_COLUMNS || targetRow < 0) return;
    const to = targetRow * CLOSET_GRID_COLUMNS + targetCol;
    if (to < 0 || to >= current.length) return;
    const next = moveCategoryInList(current, from, to);
    if (next === current) return;
    tileOrderRef.current = next;
    setTileGridOrder(next);
  }, [moveCategoryInList]);

  const persistVisibleCategoryOrder = useCallback(
    async (nextVisible: ClosetCategory[]) => {
      const full = sanitizeCategoryOrder(settings.closetCategoryOrder, { includeOther: true, fallback: closetCategories });
      const visibleSet = new Set(nextVisible);
      const hiddenOrOther = full.filter((category) => !visibleSet.has(category));
      await updateSettings({ closetCategoryOrder: [...nextVisible, ...hiddenOrOther] });
    },
    [settings.closetCategoryOrder, updateSettings],
  );

  const onTileLayout = useCallback((category: ClosetCategory, x: number, y: number, width: number, height: number) => {
    tileLayoutsRef.current[category] = { x, y, width, height };
  }, []);

  const getTileResponder = useCallback(
    (category: ClosetCategory) => {
      if (tilePanRespondersRef.current[category]) return tilePanRespondersRef.current[category];
      tilePanRespondersRef.current[category] = PanResponder.create({
        onStartShouldSetPanResponder: () => showTileGridReorderMode,
        onStartShouldSetPanResponderCapture: () => showTileGridReorderMode,
        onMoveShouldSetPanResponder: (_, gesture) => showTileGridReorderMode && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
        onMoveShouldSetPanResponderCapture: (_, gesture) => showTileGridReorderMode && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
        onPanResponderGrant: () => {
          tileDragStateRef.current = { category };
        },
        onPanResponderMove: (_, gesture) => {
          if (!showTileGridReorderMode) return;
          const current = tileOrderRef.current;
          const currentIndex = current.indexOf(category);
          if (currentIndex < 0) return;
          const layout = tileLayoutsRef.current[category];
          if (!layout) return;
          const centerX = layout.x + layout.width / 2 + gesture.dx;
          const centerY = layout.y + layout.height / 2 + gesture.dy;
          let bestIndex = currentIndex;
          let bestDistance = Number.POSITIVE_INFINITY;
          current.forEach((entry, index) => {
            const target = tileLayoutsRef.current[entry];
            if (!target) return;
            const tx = target.x + target.width / 2;
            const ty = target.y + target.height / 2;
            const distance = Math.abs(centerX - tx) + Math.abs(centerY - ty);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIndex = index;
            }
          });
          if (bestIndex === currentIndex) return;
          const next = moveCategoryInList(current, currentIndex, bestIndex);
          tileOrderRef.current = next;
          setTileGridOrder(next);
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderRelease: () => {
          tileDragStateRef.current = null;
          void persistVisibleCategoryOrder([...tileOrderRef.current]);
        },
        onPanResponderTerminate: () => {
          tileDragStateRef.current = null;
          void persistVisibleCategoryOrder([...tileOrderRef.current]);
        },
      });
      return tilePanRespondersRef.current[category];
    },
    [moveCategoryInList, persistVisibleCategoryOrder, showTileGridReorderMode, setShowTileGridReorderMode],
  );

  if (!selectedChild) {
    return (
      <Screen scroll={false} style={{ flex: 1, justifyContent: 'center', paddingBottom: 88 }}>
        <View style={{ alignItems: 'center', gap: 18 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surfaceMuted,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ fontSize: 34, color: theme.colors.textSecondary, opacity: 0.65 }}>⟡</Text>
          </View>
          <Card style={{ width: '100%', gap: 12 }}>
            <Text style={{ fontSize: 24, fontWeight: '600', color: theme.colors.textPrimary, fontFamily: theme.fonts.serif }}>
              Start your first closet
            </Text>
            <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
              Add a kid to track sizes, save links, and prep for drops.
            </Text>
            <PrimaryButton
              label="Add Kid"
              onPress={() => void openAddKidFromEmptyState()}
            />
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>You can add more kids anytime.</Text>
            <Pressable
              onPress={() => navigation.navigate('GuidedStart')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="See how Layette Out works"
              style={{ alignSelf: 'flex-start' }}
            >
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary, textDecorationLine: 'underline' }}>
                See how it works
              </Text>
            </Pressable>
          </Card>
        </View>
      </Screen>
    );
  }

  const openModesAction = async (mode: 'shopping' | 'organizing' | 'wishlist' | 'exploring') => {
    setShowModesModal(false);
    await logEvent('onboarding_choice', { choice: mode, source: 'closet_today_modal' });
    if (mode === 'shopping') {
      navigation.navigate('BeforeYouBuy', { childId: selectedChild.id });
      return;
    }
    if (mode === 'organizing') {
      navigation.navigate('DrawerScan');
      return;
    }
    if (mode === 'wishlist') {
      navigation.getParent()?.navigate('Wishlist' as never);
      return;
    }
  };

  const filtersSummary = `${brandId === 'All' ? 'All brands' : brandId} • ${seasonFilter === 'All' ? 'All seasons' : seasonFilter}`;
  const activeBrandName = brandId === 'All' ? undefined : brandId;
  const activeBrandShortLabel = activeBrandName ? getBrandShortLabel(activeBrandName) : undefined;
  const handleActionClick = async (action: 'before_you_buy' | 'drop_prep' | 'quick_add' | 'drawer_scan' | 'brands') => {
    await logEvent('closet_action_clicked', { action, childId: selectedChild.id });
  };
  async function openAddItem() {
    await handleActionClick('quick_add');
    navigation.navigate('AddItem', { shoppingMode: true });
  }
  const openClosetFabMenu = () => {
    const actions = [
      { label: 'Add Item', onPress: () => void openAddItem() },
      { label: 'Add From Link', onPress: () => navigation.navigate('AddItem', { quick: false, shoppingMode: true }) },
      { label: 'Drawer Scan', onPress: () => navigation.navigate('DrawerScan') },
      { label: 'Batch Add', onPress: () => navigation.navigate('BatchAdd') },
    ];
    showActionMenu({ title: 'Add', message: 'Choose how to add', actions });
  };

  const openCategoryTileMenu = (category: ClosetCategory) => {
    if (!selectedChild) return;
    showActionMenu({
      title: closetLabel[category],
      message: 'Category options',
      actions: [
        {
          label: 'Rearrange Categories',
          onPress: () => {
            setShowTileGridReorderMode(true);
            setShowCategoryLayoutEditor(false);
          },
        },
        {
          label: `Hide for ${selectedChild.name}`,
          onPress: () => {
            void (async () => {
              const current = new Set((selectedChild.hiddenClosetCategories ?? []) as ClosetCategory[]);
              current.add(category);
              await updateChild(selectedChild.id, { hiddenClosetCategories: Array.from(current) });
            })();
          },
        },
        {
          label: 'Hide Everywhere',
          onPress: () => {
            void (async () => {
              const current = new Set(sanitizeHiddenCategories(settings.hiddenClosetCategoriesGlobal, { includeOther: true }));
              current.add(category);
              await updateSettings({ hiddenClosetCategoriesGlobal: Array.from(current) });
            })();
          },
        },
      ],
    });
  };

  return (
    <Screen
      style={styles.screenContent}
      scrollEnabled={!showTileGridReorderMode}
      overlay={(
        <>
          {showFirstKidAddedHint ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 20,
                right: 20,
                bottom: 88,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: '100%',
                  borderRadius: 14,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  shadowColor: theme.colors.shadow,
                  shadowOpacity: 0.08,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 4,
                }}
              >
                <Text style={{ color: theme.colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                  Kid added. Now add your first item with +
                </Text>
              </View>
            </View>
          ) : null}
          <FloatingActionButton
            onPress={() => navigation.navigate('AddItem', { prefillStatus: 'owned', shoppingMode: true })}
            onLongPress={openClosetFabMenu}
            accessibilityLabel="Add item"
            testID="closet-fab-add"
          />
        </>
      )}
    >
      <Card>
        <Text style={styles.headerTitle}>Closet View</Text>
        <Text style={styles.headerTagline}>See what you have so you know what to buy.</Text>
        <ChipSelector
          label="Child"
          options={children.map((child) => child.name)}
          value={selectedChild.name}
          onChange={(name) => {
            const nextId = children.find((child) => child.name === name)?.id ?? selectedChild.id;
            setChildId(nextId);
            setBrandId('All');
          }}
          accent="coral"
        />
        <View style={styles.sizeToggleWrap}>
          <Text style={styles.topBrandLabel}>Size</Text>
          <View style={styles.sizeToggleRow}>
            <Pressable
              style={[styles.sizeToggleChip, sizeModeToSelection(sizeMode).now ? styles.sizeToggleChipActive : null]}
              onPress={() => toggleClosetSizeSelection('now')}
            >
              <Text style={[styles.sizeToggleChipText, sizeModeToSelection(sizeMode).now ? styles.sizeToggleChipTextActive : null]}>Now</Text>
            </Pressable>
            <Pressable
              style={[styles.sizeToggleChip, sizeModeToSelection(sizeMode).next ? styles.sizeToggleChipActive : null]}
              onPress={() => toggleClosetSizeSelection('next')}
            >
              <Text style={[styles.sizeToggleChipText, sizeModeToSelection(sizeMode).next ? styles.sizeToggleChipTextActive : null]}>Next</Text>
            </Pressable>
            <Pressable
              style={[styles.sizeToggleChip, sizeMode === 'both' && !selectedSizeChip ? styles.sizeToggleChipActive : null]}
              onPress={selectAllClosetSizes}
            >
              <Text style={[styles.sizeToggleChipText, sizeMode === 'both' && !selectedSizeChip ? styles.sizeToggleChipTextActive : null]}>All</Text>
            </Pressable>
          </View>
          {visibleSizeChipEntries.length > 0 ? (
            <View style={styles.sizeToggleRow}>
              {visibleSizeChipEntries.slice(0, 16).map((entry) => {
                const active = selectedSizeChip === entry.normalized;
                return (
                  <Pressable
                    key={`closet-size-${entry.normalized}`}
                    style={[styles.sizeToggleChip, active ? styles.sizeToggleChipActive : null]}
                    onPress={() => selectClosetSizeChip(entry.label)}
                  >
                    <Text style={[styles.sizeToggleChipText, active ? styles.sizeToggleChipTextActive : null]}>{entry.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <FormInput
          label="Search Closet"
          value={closetSearch}
          onChangeText={setClosetSearch}
          placeholder="Search title, print, brand, tags (e.g. daisy)"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {closetSearch.trim() ? (
          <PrimaryButton label="See Matches" variant="secondary" onPress={openClosetSearchResults} />
        ) : null}
        {advancedUnlocked ? (
          <View style={styles.topBrandRowWrap}>
            <View style={styles.topBrandHeader}>
              <Text style={styles.topBrandLabel}>Brand Filter</Text>
              <Text style={styles.topBrandModeText}>{activeBrandName ? `Filtering: ${activeBrandName}` : 'All brands'}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chipRow}>
              {['All', ...brandOptions.filter((b) => b !== 'All').slice(0, 5)].map((option) => {
                const active = brandId === option;
                return (
                  <Pressable
                    key={`top-brand-${option}`}
                    style={[styles.topBrandChip, active ? styles.topBrandChipActive : null]}
                    onPress={() => setBrandId(option)}
                  >
                    <Text style={[styles.topBrandChipText, active ? styles.topBrandChipTextActive : null]}>{option}</Text>
                  </Pressable>
                );
              })}
              {brandOptions.length > 6 ? (
                <Pressable
                  style={[styles.topBrandChip, styles.topBrandChipMore]}
                  onPress={async () => {
                    if (!filtersExpanded) {
                      setFiltersExpanded(true);
                      await logEvent('closet_filters_expanded', { expanded: true, source: 'brand_mode_more' });
                    }
                  }}
                >
                  <Text style={styles.topBrandChipText}>More…</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Card>

      {totalFilteredCount === 0 ? (
        <EmptyState
          title="Closet is empty."
          subtitle="Add your first item or scan a drawer to start your closet."
          actionLabel="Quick Add"
          onActionPress={() => {
            void openAddItem();
          }}
        />
      ) : null}

      {showTileGridReorderMode ? (
        <Card>
          <View style={{ gap: 8 }}>
            <Text style={[styles.meta, { flexShrink: 1 }]}>Use arrows on tiles to reorder categories</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
              <Pressable
                onPress={() => {
                  const resetVisible = closetCategories.filter((entry) => visibleCategories.includes(entry));
                  tileOrderRef.current = resetVisible;
                  setTileGridOrder(resetVisible);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Reset category order"
              >
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '700' }}>Reset Order</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void persistVisibleCategoryOrder([...tileOrderRef.current]);
                  setShowTileGridReorderMode(false);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Done reordering categories"
              >
                <Text style={{ color: theme.colors.accentPeriwinkle, fontSize: 12, fontWeight: '700' }}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Card>
      ) : null}

      <View style={styles.grid}>
        {renderedCategories.map((category) => {
          const count = counts[category] ?? 0;
          const thumbs = thumbnailsByCategory.get(category) ?? [];
          const signals = tileSignals.get(category) ?? { hasUps: false, hasDupes: false, hasStyleDupes: false };
          const reorderIndex = showTileGridReorderMode ? renderedCategories.indexOf(category) : -1;
          const row = reorderIndex >= 0 ? Math.floor(reorderIndex / CLOSET_GRID_COLUMNS) : -1;
          const col = reorderIndex >= 0 ? reorderIndex % CLOSET_GRID_COLUMNS : -1;
          const canMoveLeft = reorderIndex >= 0 && col > 0;
          const canMoveRight = reorderIndex >= 0 && col < CLOSET_GRID_COLUMNS - 1 && reorderIndex + 1 < renderedCategories.length;
          const canMoveUp = reorderIndex >= CLOSET_GRID_COLUMNS;
          const canMoveDown = reorderIndex >= 0 && (row + 1) * CLOSET_GRID_COLUMNS + col < renderedCategories.length;

          return (
            <ClosetTile
              key={category}
              category={category}
              count={count}
              thumbs={thumbs}
              emptyLabel={emptyLabelByCategory.get(category)}
              hasUps={signals.hasUps}
              hasDupes={signals.hasDupes}
              hasStyleDupes={signals.hasStyleDupes}
              activeBrandLabel={activeBrandShortLabel}
              activeBrandName={activeBrandName}
              onLongPress={showTileGridReorderMode ? undefined : () => openCategoryTileMenu(category)}
              isReorderMode={showTileGridReorderMode}
              panHandlers={undefined}
              onTileLayout={undefined}
              canMoveLeft={canMoveLeft}
              canMoveRight={canMoveRight}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onMoveLeft={canMoveLeft ? () => moveCategoryByDirection(category, 'left') : undefined}
              onMoveRight={canMoveRight ? () => moveCategoryByDirection(category, 'right') : undefined}
              onMoveUp={canMoveUp ? () => moveCategoryByDirection(category, 'up') : undefined}
              onMoveDown={canMoveDown ? () => moveCategoryByDirection(category, 'down') : undefined}
              onPress={() => {
                if (showTileGridReorderMode) return;
                if (count === 0) {
                  navigation.navigate('AddItem', {
                    shoppingMode: true,
                    prefillStatus: 'owned',
                    prefillChildId: selectedChild.id,
                    prefillCategory: category,
                    prefillType: closetCategoryToClothingType(category),
                  });
                  return;
                }
                navigation.navigate('CategorySnapshot', {
                  childId: selectedChild.id,
                  category,
                  sizeMode,
                  brandId: brandId === 'All' ? undefined : brandId,
                  season: seasonFilter === 'All' ? undefined : seasonFilter,
                });
              }}
            />
          );
        })}
      </View>

      {showRecentStrip ? (
        <Card>
          <View style={styles.recentHeaderRow}>
            <Text style={styles.recentStripTitle}>Recently Added</Text>
            <Pressable
              onPress={() =>
                navigation.navigate('ItemsList', {
                  hideInbox: true,
                  initialChildId: selectedChild.id,
                  initialSinceHours: 24,
                  initialStatus: 'owned',
                })
              }
              accessibilityRole="button"
              accessibilityLabel="See all recently added items"
            >
              <Text style={styles.recentSeeAll}>See All</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentStripScroller} contentContainerStyle={styles.recentStripRow}>
            {recentlyAdded.map((item) => (
              <RecentlyAddedItemCard
                key={item.id}
                id={item.id}
                title={item.title}
                size={item.size}
                thumb={getItemDisplayImageUri(item)}
                onPress={openItemDetail}
              />
            ))}
          </ScrollView>
        </Card>
      ) : null}
      {showSingleRecent ? (
        <Card>
          <View style={styles.recentHeaderRow}>
            <Text style={styles.recentStripTitle}>Recently Added</Text>
          </View>
          {(() => {
            const item = recentlyAdded[0];
            const thumb = getItemDisplayImageUri(item);
            return (
              <View style={styles.singleRecentWrap}>
                <Pressable
                  style={styles.singleRecentCard}
                  onPress={() => openItemDetail(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, just added`}
                >
                  <View style={styles.singleRecentBadge}>
                    <Text style={styles.singleRecentBadgeText}>Just added</Text>
                  </View>
                  <RemoteImage uri={thumb} style={styles.singleRecentThumb} fallbackLabel={item.title} />
                  <Text numberOfLines={1} style={styles.recentStripItemTitle}>{item.title}</Text>
                  <Text numberOfLines={1} style={styles.recentStripItemMeta}>{item.size || 'N/A'}</Text>
                </Pressable>
              </View>
            );
          })()}
        </Card>
      ) : null}

      <Pressable
        style={styles.filtersToggle}
        onPress={async () => {
          const next = !filtersExpanded;
          setFiltersExpanded(next);
          await logEvent('closet_filters_expanded', { expanded: next });
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={styles.filtersToggleLabel}>Filters {filtersExpanded ? '▾' : '▸'}</Text>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                setShowCategoryLayoutEditor((prev) => !prev);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Edit closet categories"
            >
              <Text style={{ color: theme.colors.accentPeriwinkle, fontSize: 12, fontWeight: '700' }}>
                {showCategoryLayoutEditor ? 'Done Editing' : 'Edit Categories (Hide/Show)'}
              </Text>
            </Pressable>
        </View>
        <Text numberOfLines={1} style={styles.filtersSummary}>{filtersSummary}</Text>
      </Pressable>

      {filtersExpanded ? (
        <Card>
          <Text style={styles.meta}>Brand</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chipRow}>
            {brandOptions.map((option) => {
              const active = brandId === option;
              return (
                <Pressable
                  key={`brand-${option}`}
                  style={[styles.filterChip, active ? styles.filterChipActive : null]}
                  onPress={() => setBrandId(option)}
                >
                  <Text style={[styles.filterChipText, active ? styles.filterChipTextActiveCoral : null]}>{option}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.meta}>Season</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chipRow}>
            {seasonOptions.map((option) => {
              const active = seasonFilter === option;
              return (
                <Pressable
                  key={`season-${option}`}
                  style={[styles.filterChip, active ? styles.filterChipSeasonActive : null]}
                  onPress={() => setSeasonFilter(option)}
                >
                  <Text style={[styles.filterChipText, active ? styles.filterChipTextActivePeriwinkle : null]}>{option}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Card>
      ) : null}

      {showCategoryLayoutEditor ? (
        <Card>
          <DraggableCategoryPrefsEditor
            title="Closet Categories"
            ordered={closetCategoryOrderForEdit}
            hidden={hiddenClosetCategoriesForEdit}
            onReorder={async (next) => updateSettings({ closetCategoryOrder: next })}
            onToggleHidden={async (category) => {
              const current = new Set(sanitizeHiddenCategories(settings.hiddenClosetCategoriesGlobal, { includeOther: true }));
              if (current.has(category)) current.delete(category);
              else current.add(category);
              await updateSettings({ hiddenClosetCategoriesGlobal: Array.from(current) });
            }}
          />
          <PrimaryButton label="Done" variant="secondary" onPress={() => setShowCategoryLayoutEditor(false)} />
        </Card>
      ) : null}

      <Card style={styles.actionsBlock}>
        <Text style={styles.actionsTitle}>Actions</Text>
        <View style={styles.actionsPrimaryWrap}>
          <PrimaryButton
            label="Drop Prep"
            onPress={async () => {
              await handleActionClick('drop_prep');
              navigation.navigate('DropPrep', { childId: selectedChild.id });
            }}
          />
          <Text style={styles.actionsPrimarySubtitle}>Prep for the drop (what you have, what you need)</Text>
        </View>
        <View style={styles.secondaryGrid}>
          <Pressable
            style={styles.actionCard}
            onPress={async () => {
              await handleActionClick('before_you_buy');
              await logEvent('shopping_mode_open', { source: 'closet_view', childId: selectedChild.id });
              navigation.navigate('BeforeYouBuy', { childId: selectedChild.id });
            }}
            accessibilityRole="button"
            accessibilityLabel="Before You Buy action"
          >
            <Text style={styles.actionCardTitle}>Before You Buy</Text>
            <Text style={styles.actionCardMeta}>Quick check while shopping</Text>
          </Pressable>
          <Pressable
            style={styles.actionCard}
            onPress={async () => {
              await handleActionClick('brands');
              setFiltersExpanded(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Brand Filter action"
          >
            <Text style={styles.actionCardTitle}>Brand Filter</Text>
            <Text style={styles.actionCardMeta}>Filter closet by brand</Text>
          </Pressable>
          <Pressable
            style={styles.actionCard}
            onPress={async () => {
              await handleActionClick('drawer_scan');
              navigation.navigate('DrawerScan');
            }}
            accessibilityRole="button"
            accessibilityLabel="Drawer Scan action"
          >
            <Text style={styles.actionCardTitle}>Drawer Scan</Text>
            <Text style={styles.actionCardMeta}>Count what’s in reach</Text>
          </Pressable>
        </View>
      </Card>

      {advancedUnlocked ? (
        <>
          <Card>
            <Pressable onPress={() => setShowNew((prev) => !prev)}>
              <Text style={styles.sectionToggle}>New this week {showNew ? '▾' : '▸'}</Text>
            </Pressable>
            {showNew ? (
              newThisWeek.length ? (
                <View style={styles.horizontalWrap}>
                  {newThisWeek.map((item) => (
                    <View key={item.id} style={styles.horizontalCard}>
                      <Text style={styles.horizontalTitle}>{item.title}</Text>
                      <Text style={styles.meta}>{item.size || 'N/A'} • {formatItemCategoryLabel(item)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.meta}>No new items this week.</Text>
              )
            ) : null}
          </Card>

          <Card>
            <Pressable onPress={() => setShowStash((prev) => !prev)}>
              <Text style={styles.sectionToggle}>Size-ups stash {showStash ? '▾' : '▸'}</Text>
            </Pressable>
            {showStash ? (
              sizeUpsStash.length ? (
                <View style={styles.horizontalWrap}>
                  {sizeUpsStash.map((item) => (
                    <View key={item.id} style={styles.horizontalCard}>
                      <Text style={styles.horizontalTitle}>{item.title}</Text>
                      <Text style={styles.meta}>{item.size || 'N/A'} • {formatItemCategoryLabel(item)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.meta}>No size-up stash items yet.</Text>
              )
            ) : null}
          </Card>

          <Card>
            <Pressable onPress={() => setShowDupes((prev) => !prev)}>
              <Text style={styles.sectionToggle}>Duplicate prints across sizes {showDupes ? '▾' : '▸'}</Text>
            </Pressable>
            {showDupes ? (
              duplicatePrints.length ? (
                duplicatePrints.map((group) => (
                  <Pressable
                    key={`${group.printName}-${group.sizes.join('|')}`}
                    onPress={() => {
                      const groupKey = normalizePrintName(group.printName ?? '');
                      const itemIds = filteredOwnedItems
                        .filter((item) => {
                          const key = item.printNameNorm || normalizePrintName(item.printName ?? '');
                          if (!key || key !== groupKey) return false;
                          return group.sizes.some((size) => normalize(size) === normalize(item.size));
                        })
                        .map((item) => item.id);
                      navigation.navigate('ItemsList', {
                        hideInbox: true,
                        initialChildId: selectedChild.id,
                        initialStatus: 'owned',
                        initialBrandId: brandId === 'All' ? undefined : brandId,
                        initialItemIds: itemIds,
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open duplicate print group ${group.printName}`}
                    style={({ pressed }) => [
                      styles.duplicateLinkRow,
                      pressed ? { opacity: 0.9 } : null,
                    ]}
                  >
                    <Text style={styles.duplicateLinkText}>
                      {group.printName}: {group.sizes.join(', ')}
                    </Text>
                    <Text style={styles.duplicateLinkChevron}>›</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.meta}>No duplicate print groups yet.</Text>
              )
            ) : null}
          </Card>

          <Card>
            <Pressable onPress={() => setShowStyleDupesList((prev) => !prev)}>
              <Text style={styles.sectionToggle}>Duplicate styles across sizes {showStyleDupesList ? '▾' : '▸'}</Text>
            </Pressable>
            {showStyleDupesList ? (
              duplicateStyles.length ? (
                duplicateStyles.map((group) => (
                  <Pressable
                    key={`${group.brand ?? ''}|${group.label}|${group.sizes.join('|')}`}
                    onPress={() => {
                      const styleKey = normalizeStyleName(group.label);
                      const brandKey = normalize(group.brand ?? '');
                      const itemIds = filteredOwnedItems
                        .filter((item) => {
                          const itemStyleKey = normalizeStyleName(item.styleName || item.title || '');
                          if (!itemStyleKey || itemStyleKey !== styleKey) return false;
                          const itemBrandKey = normalize(item.brand || item.brandTags[0] || '');
                          return itemBrandKey === brandKey && group.sizes.some((size) => normalize(size) === normalize(item.size));
                        })
                        .map((item) => item.id);
                      navigation.navigate('ItemsList', {
                        hideInbox: true,
                        initialChildId: selectedChild.id,
                        initialStatus: 'owned',
                        initialBrandId: brandId === 'All' ? undefined : brandId,
                        initialItemIds: itemIds,
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open duplicate style group ${group.label}`}
                    style={({ pressed }) => [
                      styles.duplicateLinkRow,
                      pressed ? { opacity: 0.9 } : null,
                    ]}
                  >
                    <Text style={styles.duplicateLinkText}>
                      {group.brand ? `${group.brand} • ` : ''}{group.label}: {group.sizes.join(', ')}
                    </Text>
                    <Text style={styles.duplicateLinkChevron}>›</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.meta}>No duplicate style groups yet.</Text>
              )
            ) : null}
          </Card>
        </>
      ) : null}

      <Modal visible={showModesModal} transparent animationType="fade" onRequestClose={() => setShowModesModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowModesModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>What are you doing today?</Text>
            <PrimaryButton label="I'm shopping" onPress={() => void openModesAction('shopping')} />
            <PrimaryButton label="I'm organizing a closet" variant="secondary" onPress={() => void openModesAction('organizing')} />
            <PrimaryButton label="I'm building a wishlist" variant="secondary" onPress={() => void openModesAction('wishlist')} />
            <PrimaryButton label="Just exploring" variant="secondary" onPress={() => void openModesAction('exploring')} />
          </Pressable>
        </Pressable>
      </Modal>
      <BetaKidLimitModal
        visible={showKidLimitModal}
        onClose={() => setShowKidLimitModal(false)}
        onSendFeedback={() => { void openKidLimitFeedbackEmail(kidLimitCurrentCount); }}
      />
    </Screen>
  );
};
