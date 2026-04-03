import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, Linking, Platform, Pressable, StyleSheet, Text, Vibration, View, useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BstImageGenerationHost } from '@/components/bst/BstImageGenerationHost';
import { BstCollageRenderer, BstItemCardRenderer } from '@/components/bst/BstAssetRenderers';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import {
  trackBstCardLimitHit,
  trackBstCollageGenerated,
  trackBstItemCardGenerated,
  trackBstItemCardGeneratedCount,
  trackBstListingTextCopied,
  trackBstPreviewOpened,
} from '@/services/bst/bstAnalytics';
import { FREE_BST_ITEM_CARD_LIMIT, getRemainingFreeBstCardSlots, sanitizeFreeGeneratedCardItemIds } from '@/services/bst/bstLimits';
import { buildSaleDraftName, resolveSaleDraftItems } from '@/services/bst/draft';
import { buildCollageViewModels, BstImageGeneratorHandle, generateCollages, generateItemCards } from '@/services/bst/bstImageGenerator';
import { canGenerateUnlimitedCards, hasProAccess } from '@/services/proAccess';
import { buildSaleDraftItemCommentText, buildSaleDraftMainPostText } from '@/services/bst/text';
import { useAppTheme } from '@/theme';
import { copyTextToClipboard } from '@/utils/copyPostUi';
import { ensurePhotoLibrarySavePermission, saveImageToPhotoLibrary } from '@/utils/photoLibrary';

type Props = NativeStackScreenProps<ClosetStackParamList, 'BstSaleDraftPreview'>;

const triggerLightHaptic = () => {
  try {
    const Haptics = require('expo-haptics');
    if (Haptics?.impactAsync && Haptics?.ImpactFeedbackStyle?.Light) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
  } catch {
    // Fall back to a tiny vibration pulse when haptics isn't available.
  }
  Vibration.vibrate(10);
};

