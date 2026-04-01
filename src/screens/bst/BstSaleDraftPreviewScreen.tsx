import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Sharing from 'expo-sharing';
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
  trackBstExportShared,
  trackBstItemCardGenerated,
  trackBstItemCardGeneratedCount,
  trackBstListingTextCopied,
  trackBstPreviewOpened,
} from '@/services/bst/bstAnalytics';
import { FREE_BST_ITEM_CARD_LIMIT, getRemainingFreeBstCardSlots, sanitizeFreeGeneratedCardItemIds } from '@/services/bst/bstLimits';
import { buildSaleDraftName, resolveSaleDraftItems } from '@/services/bst/draft';
import { buildCollageViewModels, BstImageGeneratorHandle, generateCollages, generateItemCards } from '@/services/bst/bstImageGenerator';
import { canGenerateUnlimitedCards, hasProAccess } from '@/services/proAccess';
import { buildSaleDraftAllItemCommentsText, buildSaleDraftItemCommentText, buildSaleDraftMainPostText } from '@/services/bst/text';
import { useAppTheme } from '@/theme';
import { copyTextToClipboard } from '@/utils/copyPostUi';

type Props = NativeStackScreenProps<ClosetStackParamList, 'BstSaleDraftPreview'>;

export const BstSaleDraftPreviewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { saleDrafts, saleDraftItems, items, settings, purchaseState, updateSaleDraft, logEvent } = useData();
  const theme = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [capturedCollageUris, setCapturedCollageUris] = useState<string[]>([]);
  const [capturedItemUrisByDraftItemId, setCapturedItemUrisByDraftItemId] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const generatorRef = useRef<BstImageGeneratorHandle | null>(null);
  const didLogOpenRef = useRef(false);
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
  const unlockedDraftItemIds = unlimitedCards ? resolvedItems.map((entry) => entry.draftItem.id) : selectedFreeCardDraftItemIds;
  const unlockedEntries = resolvedItems.filter((entry) => unlockedDraftItemIds.includes(entry.draftItem.id));
  const lockedEntries = resolvedItems.filter((entry) => !unlockedDraftItemIds.includes(entry.draftItem.id));

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
  });

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

  const goToPaywall = (source: 'bst_card_limit' | 'bst_draft_limit' | 'bst_locked_export') => {
    if (source === 'bst_card_limit') {
      void trackBstCardLimitHit(logEvent, {
        draftId: draft.id,
        itemCount: resolvedItems.length,
        selectedFreeCardCount: selectedFreeCardDraftItemIds.length,
        remainingFreeCards: remainingFreeCardSlots,
        isPro: proAccessEnabled,
        triggeredFrom: 'preview',
      });
    }
    navigation.navigate('ProPaywall', { source });
  };

  const handlePickFreeCard = async (draftItemId: string) => {
    if (unlimitedCards) return;
    if (selectedFreeCardDraftItemIds.includes(draftItemId)) return;
    if (selectedFreeCardDraftItemIds.length >= FREE_BST_ITEM_CARD_LIMIT) {
      goToPaywall('bst_card_limit');
      return;
    }
    await updateSaleDraft(draft.id, {
      freeGeneratedCardItemIds: [...selectedFreeCardDraftItemIds, draftItemId],
    });
    Alert.alert('Free card slot used', `This item is now one of your ${FREE_BST_ITEM_CARD_LIMIT} free generated item cards for this draft.`);
  };

  const captureAssets = async () => {
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
      if (unlockedDraftItemIds.length > 0) {
        const itemUris = await generateItemCards(generatorRef, { ...baseInput, itemCardDraftItemIds: unlockedDraftItemIds }, {
          onProgress: (progress) => setGenerationStatus(progress.label),
        });
        nextItemUris = Object.fromEntries(unlockedEntries.map((entry, index) => [entry.draftItem.id, itemUris[index]]));
        await Promise.all(
          unlockedEntries.map((entry) =>
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
            ? `Custom header image ready and ${Object.keys(nextItemUris).length} of ${FREE_BST_ITEM_CARD_LIMIT} free item cards generated for this draft.`
            : `Generated ${collageUris.length} collage image${collageUris.length === 1 ? '' : 's'} and ${Object.keys(nextItemUris).length} of ${FREE_BST_ITEM_CARD_LIMIT} free item cards for this draft.`,
        );
      }
      Alert.alert(
        'BST assets ready',
        usingCustomHeaderImage
          ? unlimitedCards
            ? 'Your custom header image and item cards are ready to share.'
            : 'Your custom header image and unlocked item cards are ready to share.'
          : unlimitedCards
            ? 'Your collage pages and item cards are ready to share.'
            : 'Your collage pages and unlocked item cards are ready to share.',
      );
    } catch (error) {
      setGenerationStatus(null);
      const message = error instanceof Error && error.message ? error.message : 'Try again after the previews finish loading.';
      Alert.alert('Generation failed', message);
    } finally {
      setGenerating(false);
    }
  };

  const shareUri = async (uri?: string, title?: string, locked = false) => {
    if (locked) {
      goToPaywall('bst_locked_export');
      return;
    }
    if (!uri) {
      Alert.alert('Generate assets first', 'Create the images before opening the share sheet.');
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title ?? 'Share BST asset' });
    await trackBstExportShared(logEvent, {
      draftId: draft.id,
      itemCount: resolvedItems.length,
      assetType: title?.toLowerCase().includes('collage') ? 'collage' : title?.toLowerCase().includes('header') ? 'header_image' : 'item_card',
      isPro: proAccessEnabled,
      triggeredFrom: 'preview',
    });
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
    Alert.alert(copied ? 'Copied' : 'Unable to copy', copied ? `${label} copied to the clipboard.` : 'Clipboard is not available on this device.');
  };

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>{draftName}</Text>
        <Text style={styles.body}>{usingCustomHeaderImage ? 'Share your custom BST post header, export item cards, and copy your sale text from one place.' : 'Generate the BST collage pages, export item cards, and copy your sale text from one place.'}</Text>
        <View style={styles.actions}>
          <PrimaryButton
            label={
              generating
                ? 'Generating Images…'
                : capturedCollageUris.length || Object.keys(capturedItemUrisByDraftItemId).length
                  ? 'Regenerate Assets'
                  : usingCustomHeaderImage
                    ? 'Generate Item Cards'
                    : 'Generate Images'
            }
            onPress={() => void captureAssets()}
            disabled={generating}
          />
          <PrimaryButton label="Copy Main Post" variant="secondary" onPress={() => copyText('Main post', mainPostText)} disabled={generating} />
          <PrimaryButton
            label="Copy All Comments"
            variant="secondary"
            onPress={() => copyText('Item comments', allCommentsText, !unlimitedCards && lockedEntries.length > 0)}
            disabled={generating}
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
          <Text style={styles.body}>You can create 1 active draft, generate full collage pages, and generate item cards for up to {FREE_BST_ITEM_CARD_LIMIT} items in this draft.</Text>
          <Text style={styles.body}>
            {remainingFreeCardSlots === FREE_BST_ITEM_CARD_LIMIT
              ? `You still have all ${FREE_BST_ITEM_CARD_LIMIT} free item-card slots available in this draft.`
              : remainingFreeCardSlots === 1
                ? '1 free item card remaining in this draft. Upgrade for cards on every item.'
                : remainingFreeCardSlots === 0
                  ? 'Your free item-card slots are already used in this draft. Upgrade for cards on every item.'
                  : `${remainingFreeCardSlots} free item cards remaining in this draft.`}
          </Text>
          <Text style={styles.body}>
            {selectedFreeCardDraftItemIds.length === 0
              ? `Choose which ${FREE_BST_ITEM_CARD_LIMIT} items get free card exports below.`
              : `${selectedFreeCardDraftItemIds.length} of ${FREE_BST_ITEM_CARD_LIMIT} free card slots are currently assigned in this draft.`}
          </Text>
          {settings.developerModeEnabled ? (
            <Text style={styles.body}>
              Dev: selected card ids {selectedFreeCardDraftItemIds.length}/{FREE_BST_ITEM_CARD_LIMIT} • unlocked previews {unlockedDraftItemIds.length}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>{usingCustomHeaderImage ? 'Post header preview' : 'Collage preview'}</Text>
        <Text style={styles.body}>
          {usingCustomHeaderImage
            ? 'This custom image will be used as the main BST post header instead of the generated collage.'
            : 'Collage generation is available for every BST draft, including the free plan.'}
        </Text>
        <View style={styles.previewStack}>
          {usingCustomHeaderImage && customHeaderImageUri ? (
            <View style={{ gap: 10 }}>
              <Image source={{ uri: customHeaderImageUri }} style={{ width: '100%', aspectRatio: 1.2, borderRadius: 24, backgroundColor: theme.colors.surfaceMuted }} resizeMode="cover" />
              <PrimaryButton label="Share Header Image" variant="secondary" disabled={generating} onPress={() => void shareUri(customHeaderImageUri, 'Share header image')} />
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
                <PrimaryButton
                  label={capturedCollageUris[index] ? `Share Collage ${index + 1}` : `Generate Images First`}
                  variant="secondary"
                  disabled={generating || !capturedCollageUris[index]}
                  onPress={() => void shareUri(capturedCollageUris[index], `Share collage ${index + 1}`)}
                />
              </View>
            ))
          )}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Main post text</Text>
        <View style={styles.textBlock}>
          <Text style={styles.textContent}>{mainPostText}</Text>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Item cards + comments</Text>
        {resolvedItems.map((entry) => {
          const unlocked = unlockedDraftItemIds.includes(entry.draftItem.id);
          const generatedUri = capturedItemUrisByDraftItemId[entry.draftItem.id];
          const canPickFreeCard = !unlimitedCards && !unlocked && remainingFreeCardSlots > 0;
          return (
            <View key={entry.draftItem.id} style={{ gap: 10 }}>
              <View style={styles.previewStack}>
                <Pressable
                  onPress={() => navigation.navigate('BstSaleDraftEditor', { draftId: draft.id, editDraftItemId: entry.draftItem.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit item ${entry.draftItem.itemNumber}`}
                >
                  <BstItemCardRenderer draftTitle={draftName} entry={entry} width={previewWidth} brandingMode={brandingMode} />
                </Pressable>
              </View>
              <View style={styles.actions}>
                {unlimitedCards || unlocked ? (
                  <>
                    <PrimaryButton
                      label={generatedUri ? `Share Card #${entry.draftItem.itemNumber}` : usingCustomHeaderImage ? 'Generate Item Cards First' : 'Generate Images First'}
                      variant="secondary"
                      disabled={generating || !generatedUri}
                      onPress={() => void shareUri(generatedUri, `Share item card ${entry.draftItem.itemNumber}`)}
                    />
                    <PrimaryButton
                      label={`Copy Comment #${entry.draftItem.itemNumber}`}
                      variant="secondary"
                      disabled={generating}
                      onPress={() => copyText(`Comment #${entry.draftItem.itemNumber}`, buildSaleDraftItemCommentText(entry))}
                    />
                  </>
                ) : canPickFreeCard ? (
                  <PrimaryButton
                    label={`Use Free Card Slot for #${entry.draftItem.itemNumber}`}
                    variant="secondary"
                    onPress={() => void handlePickFreeCard(entry.draftItem.id)}
                  />
                ) : (
                  <PrimaryButton
                    label={`Unlock Card #${entry.draftItem.itemNumber}`}
                    variant="secondary"
                    onPress={() => goToPaywall('bst_card_limit')}
                  />
                )}
              </View>
              <View style={[styles.textBlock, !unlimitedCards && !unlocked ? styles.lockedCard : undefined]}>
                <Text style={styles.textContent}>{buildSaleDraftItemCommentText(entry)}</Text>
                {!unlimitedCards && !unlocked ? (
                  <Text style={styles.body}>
                    {remainingFreeCardSlots > 0 ? 'You can spend one of your remaining free card slots on this item, or unlock Pro for cards on every item.' : 'Unlock Pro to generate cards for every item in this draft.'}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>
      <BstImageGenerationHost ref={generatorRef} />
    </Screen>
  );
};
