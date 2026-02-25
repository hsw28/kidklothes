import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Child, ChildItem, ID, Item, SizeCode, StorageLocation } from '@/models';
import { useData } from '@/db/DataContext';
import { useUndoToast } from '@/hooks/useUndoToast';
import { useAppTheme } from '@/theme';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SIZE_OPTIONS, formatSizeDisplay, inferNextSize, sizeCodeToStoredText } from '@/utils/sizes';

type PromoteState = {
  childId: ID;
  nextCode: SizeCode | null;
  nextOtherText: string;
};

type OpenPromoteInput = {
  child: Child;
};

const normalize = (value?: string | null) => (value ?? '').trim().toLowerCase();

const findCurrentClosetLocationId = (childId: ID, storageLocations: StorageLocation[]) => {
  const scoped = storageLocations.filter((location) => !location.deletedAt && (!location.childId || location.childId === childId));
  return scoped.find((location) => normalize(location.name) === 'current closet' || normalize(location.type) === 'closet')?.id;
};

const findSizeUpBinLocationId = (childId: ID, storageLocations: StorageLocation[]) => {
  const scoped = storageLocations.filter((location) => !location.deletedAt && (!location.childId || location.childId === childId));
  return scoped.find((location) => normalize(location.name) === 'size-up bin' || normalize(location.type).replace(/[\s-]+/g, '_') === 'size_up')?.id;
};

const getLinksForChildSizeInLocation = (
  childId: ID,
  sizeText: string,
  fromLocationId: ID,
  childItems: ChildItem[],
  items: Item[],
) => {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return childItems.filter((link) => {
    if (link.deletedAt) return false;
    if (link.childId !== childId) return false;
    if (link.storageLocationId !== fromLocationId) return false;
    const item = itemById.get(link.itemId);
    if (!item || item.deletedAt) return false;
    if (item.status !== 'owned' && link.statusForChild !== 'owned') return false;
    return normalize(item.size) === normalize(sizeText);
  });
};

export const canPromoteChildSize = (child?: Child): boolean =>
  Boolean(
    child?.currentSize?.code &&
      child?.nextSize?.code &&
      sizeCodeToStoredText(child.currentSize.code, child.currentSize.otherText ?? null) &&
      sizeCodeToStoredText(child.nextSize.code, child.nextSize.otherText ?? null) &&
      normalize(sizeCodeToStoredText(child.currentSize.code, child.currentSize.otherText ?? null)) !==
        normalize(sizeCodeToStoredText(child.nextSize.code, child.nextSize.otherText ?? null)),
  );

