import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { BST_COLLAGE_ORDER_MODES, BST_CONDITIONS, BST_DRYING_METHODS, BST_FLAW_TAGS, BST_PET_TYPES, BST_SMOKE_NOTES, SaleDraftItem } from '@/models';
import { ClosetStackParamList } from '@/navigation/types';
import { buildSaleDraftName, formatMoney, getDraftIncludedItems } from '@/services/bst/draft';
import { trackBstDraftDeleted } from '@/services/bst/bstAnalytics';
import { canCreateMultipleDrafts, canUseCustomBstHeaderImage, canUseMultipleItemPhotos } from '@/services/proAccess';
import { useAppTheme } from '@/theme';
import { persistLocalImage } from '@/utils/imageCache';
import { getItemDisplayImageUri } from '@/utils/itemMedia';
import { pickPhotoFromLibrary, takePhotoWithCamera } from '@/utils/photoPicker';

type Props = NativeStackScreenProps<ClosetStackParamList, 'BstSaleDraftEditor'>;
type BoolChoice = 'inherit' | 'unset' | 'yes' | 'no';
type PetTypeOption = (typeof BST_PET_TYPES)[number];

const BooleanSelector: React.FC<{
  label: string;
  value: BoolChoice;
  mode?: 'override' | 'default';
  onChange: (value: BoolChoice) => void;
}> = ({ label, value, mode = 'default', onChange }) => {
  const options: BoolChoice[] = mode === 'override' ? ['inherit', 'yes', 'no'] : ['unset', 'yes', 'no'];
  return <ChipSelector label={label} options={options} value={value} onChange={onChange} accent="sage" />;
};

const normalizePhotoChoiceKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() ?? parsed.pathname;
      return decodeURIComponent(lastSegment).toLowerCase();
    }
  } catch {
    // Fall through to generic normalization.
  }
  const withoutQuery = trimmed.split('?')[0];
  const normalizedPath = withoutQuery.replace(/^file:\/\//i, '').replace(/^content:\/\//i, '').replace(/^ph:\/\//i, '');
  const lastSegment = normalizedPath.split('/').filter(Boolean).pop() ?? normalizedPath;
  return decodeURIComponent(lastSegment).toLowerCase();
};

