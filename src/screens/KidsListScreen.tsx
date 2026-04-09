import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { BetaKidLimitModal } from '@/components/BetaKidLimitModal';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { Screen } from '@/components/Screen';
import { BETA_MAX_KIDS } from '@/config/betaLimits';
import { useData } from '@/db/DataContext';
import { usePromoteChildSize, canPromoteChildSize } from '@/hooks/usePromoteChildSize';
import { KidsStackParamList } from '@/navigation/types';
import { closetCategoryForItem, itemCategoryKey } from '@/utils/closetViewInsights';
import { closetCategoryToClothingType, getCategoryGlyphForId, getCategoryLabel, getConfiguredKidsPreviewCategories } from '@/utils/categories';
import { getChildItems } from '@/utils/fitInsights';
import { isSampleChildId } from '@/utils/sampleData';
import { formatSizeDisplay, getChildCurrentSizeText, getChildNextSizeText } from '@/utils/sizes';
import { getItemDisplayImageUri } from '@/utils/itemMedia';
import { openKidLimitFeedbackEmail } from '@/utils/betaKidLimitFeedback';

type Props = NativeStackScreenProps<KidsStackParamList, 'KidsList'>;

type KidMiniTileData = {
  category: string;
  uri?: string;
  count: number;
};

type KidCardData = {
  id: string;
  name: string;
  sortOrder: number;
  photoUri?: string;
  initial: string;
  nowLabel: string;
  nextLabel: string;
  isSample: boolean;
  usesMixedSizes: boolean;
  canPromote: boolean;
  promoteLabel?: string;
  miniTiles: KidMiniTileData[];
};

type KidMiniTileProps = {
  childName: string;
  childId: string;
  tile: KidMiniTileData;
  customCategories: Array<{ id: string; name: string; icon?: string }>;
  onOpenCategory: (childId: string, category: string) => void;
  onOpenAddCategory: (childId: string, category: string) => void;
};

const KidMiniTileComponent: React.FC<KidMiniTileProps> = ({ childName, childId, tile, customCategories, onOpenCategory, onOpenAddCategory }) => (
  <Pressable
    style={({ pressed }) => [styles.miniTile, pressed ? styles.miniTilePressed : null]}
    onPress={() => (tile.count > 0 ? onOpenCategory(childId, tile.category) : onOpenAddCategory(childId, tile.category))}
    accessibilityRole="button"
    accessibilityLabel={tile.count > 0 ? `${childName} ${getCategoryLabel(tile.category, customCategories)}, ${tile.count}` : `Add ${getCategoryLabel(tile.category, customCategories)} for ${childName}`}
  >
    {tile.uri ? (
      <Image source={{ uri: tile.uri }} style={styles.miniTileImage} />
    ) : (
      <View style={styles.miniTilePlaceholder}>
        <Text style={styles.miniTilePlaceholderText}>{getCategoryGlyphForId(tile.category, customCategories)}</Text>
      </View>
    )}
    <Text numberOfLines={1} style={styles.miniTileLabel}>{getCategoryLabel(tile.category, customCategories)}</Text>
    <Text style={styles.miniTileCount}>{tile.count}</Text>
    {!tile.uri || tile.count === 0 ? <Text numberOfLines={1} style={styles.miniTileHint}>{tile.count === 0 ? 'Add first item' : 'Add photo'}</Text> : null}
  </Pressable>
);

const KidMiniTile = React.memo(KidMiniTileComponent);

type KidDashboardCardProps = {
  child: KidCardData;
  customCategories: Array<{ id: string; name: string; icon?: string }>;
  isDefaultCloset: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpenChild: (childId: string) => void;
  onOpenCategory: (childId: string, category: string) => void;
  onOpenAddCategory: (childId: string, category: string) => void;
  onPromote: (childId: string) => void;
  onMove: (childId: string, direction: 'up' | 'down') => void;
};