export const usePromoteChildSize = () => {
  const { children, items, childItems, storageLocations, updateChild, assignChildItemToLocation, logEvent } = useData();
  const { showToast } = useUndoToast();
  const theme = useAppTheme();
  const [state, setState] = useState<PromoteState | null>(null);

  const child = useMemo(
    () => (state ? children.find((entry) => entry.id === state.childId) : undefined),
    [children, state],
  );

  const openPromote = ({ child }: OpenPromoteInput) => {
    if (!canPromoteChildSize(child)) return;
    const suggested = child.nextSize.code ? inferNextSize(child.nextSize.code) : null;
    setState({
      childId: child.id,
      nextCode: suggested,
      nextOtherText: '',
    });
    void logEvent('child_promote_opened', {
      childId: child.id,
      fromNow: child.currentSize.code ?? null,
      fromNext: child.nextSize.code ?? null,
    });
  };

  const close = () => setState(null);

  const confirmPromote = async () => {
    if (!child || !state) return;
    if (!child.currentSize.code || !child.nextSize.code) return;
    if (state.nextCode === 'OTHER' && !state.nextOtherText.trim()) {
      Alert.alert('Next Size Required', 'Enter the next size after promoting.');
      return;
    }

    const oldCurrent = { ...child.currentSize };
    const oldNext = { ...child.nextSize };
    const promotedNowCode = child.nextSize.code;
    const promotedNowOther = child.nextSize.otherText ?? null;
    const nextCode = state.nextCode ?? undefined;
    const nextOther = state.nextCode === 'OTHER' ? state.nextOtherText.trim() : '';

    await updateChild(child.id, {
      currentSizeCode: promotedNowCode,
      currentSizeOther: promotedNowCode === 'OTHER' ? promotedNowOther ?? '' : '',
      nextSizeCode: nextCode,
      nextSizeOther: state.nextCode === 'OTHER' ? nextOther : '',
    });

    void logEvent('child_promote_confirmed', {
      childId: child.id,
      toNow: promotedNowCode,
      toNext: nextCode ?? null,
    });

    const newNowLabel = formatSizeDisplay(promotedNowCode, promotedNowOther);
    const newNextLabel = nextCode ? formatSizeDisplay(nextCode, state.nextCode === 'OTHER' ? nextOther : null) : 'Not set';
    showToast({
      label: `Updated: Now ${newNowLabel}, Next ${newNextLabel}`,
      doUndo: async () => {
        await updateChild(child.id, {
          currentSizeCode: oldCurrent.code ?? undefined,
          currentSizeOther: oldCurrent.code === 'OTHER' ? oldCurrent.otherText ?? '' : '',
          nextSizeCode: oldNext.code ?? undefined,
          nextSizeOther: oldNext.code === 'OTHER' ? oldNext.otherText ?? '' : '',
        });
        await logEvent('child_promote_undone', { childId: child.id });
      },
    });

    close();

    const newNowText = sizeCodeToStoredText(promotedNowCode, promotedNowOther);
    if (!newNowText) return;
    const sizeUpBinId = findSizeUpBinLocationId(child.id, storageLocations);
    const currentClosetId = findCurrentClosetLocationId(child.id, storageLocations);
    if (!sizeUpBinId || !currentClosetId) return;

    const linksToMove = getLinksForChildSizeInLocation(child.id, newNowText, sizeUpBinId, childItems, items);
    if (linksToMove.length === 0) return;

    await logEvent('child_promote_batch_move_shown', { childId: child.id, count: linksToMove.length });
    Alert.alert(
      'Move size-ups into Current Closet?',
      `You have ${linksToMove.length} items in ${newNowText} currently in “Size-Up Bin”.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: `Move ${linksToMove.length} items`,
          onPress: () => {
            void (async () => {
              const previous = linksToMove.map((link) => ({ childItemId: link.id, storageLocationId: link.storageLocationId }));
              for (const link of linksToMove) {
                await assignChildItemToLocation(link.id, currentClosetId);
              }
              await logEvent('child_promote_batch_move_confirmed', { childId: child.id, count: linksToMove.length });
              showToast({
                label: `Moved ${linksToMove.length} items`,
                doUndo: async () => {
                  for (const entry of previous) {
                    await assignChildItemToLocation(entry.childItemId, entry.storageLocationId);
                  }
                  await logEvent('child_promote_batch_move_undone', { childId: child.id, count: previous.length });
                },
              });
            })();
          },
        },
      ],
    );
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.32)',
          justifyContent: 'center',
          padding: 20,
        },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: 20,
          padding: 16,
          gap: 12,
          maxHeight: '72%',
        },
        title: {
          fontSize: 18,
          fontWeight: '700',
          color: theme.colors.textPrimary,
          fontFamily: theme.fonts.serif,
        },
        body: {
          fontSize: 14,
          color: theme.colors.textSecondary,
          lineHeight: 20,
        },
        row: {
          borderRadius: 14,
          backgroundColor: theme.colors.chipBg,
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 4,
        },
        rowLabel: {
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.textSecondary,
        },
        rowValue: {
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.textPrimary,
        },
        optionButton: {
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: theme.colors.chipBg,
        },
        optionButtonActive: {
          backgroundColor: theme.colors.accentPrimarySoft,
        },
        optionText: {
          fontSize: 14,
          color: theme.colors.textPrimary,
          fontWeight: '500',
        },
        optionTextActive: {
          fontWeight: '700',
          color: theme.colors.textPrimary,
        },
        optionsGap: {
          gap: 8,
        },
      }),
    [theme],
  );

  const modal = child && state ? (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Promote size?</Text>
          <Text style={styles.body}>Set Wearing Now to {formatSizeDisplay(child.nextSize.code ?? null, child.nextSize.otherText ?? null)}.</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Current</Text>
            <Text style={styles.rowValue}>
              {formatSizeDisplay(child.currentSize.code ?? null, child.currentSize.otherText ?? null)} → {formatSizeDisplay(child.nextSize.code ?? null, child.nextSize.otherText ?? null)}
            </Text>
          </View>
          <Text style={styles.rowLabel}>Update Next size</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.optionsGap}>
              {SIZE_OPTIONS.map((option) => {
                const active = state.nextCode === option.code;
                return (
                  <Pressable
                    key={option.code}
                    style={[styles.optionButton, active ? styles.optionButtonActive : null]}
                    onPress={() => setState((prev) => (prev ? { ...prev, nextCode: option.code, nextOtherText: option.code === 'OTHER' ? prev.nextOtherText : '' } : prev))}
                  >
                    <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{option.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={[styles.optionButton, !state.nextCode ? styles.optionButtonActive : null]}
                onPress={() => setState((prev) => (prev ? { ...prev, nextCode: null, nextOtherText: '' } : prev))}
              >
                <Text style={[styles.optionText, !state.nextCode ? styles.optionTextActive : null]}>None (optional)</Text>
              </Pressable>
            </View>
          </ScrollView>
          {state.nextCode === 'OTHER' ? (
            <FormInput
              label="Enter next size"
              value={state.nextOtherText}
              onChangeText={(value) => setState((prev) => (prev ? { ...prev, nextOtherText: value } : prev))}
              placeholder="e.g. 4T"
            />
          ) : null}
          <Text style={styles.body}>Kids often wear mixed sizes. This just updates the default “Now” size used in the app.</Text>
          <PrimaryButton label="Promote" onPress={() => void confirmPromote()} />
          <PrimaryButton label="Cancel" variant="secondary" onPress={close} />
        </Pressable>
      </Pressable>
    </Modal>
  ) : null;

  return { openPromote, promoteModal: modal };
};

