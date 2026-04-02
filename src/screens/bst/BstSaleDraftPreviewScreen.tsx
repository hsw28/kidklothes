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
import { buildSaleDraftAllItemCommentsText, buildSaleDraftBstCaptionText, buildSaleDraftItemCommentText, buildSaleDraftMainPostText } from '@/services/bst/text';
import { useAppTheme } from '@/theme';
import { copyTextToClipboard } from '@/utils/copyPostUi';
import { saveImageToPhotoLibrary } from '@/utils/photoLibrary';

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
  const generatorRef = useRef<BstImageGeneratorHandle | null>(null);
  const didLogOpenRef = useRef(false);
  const hasShownPostingGuideRef = useRef(Boolean(settings.hasSeenBstPostingGuide));
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
  const remainingFreeCardSlots = getRemainingFreeBstCardSlots(selectedFreeCardDraftItemIds);
  const freeGenerationConsumed = Boolean(draft?.freeGenerationConsumedAt);
  const unlockedDraftItemIds = unlimitedCards ? resolvedItems.map((entry) => entry.draftItem.id) : selectedFreeCardDraftItemIds;
  const unlockedEntries = resolvedItems.filter((entry) => unlockedDraftItemIds.includes(entry.draftItem.id));
  const shouldShowLockedCards = !unlimitedCards && freeGenerationConsumed;

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
    freeTierCard: {
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    lockedCard: {
      backgroundColor: theme.colors.surfaceMuted,
      borderStyle: 'dashed',
    },
    lockedPreviewWrap: {
      position: 'relative',
    },
    lockedPreviewDimmed: {
      opacity: 1,
    },
    lockedOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor: 'rgba(17,24,39,0.3)',
      padding: 20,
      gap: 8,
    },
    lockedOverlayTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
      borderRadius: 999,
      backgroundColor: 'rgba(17,24,39,0.42)',
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    itemSection: {
      gap: 12,
      paddingBottom: 18,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
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
  });

  useEffect(() => {
    hasShownPostingGuideRef.current = Boolean(settings.hasSeenBstPostingGuide);
  }, [settings.hasSeenBstPostingGuide]);

  useEffect(() => {
    if (!draft) return;
    if (didLogOpenRef.current) return;
    didLogOpenRef.current = true;
    void trackBstPreviewOpened(logEvent, {
      draftId: draft.id,
      itemCount: resolvedItems.length,
      selectedFreeCardCount: selectedFreeCardDraftItemIds.length,
      isPro: proAccessEnabled,
      triggeredFrom: 'preview',
    });
  }, [draft?.id, logEvent, proAccessEnabled, resolvedItems.length, selectedFreeCardDraftItemIds.length]);

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
  const allCommentsText = buildSaleDraftAllItemCommentsText(resolvedItems);
  const postText = buildSaleDraftBstCaptionText(draft, resolvedItems);

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

  const generateAssets = async () => {
    if (!draft || generating) return;
    try {
      setGenerating(true);
      setGenerationStatus('Preparing BST images…');
      setCapturedCollageUris([]);
      setCapturedItemUrisByDraftItemId({});
      const baseInput = { draft, resolvedItems, brandingMode };
      const collageUris = usingCustomHeaderImage
        ? []
        : await generateCollages(generatorRef, baseInput, {
            onProgress: (progress) => setGenerationStatus(progress.label),
          });
      if (!usingCustomHeaderImage) {
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
      if (itemCardDraftItemIds && itemCardDraftItemIds.length > 0) {
        const allDraftItemIds = resolvedItems.map((entry) => entry.draftItem.id);
        const itemUris = await generateItemCards(generatorRef, { ...baseInput, itemCardDraftItemIds: allDraftItemIds }, {
          onProgress: (progress) => setGenerationStatus(progress.label),
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
      setCapturedCollageUris(collageUris);
      setCapturedItemUrisByDraftItemId(nextItemUris);
      if (unlimitedCards) {
        setGenerationStatus(
          usingCustomHeaderImage
            ? `Custom header image ready and ${Object.keys(nextItemUris).length} item card${Object.keys(nextItemUris).length === 1 ? '' : 's'} generated.`
            : `Generated ${collageUris.length} collage image${collageUris.length === 1 ? '' : 's'} and ${Object.keys(nextItemUris).length} item card${Object.keys(nextItemUris).length === 1 ? '' : 's'}.`,
        );
      } else {
        setGenerationStatus(
          usingCustomHeaderImage
            ? `Custom header image ready. You’ve created ${FREE_BST_ITEM_CARD_LIMIT} free item cards. Unlock Pro to generate the rest.`
            : `Generated ${collageUris.length} collage image${collageUris.length === 1 ? '' : 's'}. You’ve created ${FREE_BST_ITEM_CARD_LIMIT} free item cards. Unlock Pro to generate the rest.`,
        );
      }
      Alert.alert(
        'BST assets ready',
        usingCustomHeaderImage
          ? unlimitedCards
            ? 'Your custom header image and item cards are ready to share.'
            : 'Your custom header image and full item-card preview are ready. Save the first two cards free, or unlock Pro for the rest.'
          : unlimitedCards
            ? 'Your collage image and item cards are ready to share.'
            : 'Your collage image and full item-card preview are ready. Save the first two cards free, or unlock Pro for the rest.',
      );
      return { collageUris, itemUrisByDraftItemId: nextItemUris, unlockedDraftItemIds: itemCardDraftItemIds ?? [] };
    } catch (error) {
      setGenerationStatus(null);
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
    if (copied && label === 'Post text') {
      Alert.alert('Copied post text ✔');
      return;
    }
    Alert.alert(copied ? 'Copied' : 'Unable to copy', copied ? `${label} copied to the clipboard.` : 'Clipboard is not available on this device.');
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
      'How to post',
      '1. Upload first image (collage)\n2. Paste caption\n3. Add item photos\n4. Comment item details',
    );
  };

  const showExportSuccess = (savedCount: number, itemCardCount: number) => {
    setGenerationStatus(`Saved ${savedCount} images to Photos`);
    Alert.alert(
      'Saved to Photos',
      `Saved ${savedCount} images ✔\n1 collage + ${itemCardCount} item card${itemCardCount === 1 ? '' : 's'}`,
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
            copyText('Post text', postText);
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

  const handleExportForBst = async () => {
    if (exporting || generating) return;
    setExporting(true);
    setGenerationStatus('Saving images…');
    if (!unlimitedCards && resolvedItems.length > FREE_BST_ITEM_CARD_LIMIT) {
      if (!freeGenerationConsumed) {
        await generateAssets();
      }
      setExporting(false);
      goToPaywall('bst_save_all_cards');
      return;
    }
    try {
      const generated = await generateAssets();
      const collageUri = usingCustomHeaderImage ? customHeaderImageUri : (generated?.collageUris[0] ?? capturedCollageUris[0]);
      const itemUrisByDraftItemId = generated?.itemUrisByDraftItemId ?? capturedItemUrisByDraftItemId;
      const orderedUris = resolvedItems
        .map((entry) => itemUrisByDraftItemId[entry.draftItem.id])
        .filter((value): value is string => Boolean(value));

      let savedCount = 0;
      if (collageUri) {
        const saved = await saveImageToPhotoLibrary(collageUri);
        if (saved) savedCount += 1;
      }
      for (const uri of orderedUris) {
        const saved = await saveImageToPhotoLibrary(uri);
        if (saved) savedCount += 1;
      }
      if (savedCount > 0) {
        showExportSuccess(savedCount, orderedUris.length);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>{draftName}</Text>
        <Text style={styles.body}>Save your BST images and copy your sale text from one place.</Text>
        <View style={styles.textBlock}>
          <Text style={styles.textContent}>
            {`You'll get:\n• 1 collage (cover photo)\n• ${resolvedItems.length} item card${resolvedItems.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton
            label={exporting || generating ? 'Saving images…' : 'Save post images'}
            onPress={() => void handleExportForBst()}
            disabled={generating || exporting}
          />
          <PrimaryButton
            label="Copy Post Text"
            variant="secondary"
            onPress={() => copyText('Post text', postText)}
            disabled={generating || exporting}
          />
        </View>
        {generating || generationStatus ? (
          <View style={styles.statusRow}>
            {generating ? <ActivityIndicator color={theme.colors.accentPrimary} /> : null}
            <Text style={styles.statusText}>{generationStatus ?? 'Working…'}</Text>
          </View>
        ) : null}
      </Card>

      {!unlimitedCards ? (
        <Card style={styles.freeTierCard}>
          <Text style={styles.sectionTitle}>Free plan</Text>
          <Text style={styles.body}>You can create 1 active draft, generate the full collage image, and preview every item card in this draft.</Text>
          <Text style={styles.body}>
            {!freeGenerationConsumed
              ? `Generate once to create cards for every item. You’ll be able to save the first ${FREE_BST_ITEM_CARD_LIMIT} cards free.`
              : unlockedDraftItemIds.length > 0
                ? `You’ve created ${FREE_BST_ITEM_CARD_LIMIT} free item cards. Unlock Pro to generate the rest.`
                : 'Changing items reset your generated cards. Unlock Pro to generate cards for this updated draft.'}
          </Text>
          {settings.developerModeEnabled ? (
            <Text style={styles.body}>
              Dev: generated free card ids {selectedFreeCardDraftItemIds.length}/{FREE_BST_ITEM_CARD_LIMIT} • consumed {freeGenerationConsumed ? 'yes' : 'no'}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
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
                />
              </View>
            ))
          )}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Post Text</Text>
        <View style={styles.textBlock}>
          <Text style={styles.textContent}>{postText}</Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton label="Copy Post Text" variant="secondary" onPress={() => copyText('Post text', postText)} disabled={generating} />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Main post text</Text>
        <View style={styles.textBlock}>
          <Text style={styles.textContent}>{mainPostText}</Text>
        </View>
        <Text style={styles.body}>Check group rules to see if they have specific formatting rules for sale posts.</Text>
        <View style={styles.actions}>
          <PrimaryButton label="Copy Main Post" variant="secondary" onPress={() => copyText('Main post', mainPostText)} disabled={generating} />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Item cards + comments</Text>
        <Text style={styles.body}>Save the generated item cards directly to your Photos app so they are ready to upload.</Text>
        {!unlimitedCards && shouldShowLockedCards ? (
          <View style={styles.unlockBanner}>
            <Text style={styles.unlockBannerTitle}>
              {resolvedItems.length > 0
                ? `${FREE_BST_ITEM_CARD_LIMIT} of ${resolvedItems.length} items ready — unlock the rest`
                : `${FREE_BST_ITEM_CARD_LIMIT} items ready — unlock the rest`}
            </Text>
            <View style={styles.unlockButtonWrap}>
              <PrimaryButton label="Unlock all items" onPress={() => goToPaywall('bst_save_all_cards')} />
              <Text style={styles.unlockButtonNote}>One-time purchase</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.actions}>
          <PrimaryButton
            label="Copy All Comments"
            variant="secondary"
            onPress={() => copyText('Item comments', allCommentsText)}
            disabled={generating}
          />
        </View>
        {resolvedItems.map((entry) => {
          const unlocked = unlockedDraftItemIds.includes(entry.draftItem.id);
          const showLockedCard = shouldShowLockedCards && !unlocked;
          return (
            <View key={entry.draftItem.id} style={styles.itemSection}>
              <View style={[styles.previewStack, styles.lockedPreviewWrap]}>
                <Pressable
                  onPress={() => navigation.navigate('BstSaleDraftEditor', { draftId: draft.id, editDraftItemId: entry.draftItem.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit item ${entry.draftItem.itemNumber}`}
                  style={showLockedCard ? styles.lockedPreviewDimmed : undefined}
                >
                  <BstItemCardRenderer draftTitle={draftName} entry={entry} width={previewWidth} brandingMode={brandingMode} />
                </Pressable>
                {showLockedCard ? (
                  <LockedCardPressable onUnlock={() => goToPaywall('bst_locked_card')}>
                    <View style={styles.lockedOverlay}>
                      <Text style={styles.lockedOverlayTitle}>🔒 Unlock</Text>
                    </View>
                  </LockedCardPressable>
                ) : null}
              </View>
              <View style={[styles.textBlock, showLockedCard ? styles.lockedCard : undefined]}>
                <Text style={styles.textContent}>{buildSaleDraftItemCommentText(entry)}</Text>
                {showLockedCard ? (
                  <Text style={styles.body}>
                    Unlock Pro to generate all cards
                  </Text>
                ) : null}
              </View>
              {unlimitedCards || unlocked || !shouldShowLockedCards ? (
                <View style={styles.actions}>
                  <PrimaryButton
                    label={`Copy Comment #${entry.draftItem.itemNumber}`}
                    variant="secondary"
                    disabled={generating}
                    onPress={() => copyText(`Comment #${entry.draftItem.itemNumber}`, buildSaleDraftItemCommentText(entry), showLockedCard)}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>
      <BstImageGenerationHost ref={generatorRef} />
    </Screen>
  );
};