const KidDashboardCardComponent: React.FC<KidDashboardCardProps> = ({ child, customCategories, isDefaultCloset, canMoveUp, canMoveDown, onOpenChild, onOpenCategory, onOpenAddCategory, onPromote, onMove }) => (
  <Card>
    <Pressable onPress={() => onOpenChild(child.id)} style={({ pressed }) => [styles.cardPressable, pressed ? styles.cardPressablePressed : null]}>
      <View style={styles.headerRow}>
        {child.photoUri ? (
          <Image source={{ uri: child.photoUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{child.initial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>
              {child.name}
              {child.isSample ? ' (Sample)' : ''}
            </Text>
            {isDefaultCloset ? (
              <View style={styles.defaultClosetBadge}>
                <Text style={styles.defaultClosetBadgeText}>Default closet</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.sizeLine}>Now: {child.nowLabel} {' • '} Next: {child.nextLabel}</Text>
          <View style={styles.reorderRow}>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onMove(child.id, 'up');
              }}
              disabled={!canMoveUp}
              style={({ pressed }) => [styles.reorderButton, !canMoveUp ? styles.reorderButtonDisabled : null, pressed && canMoveUp ? styles.reorderButtonPressed : null]}
              accessibilityRole="button"
              accessibilityLabel={`Move ${child.name} up`}
            >
              <Text style={[styles.reorderButtonText, !canMoveUp ? styles.reorderButtonTextDisabled : null]}>Move up</Text>
            </Pressable>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onMove(child.id, 'down');
              }}
              disabled={!canMoveDown}
              style={({ pressed }) => [styles.reorderButton, !canMoveDown ? styles.reorderButtonDisabled : null, pressed && canMoveDown ? styles.reorderButtonPressed : null]}
              accessibilityRole="button"
              accessibilityLabel={`Move ${child.name} down`}
            >
              <Text style={[styles.reorderButtonText, !canMoveDown ? styles.reorderButtonTextDisabled : null]}>Move down</Text>
            </Pressable>
          </View>
          {child.usesMixedSizes ? (
            <View style={styles.mixedSizesBadge}>
              <Text style={styles.mixedSizesBadgeText}>Mixed sizes</Text>
            </View>
          ) : null}
          {child.canPromote && child.promoteLabel ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onPromote(child.id);
              }}
              style={styles.promotePill}
              accessibilityRole="button"
              accessibilityLabel={`Promote to ${child.promoteLabel}`}
            >
              <Text style={styles.promotePillText}>Promote to {child.promoteLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.miniGrid}>
        {child.miniTiles.map((tile) => (
          <KidMiniTile
            key={`${child.id}-${tile.category}`}
            childName={child.name}
            childId={child.id}
            tile={tile}
            customCategories={customCategories}
            onOpenCategory={onOpenCategory}
            onOpenAddCategory={onOpenAddCategory}
          />
        ))}
      </View>
    </Pressable>
  </Card>
);

const KidDashboardCard = React.memo(KidDashboardCardComponent);

export const KidsListScreen: React.FC<Props> = ({ navigation }) => {
  const { children, childItems, items, customCategories, logEvent, settings, updateSettings, canCreateAnotherKid, reorderChildren } = useData();
  const { openPromote, promoteModal } = usePromoteChildSize();
  const hasOnlySampleKids = children.length > 0 && children.every((child) => isSampleChildId(child.id));
  const previewCategories = useMemo(() => getConfiguredKidsPreviewCategories(settings, customCategories), [settings, customCategories]);
  const [showKidLimitModal, setShowKidLimitModal] = useState(false);
  const [kidLimitCurrentCount, setKidLimitCurrentCount] = useState(children.length);
  const showKidLimit = useCallback((current: number) => {
    setKidLimitCurrentCount(current);
    setShowKidLimitModal(true);
  }, []);

  useEffect(() => {
    void logEvent('kids_dashboard_opened');
  }, [logEvent]);

  const openCategoryFromKids = useCallback((childId: string, category: string) => {
    void logEvent('kid_category_tile_clicked', { childId, category });
    (navigation.getParent() as any)?.navigate('Closet', {
      screen: 'CategorySnapshot',
      params: { childId, category, sizeMode: 'both' },
    });
  }, [logEvent, navigation]);

  const openAddCategoryFromKids = useCallback((childId: string, category: string) => {
    (navigation.getParent() as any)?.navigate('Closet', {
      screen: 'AddItem',
      params: {
        prefillStatus: 'owned',
        prefillChildId: childId,
        prefillCategory: category,
        prefillType: closetCategoryToClothingType(category),
      },
    });
  }, [navigation]);

  const openChildDashboard = useCallback((childId: string) => {
    void logEvent('kid_card_opened', { childId });
    navigation.navigate('ChildDashboard', { childId });
  }, [logEvent, navigation]);

  const openPromoteForChild = useCallback((childId: string) => {
    const full = children.find((entry) => entry.id === childId);
    if (!full) return;
    openPromote({ child: full });
  }, [children, openPromote]);

  const attemptOpenKidForm = useCallback(async () => {
    const result = await canCreateAnotherKid();
    if (!result.ok) {
      showKidLimit(result.current);
      return;
    }
    navigation.navigate('KidForm');
  }, [canCreateAnotherKid, navigation, showKidLimit]);

  const moveChild = useCallback(async (childId: string, direction: 'up' | 'down') => {
    const currentIndex = children.findIndex((child) => child.id === childId);
    if (currentIndex < 0) return;
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= children.length) return;

    const nextChildren = [...children];
    const [movedChild] = nextChildren.splice(currentIndex, 1);
    nextChildren.splice(nextIndex, 0, movedChild);

    await reorderChildren(nextChildren.map((child) => child.id));
    await logEvent('kids_reordered', {
      childId,
      direction,
      newIndex: nextIndex,
      defaultClosetChildId: nextChildren[0]?.id ?? null,
    });
  }, [children, logEvent, reorderChildren]);

  const childCards = useMemo<KidCardData[]>(() => (
    children.map((child) => {
      const childData = getChildItems(child, items, childItems);
      const owned = childData.items.filter((item) => item.status === 'owned');
      const categoryCounts = owned.reduce((acc, item) => {
        const key = itemCategoryKey(item);
        acc.set(key, (acc.get(key) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());
      const categoryHero = owned.reduce((acc, item) => {
        const key = itemCategoryKey(item);
        if (acc.has(key)) return acc;
        const uri = getItemDisplayImageUri(item) || '';
        if (uri) acc.set(key, uri);
        return acc;
      }, new Map<string, string>());
      const nowLabel = child.currentSize.code ? formatSizeDisplay(child.currentSize.code, child.currentSize.otherText ?? null) : (getChildCurrentSizeText(child) ?? 'Not set');
      const nextLabel = child.nextSize.code ? formatSizeDisplay(child.nextSize.code, child.nextSize.otherText ?? null) : (getChildNextSizeText(child) ?? 'Not set');
      const promoteLabel = child.nextSize.code ? formatSizeDisplay(child.nextSize.code, child.nextSize.otherText ?? null) : undefined;
      return {
        id: child.id,
        name: child.name,
        sortOrder: child.sortOrder,
        photoUri: child.photoUri,
        initial: (child.name.trim()[0] || '?').toUpperCase(),
        nowLabel,
        nextLabel,
        isSample: isSampleChildId(child.id),
        usesMixedSizes: child.usesMixedSizes,
        canPromote: canPromoteChildSize(child),
        promoteLabel,
        miniTiles: previewCategories.map((category) => ({
          category,
          uri: categoryHero.get(category),
          count: categoryCounts.get(category) ?? 0,
        })),
      };
    })
  ), [children, items, childItems, previewCategories]);

  return (
    <Screen
      scroll={false}
      style={styles.screen}
      overlay={<FloatingActionButton onPress={() => void attemptOpenKidForm()} accessibilityLabel="Add kid" testID="kids-fab-add" />}
    >
      {children.length === 0 ? (
        <EmptyState
          title="No kids added yet."
          subtitle="Add a child profile to start organizing their closet and wishlist."
          actionLabel="Add Kid"
          onActionPress={() => void attemptOpenKidForm()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {children.length > BETA_MAX_KIDS && !settings.betaKidLimitBannerDismissed ? (
            <Card>
              <Text style={styles.betaLimitBannerText}>You’re over the beta limit. Creating new children is temporarily disabled.</Text>
              <PrimaryButton label="Got it" variant="secondary" onPress={() => void updateSettings({ betaKidLimitBannerDismissed: true })} />
            </Card>
          ) : null}
          <Text style={styles.reorderHint}>Kid order sets your default closet. The top kid is used anywhere the app needs a default.</Text>
          {hasOnlySampleKids ? (
            <Card>
              <Text style={styles.sampleBannerTitle}>Sample kids</Text>
              <Text style={styles.meta}>These are demo profiles. When you add your own kid, sample kids are removed automatically.</Text>
            </Card>
          ) : null}
          {childCards.map((child) => (
            <KidDashboardCard
              key={child.id}
              child={child}
              customCategories={customCategories}
              isDefaultCloset={child.id === childCards[0]?.id}
              canMoveUp={child.id !== childCards[0]?.id}
              canMoveDown={child.id !== childCards[childCards.length - 1]?.id}
              onOpenChild={openChildDashboard}
              onOpenCategory={openCategoryFromKids}
              onOpenAddCategory={openAddCategoryFromKids}
              onPromote={openPromoteForChild}
              onMove={moveChild}
            />
          ))}
        </ScrollView>
      )}

      {promoteModal}
      <BetaKidLimitModal
        visible={showKidLimitModal}
        onClose={() => setShowKidLimitModal(false)}
        onSendFeedback={() => { void openKidLimitFeedbackEmail(kidLimitCurrentCount); }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingBottom: 76,
  },
  listContent: {
    gap: 16,
    paddingBottom: 76,
  },
  cardPressable: {
    gap: 14,
  },
  cardPressablePressed: {
    opacity: 0.96,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F1A17',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  defaultClosetBadge: {
    backgroundColor: '#E7F1EA',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  defaultClosetBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#355642',
  },
  sizeLine: {
    fontSize: 13,
    color: '#716A63',
    fontWeight: '600',
  },
  reorderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  reorderButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8CCC0',
    backgroundColor: '#FFF8F2',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reorderButtonDisabled: {
    backgroundColor: '#F5F1EC',
    borderColor: '#E7DED5',
  },
  reorderButtonPressed: {
    opacity: 0.9,
  },
  reorderButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A4039',
  },
  reorderButtonTextDisabled: {
    color: '#A79A8F',
  },
  mixedSizesBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#EEF3EE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mixedSizesBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4E6452',
  },
  promotePill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#F6E3DA',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  promotePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A3128',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F4EEE8',
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F6F1EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#716A63',
  },
  miniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniTile: {
    width: '31%',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAE1D8',
    padding: 8,
    gap: 4,
  },
  miniTilePressed: {
    opacity: 0.94,
  },
  miniTileImage: {
    width: '100%',
    aspectRatio: 1.15,
    borderRadius: 10,
    backgroundColor: '#F4EEE8',
  },
  miniTilePlaceholder: {
    width: '100%',
    aspectRatio: 1.15,
    borderRadius: 10,
    backgroundColor: '#F4EEE8',
    borderWidth: 1,
    borderColor: '#EAE1D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTilePlaceholderText: {
    color: '#9A8E83',
  },
  miniTileLabel: {
    fontSize: 11,
    color: '#716A63',
    fontWeight: '600',
  },
  miniTileCount: {
    fontSize: 18,
    color: '#1F1A17',
    fontWeight: '700',
  },
  miniTileHint: {
    fontSize: 9,
    color: '#9A8E83',
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
    color: '#716A63',
  },
  betaLimitBannerText: {
    fontSize: 14,
    color: '#4A4039',
    marginBottom: 8,
  },
  reorderHint: {
    fontSize: 13,
    color: '#716A63',
    paddingHorizontal: 4,
  },
  sampleBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F1A17',
  },
});