export const BstSaleDraftEditorScreen: React.FC<Props> = ({ navigation, route }) => {
  const {
    saleDrafts,
    saleDraftItems,
    items,
    settings,
    purchaseState,
    updateSaleDraft,
    updateSaleDraftItem,
    updateItem,
    deleteSaleDraft,
    removeSaleDraftItem,
    reorderSaleDraftItems,
    logEvent,
  } = useData();
  const theme = useAppTheme();
  const editorScrollRef = useRef<ScrollView | null>(null);
  const editorScrollOffsetRef = useRef(0);
  const [editingItemId, setEditingItemId] = useState<string | null>(route.params.editDraftItemId ?? null);
  const [draftTitleInput, setDraftTitleInput] = useState('');
  const [petNoteInput, setPetNoteInput] = useState('');
  const [washNoteInput, setWashNoteInput] = useState('');
  const [shippingNoteInput, setShippingNoteInput] = useState('');
  const [paymentNoteInput, setPaymentNoteInput] = useState('');
  const [itemPriceInput, setItemPriceInput] = useState('');
  const [itemConditionValue, setItemConditionValue] = useState<'unset' | (typeof BST_CONDITIONS)[number]>('unset');
  const [itemConditionNotesInput, setItemConditionNotesInput] = useState('');
  const [itemFlawTagsValue, setItemFlawTagsValue] = useState<SaleDraftItem['flawTags']>([]);
  const [itemFlawNotesInput, setItemFlawNotesInput] = useState('');
  const [itemWashNotesInput, setItemWashNotesInput] = useState('');
  const [itemDryingValue, setItemDryingValue] = useState<'inherit' | (typeof BST_DRYING_METHODS)[number]>('inherit');
  const [itemSmokeValue, setItemSmokeValue] = useState<'inherit' | (typeof BST_SMOKE_NOTES)[number]>('inherit');
  const [itemPetTypesValue, setItemPetTypesValue] = useState<(typeof BST_PET_TYPES)[number][]>([]);
  const [itemPetUsesInheritance, setItemPetUsesInheritance] = useState(true);
  const [itemPetNoteInput, setItemPetNoteInput] = useState('');
  const [itemOffersValue, setItemOffersValue] = useState<BoolChoice>('inherit');
  const [itemBundleOffersValue, setItemBundleOffersValue] = useState<BoolChoice>('inherit');
  const [itemSelectedPhotoUri, setItemSelectedPhotoUri] = useState<string | undefined>(undefined);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const draft = saleDrafts.find((entry) => entry.id === route.params.draftId);
  const draftItems = useMemo(
    () => getDraftIncludedItems(saleDraftItems.filter((entry) => entry.saleDraftId === route.params.draftId)),
    [route.params.draftId, saleDraftItems],
  );
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const editingDraftItem = draftItems.find((entry) => entry.id === editingItemId);
  const editingInventoryItem = editingDraftItem ? itemMap.get(editingDraftItem.itemId) : undefined;
  const hasMultiPhotoAccess = canUseMultipleItemPhotos(settings, purchaseState);
  const canUseCustomHeaderImage = canUseCustomBstHeaderImage(settings, purchaseState);
  const canDeleteDraft = canCreateMultipleDrafts(settings, purchaseState);
  const shouldConfirmSelectionReset = !canDeleteDraft && Boolean(draft?.freeGenerationConsumedAt);
  const editingPhotoChoices = useMemo(
    () => {
      if (!editingInventoryItem) return [];
      const uploadedPhotos = (editingInventoryItem.imageUrls ?? [])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));
      if (uploadedPhotos.length) {
        const seen = new Set<string>();
        return uploadedPhotos.filter((uri) => {
          const key = normalizePhotoChoiceKey(uri);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      const fallbackPhoto = getItemDisplayImageUri(editingInventoryItem);
      return fallbackPhoto ? [fallbackPhoto] : [];
    },
    [editingInventoryItem],
  );

  useEffect(() => {
    if (route.params.editDraftItemId) {
      setEditingItemId(route.params.editDraftItemId);
    }
  }, [route.params.editDraftItemId]);

  useEffect(() => {
    if (!isDeletingDraft) return;
    if (draft) return;
    navigation.replace('BstSaleDraftList');
  }, [draft, isDeletingDraft, navigation]);

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
    subhead: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    itemActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'space-between',
    },
    itemActionButton: {
      flexGrow: 1,
      minWidth: 132,
    },
    itemTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    meta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    thumb: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(17,24,39,0.42)',
      justifyContent: 'center',
      padding: 18,
    },
    modalCard: {
      maxHeight: '88%',
      backgroundColor: theme.colors.background,
      borderRadius: 24,
      overflow: 'hidden',
    },
    modalScroll: {
      padding: 18,
      gap: 16,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    pill: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    pillActive: {
      backgroundColor: theme.colors.accentPeriwinkleSoft,
    },
    pillText: {
      color: theme.colors.textPrimary,
      fontWeight: '600',
      fontSize: 13,
    },
    inlineLink: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.accentPeriwinkle,
    },
  });

  useEffect(() => {
    if (!draft) return;
    setDraftTitleInput(draft.title ?? '');
    setPetNoteInput(draft.defaultPetNote ?? '');
    setWashNoteInput(draft.defaultWashNote ?? '');
    setShippingNoteInput(draft.defaultShippingNote ?? '');
    setPaymentNoteInput(draft.defaultPaymentNote ?? '');
  }, [draft?.id]);

  useEffect(() => {
    if (!editingDraftItem) return;
    setItemPriceInput(editingDraftItem.price?.toString() ?? '');
    setItemConditionValue((editingDraftItem.condition ?? 'unset') as 'unset' | (typeof BST_CONDITIONS)[number]);
    setItemConditionNotesInput(editingDraftItem.conditionNotes ?? '');
    setItemFlawTagsValue(editingDraftItem.flawTags);
    setItemFlawNotesInput(editingDraftItem.flawNotes ?? '');
    setItemWashNotesInput(editingDraftItem.washNotesOverride ?? '');
    setItemDryingValue((editingDraftItem.dryingMethodOverride ?? 'inherit') as 'inherit' | (typeof BST_DRYING_METHODS)[number]);
    setItemSmokeValue((editingDraftItem.smokeNoteOverride ?? 'inherit') as 'inherit' | (typeof BST_SMOKE_NOTES)[number]);
    setItemPetTypesValue(editingDraftItem.petTypesOverride ?? []);
    setItemPetUsesInheritance(editingDraftItem.petTypesOverride === undefined);
    setItemPetNoteInput(editingDraftItem.petNoteOverride ?? '');
    setItemOffersValue(editingDraftItem.offersAcceptedOverride === undefined ? 'inherit' : editingDraftItem.offersAcceptedOverride ? 'yes' : 'no');
    setItemBundleOffersValue(editingDraftItem.bundleOffersAcceptedOverride === undefined ? 'inherit' : editingDraftItem.bundleOffersAcceptedOverride ? 'yes' : 'no');
    setItemSelectedPhotoUri(editingDraftItem.selectedPhotoUri);
  }, [editingDraftItem?.id]);

  if (!draft) {
    return (
      <Screen>
        <EmptyState title="Draft not found" subtitle="This BST draft may have been deleted or moved." />
      </Screen>
    );
  }

  const restoreEditorScroll = useCallback(() => {
    requestAnimationFrame(() => {
      editorScrollRef.current?.scrollTo({ y: editorScrollOffsetRef.current, animated: false });
    });
  }, []);

  const updateDraftPreservingScroll = useCallback(async (patch: Parameters<typeof updateSaleDraft>[1]) => {
    await updateSaleDraft(draft.id, patch);
    restoreEditorScroll();
  }, [draft.id, restoreEditorScroll, updateSaleDraft]);

  const applyOrderedDraftIds = useCallback(async (orderedDraftItemIds: string[], mode: typeof BST_COLLAGE_ORDER_MODES[number]) => {
    await reorderSaleDraftItems(draft.id, orderedDraftItemIds);
    await updateDraftPreservingScroll({ collageOrderMode: mode });
  }, [draft.id, reorderSaleDraftItems, updateDraftPreservingScroll]);

  const saveDraftTextField = useCallback(
    async <K extends 'title' | 'defaultPetNote' | 'defaultWashNote' | 'defaultShippingNote' | 'defaultPaymentNote'>(
      key: K,
      nextValue: string,
      currentValue?: string | null,
    ) => {
      if ((currentValue ?? '') === nextValue) return;
      await updateDraftPreservingScroll({ [key]: nextValue } as Parameters<typeof updateSaleDraft>[1]);
    },
    [updateDraftPreservingScroll],
  );

  const togglePetTypeSelection = useCallback((current: PetTypeOption[], nextValue: PetTypeOption): PetTypeOption[] => {
    if (nextValue === 'none') {
      return current.includes('none') ? [] : ['none'];
    }
    const withoutNone = current.filter((entry) => entry !== 'none');
    return withoutNone.includes(nextValue)
      ? withoutNone.filter((entry) => entry !== nextValue)
      : [...withoutNone, nextValue];
  }, []);

  const beginIndividualFieldEditing = useCallback(async (field: 'drying' | 'offers' | 'bundle') => {
    if (field === 'drying') await updateDraftPreservingScroll({ defaultDryingMethod: undefined });
    if (field === 'offers') await updateDraftPreservingScroll({ defaultOffersAccepted: undefined });
    if (field === 'bundle') await updateDraftPreservingScroll({ defaultBundleOffersAccepted: undefined });
    if (draftItems[0]) setEditingItemId(draftItems[0].id);
    Alert.alert('Set individually', 'The shared default for this field was cleared. Add item-specific values in each item editor.');
  }, [draftItems, updateDraftPreservingScroll]);

  const pickCustomHeaderImage = useCallback(() => {
    if (!canUseCustomHeaderImage) {
      navigation.navigate('ProPaywall', { source: 'bst_locked_export' });
      return;
    }
    Alert.alert('Main post photo', 'Choose how you want to add your main post photo.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Photo Library',
        onPress: () => {
          void (async () => {
            const asset = await pickPhotoFromLibrary();
            if (!asset?.uri) return;
            const persistedUri = await persistLocalImage(asset.uri);
            if (!persistedUri) {
              Alert.alert('Unable to save image', 'Try choosing the image again.');
              return;
            }
            await updateDraftPreservingScroll({ customHeaderImageUri: persistedUri });
          })();
        },
      },
      {
        text: 'Camera',
        onPress: () => {
          void (async () => {
            const asset = await takePhotoWithCamera();
            if (!asset?.uri) return;
            const persistedUri = await persistLocalImage(asset.uri);
            if (!persistedUri) {
              Alert.alert('Unable to save image', 'Try taking the photo again.');
              return;
            }
            await updateDraftPreservingScroll({ customHeaderImageUri: persistedUri });
          })();
        },
      },
    ]);
  }, [canUseCustomHeaderImage, navigation, updateDraftPreservingScroll]);

  const saveEditingItem = async () => {
    if (!editingDraftItem || !editingInventoryItem) return;
    const parsedPrice = itemPriceInput.trim().length ? Number(itemPriceInput) : undefined;
    await updateSaleDraftItem(editingDraftItem.id, {
      selectedPhotoUri: itemSelectedPhotoUri,
      price: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
      condition: itemConditionValue === 'unset' ? undefined : itemConditionValue,
      conditionNotes: itemConditionNotesInput,
      flawTags: itemFlawTagsValue,
      flawNotes: itemFlawNotesInput,
      washNotesOverride: itemWashNotesInput,
      dryingMethodOverride: itemDryingValue === 'inherit' ? undefined : itemDryingValue,
      smokeNoteOverride: itemSmokeValue === 'inherit' ? undefined : itemSmokeValue,
      petTypesOverride: itemPetUsesInheritance ? undefined : itemPetTypesValue,
      petNoteOverride: !itemPetUsesInheritance && itemPetTypesValue.includes('other') ? itemPetNoteInput : undefined,
      offersAcceptedOverride: itemOffersValue === 'inherit' ? undefined : itemOffersValue === 'yes',
      bundleOffersAcceptedOverride: itemBundleOffersValue === 'inherit' ? undefined : itemBundleOffersValue === 'yes',
    });
    await updateItem(editingInventoryItem.id, {
      targetResalePrice: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
      bstSelectedPhotoUri: itemSelectedPhotoUri,
      bstCondition: itemConditionValue === 'unset' ? undefined : itemConditionValue,
      bstConditionNotes: itemConditionNotesInput,
      bstFlawTags: itemFlawTagsValue,
      bstFlawNotes: itemFlawNotesInput,
      bstWashNotes: itemWashNotesInput,
      bstDryingMethod: itemDryingValue === 'inherit' ? undefined : itemDryingValue,
      bstSmokeNote: itemSmokeValue === 'inherit' ? undefined : itemSmokeValue,
      bstPetTypes: itemPetUsesInheritance ? undefined : itemPetTypesValue,
      bstPetNote: !itemPetUsesInheritance && itemPetTypesValue.includes('other') ? itemPetNoteInput : undefined,
      bstOffersAccepted: itemOffersValue === 'inherit' ? undefined : itemOffersValue === 'yes',
      bstBundleOffersAccepted: itemBundleOffersValue === 'inherit' ? undefined : itemBundleOffersValue === 'yes',
    });
    setEditingItemId(null);
  };

  const applyAutoSort = useCallback(async (mode: 'highest-price' | 'newest-first') => {
    const ordered = [...draftItems].sort((left, right) => {
      const leftItem = itemMap.get(left.itemId);
      const rightItem = itemMap.get(right.itemId);
      if (mode === 'highest-price') {
        const leftPrice = left.price ?? leftItem?.targetResalePrice;
        const rightPrice = right.price ?? rightItem?.targetResalePrice;
        const leftHasPrice = Number.isFinite(leftPrice);
        const rightHasPrice = Number.isFinite(rightPrice);
        if (leftHasPrice && rightHasPrice && leftPrice !== rightPrice) {
          return (rightPrice ?? 0) - (leftPrice ?? 0);
        }
        if (leftHasPrice !== rightHasPrice) {
          return leftHasPrice ? -1 : 1;
        }
      }
      if (mode === 'newest-first') {
        const leftCreatedAt = leftItem?.createdAt ?? left.createdAt;
        const rightCreatedAt = rightItem?.createdAt ?? right.createdAt;
        if (leftCreatedAt !== rightCreatedAt) {
          return rightCreatedAt - leftCreatedAt;
        }
      }
      return left.listingOrder - right.listingOrder || left.createdAt - right.createdAt;
    });
    await applyOrderedDraftIds(ordered.map((entry) => entry.id), mode);
  }, [applyOrderedDraftIds, draftItems, itemMap]);

  const confirmDeleteDraft = useCallback(() => {
    const deletingDraftId = draft.id;
    const deletingItemCount = draftItems.length;
    Alert.alert(
      'Delete BST draft',
      'Delete this sell post draft and all of its item-specific BST details for this draft?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Draft',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setEditingItemId(null);
                setIsDeletingDraft(true);
                await deleteSaleDraft(deletingDraftId);
                navigation.replace('BstSaleDraftList');
                void trackBstDraftDeleted(logEvent, {
                  draftId: deletingDraftId,
                  itemCount: deletingItemCount,
                  triggeredFrom: 'draft_editor',
                });
              } catch (error) {
                setIsDeletingDraft(false);
                const message = error instanceof Error && error.message ? error.message : 'Try deleting the draft again.';
                Alert.alert('Unable to delete draft', message);
              }
            })();
          },
        },
      ],
    );
  }, [deleteSaleDraft, draft.id, draftItems.length, logEvent, navigation]);

  return (
    <Screen
      disableDataStateGate
      scrollRef={editorScrollRef}
      scrollViewProps={{
        keyboardShouldPersistTaps: 'handled',
        onScroll: (event) => {
          editorScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        },
        scrollEventThrottle: 16,
      }}
    >
      <Card>
        <Text style={styles.title}>{buildSaleDraftName(draft)}</Text>
        <Text style={styles.body}>{draftItems.length} item{draftItems.length === 1 ? '' : 's'} included</Text>
        {!canDeleteDraft ? (
          <Text style={styles.body}>Free includes 1 active BST draft at a time. Keep updating this draft as your sale post until you upgrade to Pro for multiple drafts and draft deletion.</Text>
        ) : null}
        <FormInput
          label="Draft title"
          value={draftTitleInput}
          onChangeText={setDraftTitleInput}
          onBlur={() => void saveDraftTextField('title', draftTitleInput, draft.title)}
          placeholder="Spring Purge"
        />
        <Text style={styles.body}>Collage export uses one single-image BST grid and automatically adjusts columns based on how many items are in the draft.</Text>
        <Text style={styles.body}>Main post photo</Text>
        <Text style={styles.body}>Use the collage, or upload your own with Pro.</Text>
        {draft.customHeaderImageUri ? (
          <Image source={{ uri: draft.customHeaderImageUri }} style={{ width: '100%', aspectRatio: 1.2, borderRadius: 20, backgroundColor: theme.colors.surfaceMuted }} resizeMode="cover" />
        ) : null}
        <View style={styles.actions}>
          <PrimaryButton
            label={draft.customHeaderImageUri ? 'Replace Custom Header Image' : 'Upload Custom Header Image (Pro)'}
            variant="secondary"
            onPress={() => void pickCustomHeaderImage()}
          />
          {draft.customHeaderImageUri ? (
            <PrimaryButton
              label="Use Generated Collage Instead"
              variant="secondary"
              onPress={() => void updateDraftPreservingScroll({ customHeaderImageUri: undefined })}
            />
          ) : null}
        </View>
      </Card>

      <Card>
        <Text style={styles.subhead}>Sale-wide defaults</Text>
        <ChipSelector
          label="Smoke note"
          options={['unset', ...BST_SMOKE_NOTES]}
          value={(draft.defaultSmokeNote ?? 'unset') as 'unset' | (typeof BST_SMOKE_NOTES)[number]}
          onChange={(value) => void updateDraftPreservingScroll({ defaultSmokeNote: value === 'unset' ? undefined : value })}
        />
        <ChipSelector
          label="Pet types"
          options={['none', 'dog', 'cat', 'other']}
          selectedValues={draft.defaultPetTypes ?? []}
          onChange={(value) => {
            const nextValues = togglePetTypeSelection(draft.defaultPetTypes ?? [], value);
            if (!nextValues.includes('other')) {
              setPetNoteInput('');
            }
            void updateDraftPreservingScroll({
              defaultPetTypes: nextValues.length ? nextValues : undefined,
              ...(!nextValues.includes('other') ? { defaultPetNote: undefined } : {}),
            });
          }}
          accent="sage"
        />
        {draft.defaultPetTypes?.includes('other') ? (
          <FormInput
            label="Pet note"
            value={petNoteInput}
            onChangeText={setPetNoteInput}
            onBlur={() => void saveDraftTextField('defaultPetNote', petNoteInput, draft.defaultPetNote)}
          />
        ) : null}
        <FormInput
          label="Wash note"
          value={washNoteInput}
          onChangeText={setWashNoteInput}
          onBlur={() => void saveDraftTextField('defaultWashNote', washNoteInput, draft.defaultWashNote)}
          multiline
        />
        <ChipSelector
          label="Drying method"
          options={['unset', ...BST_DRYING_METHODS]}
          value={(draft.defaultDryingMethod ?? 'unset') as 'unset' | (typeof BST_DRYING_METHODS)[number]}
          onChange={(value) => void updateDraftPreservingScroll({ defaultDryingMethod: value === 'unset' ? undefined : value })}
        />
        <Text style={styles.body}>Wash and dry notes will not apply to items marked new or new with tag.</Text>
        <Pressable onPress={() => void beginIndividualFieldEditing('drying')}>
          <Text style={styles.inlineLink}>Set drying individually for items</Text>
        </Pressable>
        <BooleanSelector
          label="Offers accepted"
          value={draft.defaultOffersAccepted === undefined ? 'unset' : draft.defaultOffersAccepted ? 'yes' : 'no'}
          onChange={(value) => void updateDraftPreservingScroll({ defaultOffersAccepted: value === 'unset' ? undefined : value === 'yes' })}
        />
        <Pressable onPress={() => void beginIndividualFieldEditing('offers')}>
          <Text style={styles.inlineLink}>Set offers individually for items</Text>
        </Pressable>
        <BooleanSelector
          label="Bundle offers accepted"
          value={draft.defaultBundleOffersAccepted === undefined ? 'unset' : draft.defaultBundleOffersAccepted ? 'yes' : 'no'}
          onChange={(value) => void updateDraftPreservingScroll({ defaultBundleOffersAccepted: value === 'unset' ? undefined : value === 'yes' })}
        />
        <Pressable onPress={() => void beginIndividualFieldEditing('bundle')}>
          <Text style={styles.inlineLink}>Set bundle offers individually for items</Text>
        </Pressable>
        <FormInput
          label="Shipping summary for main post"
          value={shippingNoteInput}
          onChangeText={setShippingNoteInput}
          onBlur={() => void saveDraftTextField('defaultShippingNote', shippingNoteInput, draft.defaultShippingNote)}
          placeholder="Buyer pays exact shipping • Pirate Ship available"
          multiline
        />
        <FormInput
          label="Payment note"
          value={paymentNoteInput}
          onChangeText={setPaymentNoteInput}
          onBlur={() => void saveDraftTextField('defaultPaymentNote', paymentNoteInput, draft.defaultPaymentNote)}
          multiline
        />
      </Card>

      <Card>
        <Text style={styles.subhead}>Included items</Text>
        <Text style={styles.body}>
          Tap Edit to add item-specific BST details like condition, flaws, wash notes, photo choice, and offers settings. Reusable BST details you save here will prefill future drafts for this item.
        </Text>
        <Text style={styles.subhead}>Order for collage</Text>
        <Text style={styles.body}>Top-left items get the most attention.</Text>
        <ChipSelector
          label="Collage order"
          options={[...BST_COLLAGE_ORDER_MODES]}
          value={draft.collageOrderMode}
          onChange={(value) => {
            if (value === 'custom') {
              void updateDraftPreservingScroll({ collageOrderMode: 'custom' });
              return;
            }
            void applyAutoSort(value);
          }}
          accent="periwinkle"
        />
        {draftItems.map((draftItem, index) => {
          const inventoryItem = itemMap.get(draftItem.itemId);
          if (!inventoryItem) return null;
          const imageUri = draftItem.selectedPhotoUri || getItemDisplayImageUri(inventoryItem);
          return (
            <Card key={draftItem.id} style={{ backgroundColor: theme.colors.surfaceMuted }}>
              <View style={styles.row}>
                {imageUri ? <Image source={{ uri: imageUri }} style={styles.thumb} /> : <View style={styles.thumb} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.itemTitle}>#{draftItem.itemNumber} {inventoryItem.title}</Text>
                  <Text style={styles.meta}>{[inventoryItem.brand, inventoryItem.size, draftItem.condition].filter(Boolean).join(' • ') || 'Listing details not set yet'}</Text>
                  <Text style={styles.meta}>{formatMoney(draftItem.price) ?? 'No price yet'}</Text>
                </View>
              </View>
              <View style={styles.itemActionRow}>
                <PrimaryButton
                  label="Move Up"
                  variant="secondary"
                  style={styles.itemActionButton}
                  onPress={() => {
                    if (index === 0) return;
                    const ordered = [...draftItems];
                    const swap = ordered[index - 1];
                    ordered[index - 1] = ordered[index];
                    ordered[index] = swap;
                    void applyOrderedDraftIds(ordered.map((entry) => entry.id), 'custom');
                  }}
                />
                <PrimaryButton label="Edit" variant="secondary" style={styles.itemActionButton} onPress={() => setEditingItemId(draftItem.id)} />
                <PrimaryButton
                  label="Remove"
                  variant="danger"
                  style={styles.itemActionButton}
                  onPress={() => {
                    if (shouldConfirmSelectionReset) {
                      Alert.alert(
                        'Changing items will reset your generated cards',
                        'Changing items will reset your generated cards.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () => {
                              void (async () => {
                                await updateDraftPreservingScroll({ freeGeneratedCardItemIds: [] });
                                await removeSaleDraftItem(draftItem.id);
                              })();
                            },
                          },
                        ],
                      );
                      return;
                    }
                    Alert.alert('Remove item', 'Remove this item from the draft?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => void removeSaleDraftItem(draftItem.id) },
                    ]);
                  }}
                />
                <PrimaryButton
                  label="Move Down"
                  variant="secondary"
                  style={styles.itemActionButton}
                  onPress={() => {
                    if (index === draftItems.length - 1) return;
                    const ordered = [...draftItems];
                    const swap = ordered[index + 1];
                    ordered[index + 1] = ordered[index];
                    ordered[index] = swap;
                    void applyOrderedDraftIds(ordered.map((entry) => entry.id), 'custom');
                  }}
                />
              </View>
            </Card>
          );
        })}
      </Card>

      <Card>
        <Text style={styles.subhead}>Create your post</Text>
        <Text style={styles.body}>Preview your collage, item cards, and post text.</Text>
        <PrimaryButton label="Preview post" onPress={() => navigation.navigate('BstSaleDraftPreview', { draftId: draft.id })} />
      </Card>

      {canDeleteDraft ? (
        <Card>
          <Text style={styles.subhead}>Delete draft</Text>
          <Text style={styles.body}>Remove this BST draft and its draft-specific item settings for this sale post.</Text>
          <PrimaryButton label="Delete Draft" variant="danger" onPress={confirmDeleteDraft} />
        </Card>
      ) : null}

      <Modal visible={Boolean(editingDraftItem && editingInventoryItem)} transparent animationType="slide" onRequestClose={() => setEditingItemId(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEditingItemId(null)} />
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            {editingDraftItem && editingInventoryItem ? (
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <Text style={styles.title}>Edit #{editingDraftItem.itemNumber}</Text>
                <Text style={styles.body}>{editingInventoryItem.title}</Text>
                <FormInput
                  label="Price"
                  value={itemPriceInput}
                  onChangeText={setItemPriceInput}
                  keyboardType="decimal-pad"
                />
                <ChipSelector
                  label="Condition"
                  options={['unset', ...BST_CONDITIONS]}
                  value={itemConditionValue}
                  onChange={setItemConditionValue}
                />
                <FormInput label="Condition notes" value={itemConditionNotesInput} onChangeText={setItemConditionNotesInput} multiline />
                <Text style={styles.meta}>Selected photo</Text>
                <View style={styles.pillRow}>
                  {editingPhotoChoices.map((uri, index) => (
                    <Pressable
                      key={`${editingDraftItem.id}-photo-${index}`}
                      style={[styles.pill, itemSelectedPhotoUri === uri ? styles.pillActive : undefined]}
                      onPress={() => setItemSelectedPhotoUri(uri)}
                    >
                      <Text style={styles.pillText}>{editingPhotoChoices.length === 1 ? 'Item photo' : `Photo ${index + 1}`}</Text>
                    </Pressable>
                  ))}
                  <Pressable style={[styles.pill, !itemSelectedPhotoUri ? styles.pillActive : undefined]} onPress={() => setItemSelectedPhotoUri(undefined)}>
                    <Text style={styles.pillText}>Use default</Text>
                  </Pressable>
                </View>
                {editingPhotoChoices.length <= 1 && !hasMultiPhotoAccess ? (
                  <Text style={styles.body}>This item currently has 1 photo. Pro allows additional photo uploads for back, tag, and flaw shots.</Text>
                ) : null}
                <Text style={styles.meta}>Flaw tags</Text>
                <View style={styles.pillRow}>
                  {BST_FLAW_TAGS.map((tag) => {
                    const active = itemFlawTagsValue.includes(tag);
                    return (
                      <Pressable
                        key={tag}
                        style={[styles.pill, active ? styles.pillActive : undefined]}
                        onPress={() => setItemFlawTagsValue(active ? itemFlawTagsValue.filter((entry) => entry !== tag) : [...itemFlawTagsValue, tag])}
                      >
                        <Text style={styles.pillText}>{tag}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <FormInput label="Flaw notes" value={itemFlawNotesInput} onChangeText={setItemFlawNotesInput} multiline />
                <FormInput label="Wash note override" value={itemWashNotesInput} onChangeText={setItemWashNotesInput} multiline />
                <ChipSelector
                  label="Drying override"
                  options={['inherit', ...BST_DRYING_METHODS]}
                  value={itemDryingValue}
                  onChange={setItemDryingValue}
                  accent="sage"
                />
                <ChipSelector
                  label="Smoke override"
                  options={['inherit', ...BST_SMOKE_NOTES]}
                  value={itemSmokeValue}
                  onChange={setItemSmokeValue}
                />
                <ChipSelector
                  label="Pet override"
                  options={['inherit']}
                  value={itemPetUsesInheritance ? 'inherit' : undefined}
                  onChange={() => {
                    setItemPetUsesInheritance(true);
                    setItemPetTypesValue([]);
                    setItemPetNoteInput('');
                  }}
                  accent="sage"
                />
                <ChipSelector
                  label="Item pet types"
                  options={['none', 'dog', 'cat', 'other']}
                  selectedValues={itemPetUsesInheritance ? [] : itemPetTypesValue}
                  onChange={(value) => {
                    setItemPetUsesInheritance(false);
                    const nextValues = togglePetTypeSelection(itemPetTypesValue, value);
                    setItemPetTypesValue(nextValues);
                    if (!nextValues.includes('other')) {
                      setItemPetNoteInput('');
                    }
                  }}
                  accent="sage"
                />
                {!itemPetUsesInheritance && itemPetTypesValue.includes('other') ? (
                  <FormInput label="Pet note override" value={itemPetNoteInput} onChangeText={setItemPetNoteInput} multiline />
                ) : null}
                <BooleanSelector
                  label="Offers override"
                  mode="override"
                  value={itemOffersValue}
                  onChange={setItemOffersValue}
                />
                <BooleanSelector
                  label="Bundle offers override"
                  mode="override"
                  value={itemBundleOffersValue}
                  onChange={setItemBundleOffersValue}
                />
                <Text style={styles.body}>Saved BST details on this item, including price, will prefill future BST drafts.</Text>
                <PrimaryButton label="Save Item Details" onPress={() => void saveEditingItem()} />
                <PrimaryButton label="Cancel" variant="secondary" onPress={() => setEditingItemId(null)} />
              </ScrollView>
            ) : null}
          </Pressable>
        </View>
      </Modal>
    </Screen>
  );
};