const LockedCardPressable: React.FC<React.PropsWithChildren<{ onUnlock: () => void }>> = ({ onUnlock, children }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const unlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedRef = useRef(false);

  useEffect(() => () => {
    if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
  }, []);

  const handlePressIn = () => {
    pressedRef.current = true;
    if (unlockTimeoutRef.current) {
      clearTimeout(unlockTimeoutRef.current);
      unlockTimeoutRef.current = null;
    }
    triggerLightHaptic();
    scale.stopAnimation();
    Animated.timing(scale, {
      toValue: 0.97,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    scale.stopAnimation();
    Animated.spring(scale, {
      toValue: 1,
      speed: 20,
      bounciness: 5,
      useNativeDriver: true,
    }).start();
    unlockTimeoutRef.current = setTimeout(() => {
      onUnlock();
      unlockTimeoutRef.current = null;
    }, 70);
  };

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
};

export const BstSaleDraftPreviewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { saleDrafts, saleDraftItems, items, settings, purchaseState, updateSaleDraft, updateSettings, logEvent } = useData();
  const theme = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [capturedCollageUris, setCapturedCollageUris] = useState<string[]>([]);
  const [capturedItemUrisByDraftItemId, setCapturedItemUrisByDraftItemId] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [progressFraction, setProgressFraction] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [copiedDraftItemIds, setCopiedDraftItemIds] = useState<string[]>([]);
  const [recentlyCopiedDraftItemIds, setRecentlyCopiedDraftItemIds] = useState<string[]>([]);
  const [postedDraftItemIds, setPostedDraftItemIds] = useState<string[]>([]);
  const generatorRef = useRef<BstImageGeneratorHandle | null>(null);
  const didLogOpenRef = useRef(false);
  const hasShownPostingGuideRef = useRef(Boolean(settings.hasSeenBstPostingGuide));
  const hasShownFirstCommentCopyHintRef = useRef(false);
  const draft = saleDrafts.find((entry) => entry.id === route.params.draftId);
  const resolvedItems = useMemo(() => {
    if (!draft) return [];
    return resolveSaleDraftItems(draft, saleDraftItems.filter((entry) => entry.saleDraftId === draft.id), items);
  }, [draft, items, saleDraftItems]);
  const proAccessEnabled = hasProAccess(settings, purchaseState);
  const unlimitedCards = canGenerateUnlimitedCards(settings, purchaseState);
  const brandingMode: 'free' | 'pro' = proAccessEnabled ? 'pro' : 'free';
  const customHeaderImageUri = draft?.customHeaderImageUri?.trim() || undefined;
  const usingCustomHeaderImage = Boolean(customHeaderImageUri);
  const collagePages = useMemo(() => (draft ? buildCollageViewModels({ draft, resolvedItems, brandingMode }) : []), [brandingMode, draft, resolvedItems]);
  const previewWidth = Math.max(280, windowWidth - theme.spacing.screen * 2 - theme.spacing.cardPadding * 2);

  const validDraftItemIds = resolvedItems.map((entry) => entry.draftItem.id);
  const selectedFreeCardDraftItemIds = sanitizeFreeGeneratedCardItemIds(draft?.freeGeneratedCardItemIds ?? [], validDraftItemIds);
  const previewIncludedDraftItemIds = unlimitedCards
    ? validDraftItemIds
    : (selectedFreeCardDraftItemIds.length > 0
      ? selectedFreeCardDraftItemIds.slice(0, FREE_BST_ITEM_CARD_LIMIT)
      : resolvedItems.slice(0, FREE_BST_ITEM_CARD_LIMIT).map((entry) => entry.draftItem.id));
  const remainingFreeCardSlots = getRemainingFreeBstCardSlots(previewIncludedDraftItemIds);
  const freeGenerationConsumed = Boolean(draft?.freeGenerationConsumedAt);
  const unlockedDraftItemIds = previewIncludedDraftItemIds;
  const shouldShowLockedCards = !unlimitedCards && resolvedItems.length > FREE_BST_ITEM_CARD_LIMIT;
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedStateTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const styles = StyleSheet.create({
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    body: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    textBlock: {
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 14,
      gap: 12,
    },
    textContent: {
      fontSize: 14,
      color: theme.colors.textPrimary,
      lineHeight: 21,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    previewStack: {
      gap: 14,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statusText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      flex: 1,
    },
    progressWrap: {
      gap: 8,
      marginTop: 8,
    },
    progressTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.colors.accentPrimary,
    },
    freeTierCard: {
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    lockedPreviewWrap: {
      position: 'relative',
    },
    lockedPreviewDimmed: {
      opacity: 0.5,
    },
    lockedOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor: 'rgba(17,24,39,0.44)',
      padding: 20,
      gap: 8,
    },
    lockedOverlayTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    lockedOverlayBody: {
      fontSize: 13,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.96)',
    },
    itemSection: {
      gap: 12,
      paddingBottom: 18,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    stateLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.colors.textSecondary,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    unlockBanner: {
      gap: 10,
      padding: 14,
      borderRadius: 18,
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    unlockBannerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    subtleLimitNote: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
      marginBottom: 6,
    },
    unlockButtonWrap: {
      gap: 6,
      alignItems: 'stretch',
    },
    unlockButtonNote: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    unlockSubtext: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textSecondary,
    },
    previewNote: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    limitCallout: {
      gap: 2,
      marginTop: 6,
      marginBottom: 4,
    },
    limitTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    limitBody: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    upgradeSection: {
      gap: 8,
      marginTop: 4,
    },
    stickyFooter: {
      marginHorizontal: theme.spacing.screen,
      marginBottom: 10,
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      borderWidth: theme.isDark ? 1 : 0.5,
      borderColor: theme.colors.border,
      padding: 14,
      gap: 10,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    stickyFooterText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    helperTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    sectionHeaderWrap: {
      gap: 4,
    },
    commentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    commentInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    commentNumber: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    commentSummary: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    rowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    miniAction: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    miniActionText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    postedChip: {
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    lockedHint: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
  });

  useEffect(() => {
    hasShownPostingGuideRef.current = Boolean(settings.hasSeenBstPostingGuide);
  }, [settings.hasSeenBstPostingGuide]);

  useEffect(() => () => {
    if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
    Object.values(copiedStateTimeoutsRef.current).forEach((timeout) => clearTimeout(timeout));
  }, []);

  useEffect(() => {
    if (!draft) return;
    if (!draft.previewVisitedAt) {
      void updateSaleDraft(draft.id, { previewVisitedAt: Date.now() });
    }
    if (didLogOpenRef.current) return;
    didLogOpenRef.current = true;
    void trackBstPreviewOpened(logEvent, {
      draftId: draft.id,
      itemCount: resolvedItems.length,
      selectedFreeCardCount: selectedFreeCardDraftItemIds.length,
      isPro: proAccessEnabled,
      triggeredFrom: 'preview',
    });
  }, [draft, logEvent, proAccessEnabled, resolvedItems.length, selectedFreeCardDraftItemIds.length, updateSaleDraft]);

  useEffect(() => {
    if (!draft) return;
    const storedIds = draft.freeGeneratedCardItemIds ?? [];
    if (storedIds.length === selectedFreeCardDraftItemIds.length && storedIds.every((id, index) => id === selectedFreeCardDraftItemIds[index])) {
      return;
    }
    void updateSaleDraft(draft.id, { freeGeneratedCardItemIds: selectedFreeCardDraftItemIds });
  }, [draft?.freeGeneratedCardItemIds, draft?.id, selectedFreeCardDraftItemIds, updateSaleDraft]);

  if (!draft) {
    return (
      <Screen>
        <EmptyState title="Draft not found" subtitle="This BST draft is no longer available." />
      </Screen>
    );
  }

  if (!resolvedItems.length) {
    return (
      <Screen>
        <EmptyState title="No items in this draft" subtitle="Add or restore draft items before generating previews." />
      </Screen>
    );
  }

  const draftName = buildSaleDraftName(draft);
  const mainPostText = buildSaleDraftMainPostText(draft, resolvedItems);
  const goToPaywall = (
    source: 'bst_card_limit' | 'bst_draft_limit' | 'bst_locked_export' | 'bst_locked_card' | 'bst_save_all_cards' | 'bst_save_collage_locked',
  ) => {
    if (source !== 'bst_draft_limit') {
      void trackBstCardLimitHit(logEvent, {
        draftId: draft.id,
        itemCount: resolvedItems.length,
        selectedFreeCardCount: selectedFreeCardDraftItemIds.length,
        remainingFreeCards: remainingFreeCardSlots,
        isPro: proAccessEnabled,
        triggeredFrom: source,
      });
    }
    navigation.navigate('ProPaywall', { source, draftId: draft.id, totalItems: resolvedItems.length });
  };

  const getOrCreateFreeUnlockIds = async () => {
    if (unlimitedCards) return resolvedItems.map((entry) => entry.draftItem.id);
    if (selectedFreeCardDraftItemIds.length > 0) return selectedFreeCardDraftItemIds;
    if (freeGenerationConsumed) {
      goToPaywall('bst_card_limit');
      return undefined;
    }
    const nextUnlockIds = resolvedItems.slice(0, FREE_BST_ITEM_CARD_LIMIT).map((entry) => entry.draftItem.id);
    await updateSaleDraft(draft.id, {
      freeGeneratedCardItemIds: nextUnlockIds,
      freeGenerationConsumedAt: Date.now(),
    });
    return nextUnlockIds;
  };

  const generateAssets = async ({ includeCollage = true, includeItemCards = true }: { includeCollage?: boolean; includeItemCards?: boolean } = {}) => {
    if (!draft || generating) return;
    try {
      setGenerating(true);
      setGenerationStatus(includeCollage && includeItemCards ? 'Preparing BST images…' : includeItemCards ? 'Preparing item images…' : 'Preparing collage…');
      setProgressFraction(0.04);
      if (includeCollage) setCapturedCollageUris([]);
      setCapturedItemUrisByDraftItemId({});
      const baseInput = { draft, resolvedItems, brandingMode };
      const collageUris = includeCollage
        ? (usingCustomHeaderImage
        ? []
        : await generateCollages(generatorRef, baseInput, {
            onProgress: (progress) => {
              setGenerationStatus(progress.label);
              setProgressFraction(Math.min(0.48, progress.current / Math.max(1, progress.total) * 0.48));
            },
          }))
        : [];
      if (includeCollage && !usingCustomHeaderImage) {
        await trackBstCollageGenerated(logEvent, {
          draftId: draft.id,
          itemCount: resolvedItems.length,
          generatedCollageCount: collageUris.length,
          isPro: proAccessEnabled,
          triggeredFrom: 'preview',
        });
      }
      let nextItemUris: Record<string, string> = {};
      const itemCardDraftItemIds = unlimitedCards ? resolvedItems.map((entry) => entry.draftItem.id) : await getOrCreateFreeUnlockIds();
      if (includeItemCards && itemCardDraftItemIds && itemCardDraftItemIds.length > 0) {
        const allDraftItemIds = resolvedItems.map((entry) => entry.draftItem.id);
        const itemUris = await generateItemCards(generatorRef, { ...baseInput, itemCardDraftItemIds: allDraftItemIds }, {
          onProgress: (progress) => {
            setGenerationStatus(progress.label);
            setProgressFraction(includeCollage ? 0.5 + ((progress.current / Math.max(1, progress.total)) * 0.38) : 0.12 + ((progress.current / Math.max(1, progress.total)) * 0.7));
          },
        });
        nextItemUris = Object.fromEntries(resolvedItems.map((entry, index) => [entry.draftItem.id, itemUris[index]]));
        await Promise.all(
          resolvedItems.map((entry) =>
            trackBstItemCardGenerated(logEvent, {
              draftId: draft.id,
              itemId: entry.inventoryItem.id,
              itemCount: resolvedItems.length,
              isPro: proAccessEnabled,
              triggeredFrom: 'preview',
            })),
        );
        await trackBstItemCardGeneratedCount(logEvent, {
          draftId: draft.id,
          itemCount: resolvedItems.length,
          generatedCardCount: itemUris.length,
          isPro: proAccessEnabled,
          triggeredFrom: 'preview',
        });
      }
      if (includeCollage) {
        setCapturedCollageUris(collageUris);
      }
      setCapturedItemUrisByDraftItemId(nextItemUris);
      if (unlimitedCards) {
        setGenerationStatus(
          includeItemCards
            ? (includeCollage
              ? (usingCustomHeaderImage
            ? `Custom header image ready and ${Object.keys(nextItemUris).length} item card${Object.keys(nextItemUris).length === 1 ? '' : 's'} generated.`
            : `Generated ${collageUris.length} collage image${collageUris.length === 1 ? '' : 's'} and ${Object.keys(nextItemUris).length} item card${Object.keys(nextItemUris).length === 1 ? '' : 's'}.`)
              : `Generated ${Object.keys(nextItemUris).length} item card${Object.keys(nextItemUris).length === 1 ? '' : 's'}.`)
            : usingCustomHeaderImage
            ? `Custom header image ready and ${Object.keys(nextItemUris).length} item card${Object.keys(nextItemUris).length === 1 ? '' : 's'} generated.`
            : `Generated ${collageUris.length} collage image${collageUris.length === 1 ? '' : 's'}.`,
        );
      } else {
        setGenerationStatus(
          includeItemCards
            ? (includeCollage
              ? (usingCustomHeaderImage
            ? `Custom header image ready. You’ve created ${FREE_BST_ITEM_CARD_LIMIT} free item cards. Unlock Pro to generate the rest.`
            : `Generated ${collageUris.length} collage image${collageUris.length === 1 ? '' : 's'}. You’ve created ${FREE_BST_ITEM_CARD_LIMIT} free item cards. Unlock Pro to generate the rest.`)
              : `You’ve created ${FREE_BST_ITEM_CARD_LIMIT} free item cards. Unlock Pro to generate the rest.`)
            : usingCustomHeaderImage
            ? 'Custom header image ready.'
            : `Generated ${collageUris.length} collage image${collageUris.length === 1 ? '' : 's'}.`,
        );
      }
      return { collageUris, itemUrisByDraftItemId: nextItemUris, unlockedDraftItemIds: itemCardDraftItemIds ?? [] };
    } catch (error) {
      setGenerationStatus(null);
      setProgressFraction(null);
      const message = error instanceof Error && error.message ? error.message : 'Try again after the previews finish loading.';
      Alert.alert('Generation failed', message);
      return undefined;
    } finally {
      setGenerating(false);
    }
  };

  const copyText = (label: string, text: string, locked = false) => {
    if (locked) {
      goToPaywall('bst_locked_export');
      return;
    }
    const copied = copyTextToClipboard(text);
    if (copied) {
      void trackBstListingTextCopied(logEvent, {
        draftId: draft.id,
        itemCount: resolvedItems.length,
        copyType: label,
        isPro: proAccessEnabled,
        triggeredFrom: 'preview',
      });
    }
    if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
    if (copied) {
      const isCommentCopy = label.startsWith('Comment #');
      if (isCommentCopy && !hasShownFirstCommentCopyHintRef.current) {
        hasShownFirstCommentCopyHintRef.current = true;
        setCopyFeedback('Paste into your Facebook comment');
      } else {
        setCopyFeedback(
          label === 'Post text'
            ? 'Copied — paste into your post'
            : 'Copied — paste into comment',
        );
      }
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopyFeedback(null);
        copyFeedbackTimeoutRef.current = null;
      }, 2600);
      return;
    }
    Alert.alert('Unable to copy', 'Clipboard is not available on this device.');
  };

  const copyItemComment = (draftItemId: string, itemNumber: number, text: string) => {
    copyText(`Comment #${itemNumber}`, text);
    setCopiedDraftItemIds((current) => (current.includes(draftItemId) ? current : [...current, draftItemId]));
    setRecentlyCopiedDraftItemIds((current) => (current.includes(draftItemId) ? current : [...current, draftItemId]));
    if (copiedStateTimeoutsRef.current[draftItemId]) {
      clearTimeout(copiedStateTimeoutsRef.current[draftItemId]);
    }
    copiedStateTimeoutsRef.current[draftItemId] = setTimeout(() => {
      setRecentlyCopiedDraftItemIds((current) => current.filter((id) => id !== draftItemId));
      delete copiedStateTimeoutsRef.current[draftItemId];
    }, 1500);
  };

  const openPhotosApp = async () => {
    const url = Platform.select({
      ios: 'photos-redirect://',
      android: 'content://media/external/images/media',
      default: undefined,
    });
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open Photos', 'Your images were saved successfully. Open your Photos app to continue posting.');
    }
  };

  const maybeShowPostingGuide = async () => {
    if (hasShownPostingGuideRef.current) return;
    hasShownPostingGuideRef.current = true;
    try {
      await updateSettings({ hasSeenBstPostingGuide: true });
    } catch {
      // Best effort only; still show the guide this time.
    }
    Alert.alert(
      'Nice — your post is ready 🎉',
      '1. Save images\n2. Paste post text\n3. Copy each item into comments\n\nNext time this will be even faster',
    );
  };

  const showExportSuccess = (savedCount: number, itemCardCount: number, collageIncluded: boolean) => {
    setGenerationStatus(`Saved ${savedCount} image${savedCount === 1 ? '' : 's'} to Photos`);
    setProgressFraction(null);
    Alert.alert(
      'Saved to Photos',
      collageIncluded
        ? `Saved ${savedCount} images ✔\n1 collage + ${itemCardCount} item card${itemCardCount === 1 ? '' : 's'}`
        : `Saved ${savedCount} free item${savedCount === 1 ? '' : 's'} ✔\nUnlock to export all items`,
      [
        {
          text: 'Open Photos',
          onPress: () => {
            void openPhotosApp();
            void maybeShowPostingGuide();
          },
        },
        {
          text: 'Copy post text',
          onPress: () => {
            copyText('Post text', mainPostText);
            void maybeShowPostingGuide();
          },
        },
        {
          text: 'OK',
          onPress: () => {
            void maybeShowPostingGuide();
          },
        },
      ],
    );
  };

  const handleSaveItemCards = async () => {
    if (exporting || generating) return;
    setExporting(true);
    setGenerationStatus('Saving item cards…');
    setProgressFraction(0.08);
    try {
      const allowed = await ensurePhotoLibrarySavePermission();
      if (!allowed) {
        setProgressFraction(null);
        setGenerationStatus(null);
        return;
      }
      const generated = await generateAssets({ includeCollage: false, includeItemCards: true });
      const itemUrisByDraftItemId = generated?.itemUrisByDraftItemId ?? capturedItemUrisByDraftItemId;
      const allowedDraftItemIds = unlimitedCards
        ? resolvedItems.map((entry) => entry.draftItem.id)
        : (generated?.unlockedDraftItemIds.length ? generated.unlockedDraftItemIds : unlockedDraftItemIds).slice(0, FREE_BST_ITEM_CARD_LIMIT);
      const orderedUris = resolvedItems
        .filter((entry) => allowedDraftItemIds.includes(entry.draftItem.id))
        .map((entry) => itemUrisByDraftItemId[entry.draftItem.id])
        .filter((value): value is string => Boolean(value));

      let savedCount = 0;
      const totalToSave = orderedUris.length;
      for (const uri of orderedUris) {
        const saved = await saveImageToPhotoLibrary(uri);
        if (saved) savedCount += 1;
        setGenerationStatus(totalToSave > 0 ? `Saving item card ${savedCount} of ${totalToSave}…` : 'Saving item cards…');
        setProgressFraction(totalToSave > 0 ? 0.82 + ((savedCount / totalToSave) * 0.18) : 0.9);
      }
      if (savedCount > 0) {
        showExportSuccess(savedCount, orderedUris.length, false);
        setCopyFeedback('Saved — open Facebook to post');
        if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
        copyFeedbackTimeoutRef.current = setTimeout(() => {
          setCopyFeedback(null);
          copyFeedbackTimeoutRef.current = null;
        }, 2600);
      } else {
        Alert.alert('Unable to save images', 'Try again after the previews finish loading.');
        setGenerationStatus(null);
        setProgressFraction(null);
      }
    } catch (error) {
      if (__DEV__) console.warn('[BST] save item images failed', error);
      setGenerationStatus(null);
      setProgressFraction(null);
      Alert.alert('Unable to save images', 'Something went wrong while saving your item images.');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveCollage = async () => {
    if (exporting || generating) return;
    setExporting(true);
    setGenerationStatus('Saving collage…');
    setProgressFraction(0.08);
    try {
      const allowed = await ensurePhotoLibrarySavePermission();
      if (!allowed) {
        setProgressFraction(null);
        setGenerationStatus(null);
        return;
      }
      let collageUri = usingCustomHeaderImage ? customHeaderImageUri : undefined;
      if (!collageUri) {
        const collageUris = await generateCollages(
          generatorRef,
          {
            draft,
            resolvedItems,
            brandingMode,
            collagePreviewMode: unlimitedCards ? 'export' : 'free-preview',
          },
          {
            onProgress: (progress) => {
              setGenerationStatus(progress.label);
              setProgressFraction(Math.min(0.8, progress.current / Math.max(1, progress.total) * 0.8));
            },
          },
        );
        collageUri = collageUris[0];
        if (unlimitedCards) {
          setCapturedCollageUris(collageUris);
        }
      }
      if (!collageUri) {
        Alert.alert('Unable to save collage', 'Try again after the preview finishes loading.');
        setProgressFraction(null);
        return;
      }
      const saved = await saveImageToPhotoLibrary(collageUri);
      if (saved) {
        setGenerationStatus('Saved 1 image to Photos');
        setProgressFraction(null);
        setCopyFeedback('Saved — open Facebook to post');
        if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
        copyFeedbackTimeoutRef.current = setTimeout(() => {
          setCopyFeedback(null);
          copyFeedbackTimeoutRef.current = null;
        }, 2600);
      } else {
        Alert.alert('Unable to save collage', 'Try again after the preview finishes loading.');
        setProgressFraction(null);
        setGenerationStatus(null);
      }
    } catch (error) {
      if (__DEV__) console.warn('[BST] save collage failed', error);
      setGenerationStatus(null);
      setProgressFraction(null);
      Alert.alert('Unable to save collage', 'Something went wrong while saving your collage.');
    } finally {
      setExporting(false);
    }
  };

  const renderSaveStatus = () =>
    generating || exporting || generationStatus || copyFeedback ? (
      <View style={styles.progressWrap}>
        {(generating || exporting) && progressFraction !== null ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(6, Math.min(100, progressFraction * 100))}%` }]} />
          </View>
        ) : null}
        <View style={styles.statusRow}>
          {generating || exporting ? <ActivityIndicator color={theme.colors.accentPrimary} /> : null}
          <Text style={styles.statusText}>{copyFeedback ?? generationStatus ?? 'Working…'}</Text>
        </View>
      </View>
    ) : null;

  return (
    <Screen
      style={!unlimitedCards && shouldShowLockedCards ? { paddingBottom: theme.spacing.section + 110 } : undefined}
      overlay={
        !unlimitedCards && shouldShowLockedCards ? (
          <View style={styles.stickyFooter}>
            <Text style={styles.stickyFooterText}>Unlock all items • $9.99</Text>
            <PrimaryButton label="Unlock all items" onPress={() => goToPaywall('bst_save_all_cards')} />
          </View>
        ) : undefined
      }
    >
      <Card>
        <Text style={styles.title}>Your post is almost ready</Text>
        <Text style={styles.previewNote}>{`Post to Facebook in 3 steps:\n\n1. Save your images\n2. Paste post\n3. Copy items into comments`}</Text>
      </Card>

      {!unlimitedCards ? (
        <Card style={styles.freeTierCard}>
          <Text style={styles.sectionTitle}>Finish your post</Text>
          <Text style={styles.body}>{`${FREE_BST_ITEM_CARD_LIMIT} of ${resolvedItems.length} items included — unlock the rest and export clean images`}</Text>
          <View style={styles.upgradeSection}>
            <Text style={styles.unlockButtonNote}>Ready to post in seconds</Text>
            <PrimaryButton label="Unlock all items" onPress={() => goToPaywall('bst_save_all_cards')} />
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={styles.sectionHeaderWrap}>
          <Text style={styles.sectionTitle}>Images</Text>
        </View>
        <Text style={styles.helperTitle}>Main post image</Text>
        <View style={styles.previewStack}>
          {usingCustomHeaderImage && customHeaderImageUri ? (
            <View style={{ gap: 10 }}>
              <Image source={{ uri: customHeaderImageUri }} style={{ width: '100%', aspectRatio: 1.2, borderRadius: 24, backgroundColor: theme.colors.surfaceMuted }} resizeMode="cover" />
            </View>
          ) : (
            collagePages.map((page, index) => (
              <View key={`collage-page-${index}`} style={{ gap: 10 }}>
                <BstCollageRenderer
                  title={page.title}
                  pageIndex={page.pageIndex}
                  pageCount={page.pageCount}
                  items={page.items}
                  pageSize={page.pageSize}
                  width={previewWidth}
                  brandingMode={brandingMode}
                  previewMode={!unlimitedCards ? 'free-preview' : 'export'}
                />
              </View>
            ))
          )}
        </View>
        <View style={styles.actions}>
          <PrimaryButton
            label={exporting || generating ? 'Saving collage…' : 'Save collage'}
            onPress={() => void handleSaveCollage()}
            disabled={generating || exporting}
          />
        </View>
        <Text style={styles.helperTitle}>Comment images</Text>
        <View style={styles.actions}>
          <PrimaryButton
            label={exporting || generating ? 'Saving item images…' : !unlimitedCards ? 'Save item images (2 free)' : 'Save item images'}
            variant="secondary"
            onPress={() => void handleSaveItemCards()}
            disabled={generating || exporting}
          />
        </View>
        {!unlimitedCards ? (
          <>
            <View style={styles.limitCallout}>
              <Text style={styles.limitTitle}>{`2 of ${resolvedItems.length} items included`}</Text>
              <Text style={styles.limitBody}>Save 2 items free</Text>
              <Text style={styles.limitBody}>Unlock all items for full export</Text>
            </View>
            <View style={styles.actions}>
              <PrimaryButton label="Unlock all items" onPress={() => goToPaywall('bst_save_all_cards')} />
            </View>
          </>
        ) : null}
        {renderSaveStatus()}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Post text</Text>
        <View style={styles.textBlock}>
          <Text style={styles.textContent}>{mainPostText}</Text>
        </View>
        <Text style={styles.body}>Check group rules to see if they have specific formatting rules for sale posts.</Text>
        <View style={styles.actions}>
          <PrimaryButton label="Copy post" variant="secondary" onPress={() => copyText('Post text', mainPostText)} disabled={generating} />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Item comments</Text>
        <Text style={styles.body}>Copy each item&apos;s comment below your post</Text>
        {!unlimitedCards ? (
          <View style={styles.limitCallout}>
            <Text style={styles.limitTitle}>{`${FREE_BST_ITEM_CARD_LIMIT} of ${resolvedItems.length} items included`}</Text>
            <Text style={styles.limitBody}>Unlock all items to export the rest</Text>
          </View>
        ) : null}
        {resolvedItems.map((entry) => {
          const unlocked = unlockedDraftItemIds.includes(entry.draftItem.id);
          const showLockedCard = shouldShowLockedCards && !unlocked;
          const copied = copiedDraftItemIds.includes(entry.draftItem.id);
          const recentlyCopied = recentlyCopiedDraftItemIds.includes(entry.draftItem.id);
          const isPosted = postedDraftItemIds.includes(entry.draftItem.id);
          const summary = [entry.inventoryItem.brand?.trim(), entry.draftItem.price !== undefined ? `• ${entry.draftItem.price % 1 === 0 ? `$${entry.draftItem.price}` : `$${entry.draftItem.price.toFixed(2)}`}` : undefined]
            .filter(Boolean)
            .join(' ');
          return (
            <View key={entry.draftItem.id} style={styles.itemSection}>
              {!unlimitedCards ? <Text style={styles.stateLabel}>{showLockedCard ? 'Locked' : 'Included'}</Text> : null}
              <View style={[styles.previewStack, styles.lockedPreviewWrap]}>
                <Pressable
                  onPress={() => navigation.navigate('BstSaleDraftEditor', { draftId: draft.id, editDraftItemId: entry.draftItem.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit item ${entry.draftItem.itemNumber}`}
                  style={showLockedCard ? styles.lockedPreviewDimmed : undefined}
                >
                  <BstItemCardRenderer
                    draftTitle={draftName}
                    entry={entry}
                    width={previewWidth}
                    brandingMode={brandingMode}
                    previewMode={showLockedCard ? 'free-preview' : 'export'}
                  />
                </Pressable>
                {showLockedCard ? (
                  <LockedCardPressable onUnlock={() => goToPaywall('bst_locked_card')}>
                    <View style={styles.lockedOverlay}>
                      <Text style={styles.lockedOverlayTitle}>Locked</Text>
                      <Text style={styles.lockedOverlayBody}>Unlock to export</Text>
                    </View>
                  </LockedCardPressable>
                ) : null}
              </View>
              <View style={styles.commentRow}>
                <View style={styles.commentInfo}>
                  <Text style={styles.commentNumber}>#{entry.draftItem.itemNumber}</Text>
                  <Text numberOfLines={1} style={styles.commentSummary}>{summary || entry.inventoryItem.title}</Text>
                </View>
                <View style={styles.rowActions}>
                  {showLockedCard ? (
                    <Pressable style={styles.miniAction} onPress={() => goToPaywall('bst_locked_card')}>
                      <Text style={styles.miniActionText}>Unlock</Text>
                    </Pressable>
                  ) : (
                    <>
                      {!copied ? (
                        <Pressable
                          style={styles.miniAction}
                          onPress={() => copyItemComment(entry.draftItem.id, entry.draftItem.itemNumber, buildSaleDraftItemCommentText(entry))}
                        >
                          <Text style={styles.miniActionText}>Copy</Text>
                        </Pressable>
                      ) : recentlyCopied ? (
                        <View style={styles.miniAction}>
                          <Text style={styles.miniActionText}>Copied ✓</Text>
                        </View>
                      ) : (
                        <Pressable
                          style={[styles.miniAction, isPosted ? styles.postedChip : undefined]}
                          onPress={() => {
                            setPostedDraftItemIds((current) =>
                              current.includes(entry.draftItem.id)
                                ? current.filter((id) => id !== entry.draftItem.id)
                                : [...current, entry.draftItem.id],
                            );
                          }}
                        >
                          <Text style={styles.miniActionText}>{isPosted ? 'Posted' : 'Mark posted'}</Text>
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              </View>
            </View>
          );
        })}
        {!unlimitedCards && shouldShowLockedCards ? (
          <>
            <Text style={styles.body}>Unlock all items to export the rest</Text>
            <View style={styles.actions}>
              <PrimaryButton label="Unlock all items" onPress={() => goToPaywall('bst_save_all_cards')} />
              <PrimaryButton label="Post with 2 items (free)" variant="secondary" onPress={() => undefined} />
            </View>
          </>
        ) : null}
      </Card>
      <BstImageGenerationHost ref={generatorRef} />
    </Screen>
  );
};
