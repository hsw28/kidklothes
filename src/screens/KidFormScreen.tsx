import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { BetaKidLimitModal } from '@/components/BetaKidLimitModal';
import { ChipSelector } from '@/components/ChipSelector';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { SizeCode } from '@/models';
import { KidsStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme';
import { pickPhotoFromLibrary, takePhotoWithCamera } from '@/utils/photoPicker';
import { openKidLimitFeedbackEmail } from '@/utils/betaKidLimitFeedback';
import { SIZE_OPTIONS, formatSizeDisplay, inferNextSize, sizeCodeToStoredText } from '@/utils/sizes';
import { APPAREL_AGE_SIZES, APPAREL_ALPHA_SIZES, US_SHOE_SIZES } from '@/lib/sizing';

type Props = NativeStackScreenProps<KidsStackParamList, 'KidForm'>;

type SizeFieldKey = 'next';

const isKidLimitReachedError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : '';
  return code === 'KID_LIMIT_REACHED' || message === 'KID_LIMIT_REACHED';
};

const isDuplicateChildNameError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  return code === 'DUPLICATE_CHILD_NAME';
};

const pickerLabels = {
  next: 'Next Size',
} as const;
const APPAREL_SIZE_OPTIONS = [...APPAREL_AGE_SIZES, ...APPAREL_ALPHA_SIZES, 'Other…'];
const SHOE_SIZE_OPTIONS = [...US_SHOE_SIZES, 'Other…'];
const CURRENT_SIZE_MULTI_OPTIONS = SIZE_OPTIONS.filter((entry) => entry.code !== 'OTHER').map((entry) => entry.code);

export const KidFormScreen: React.FC<Props> = ({ route, navigation }) => {
  const { children, storageLocations, addChild, updateChild, deleteChild, createStorageLocation, listStorageLocations, canCreateAnotherKid } = useData();
  const editingId = route.params?.childId;
  const returnToClosetAfterCreate = route.params?.returnToClosetAfterCreate ?? false;
  const existing = useMemo(() => children.find((child) => child.id === editingId), [children, editingId]);
  const theme = useAppTheme();

  const [name, setName] = useState(existing?.name ?? '');
  const [photoUri, setPhotoUri] = useState(existing?.photoUri ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [usesMixedSizes, setUsesMixedSizes] = useState(existing?.usesMixedSizes ?? false);
  const [currentSizeCodes, setCurrentSizeCodes] = useState<string[]>(
    existing?.currentSizeCodes?.length
      ? existing.currentSizeCodes
      : (sizeCodeToStoredText(existing?.currentSize.code ?? null, existing?.currentSize.otherText ?? null)
          ? [sizeCodeToStoredText(existing?.currentSize.code ?? null, existing?.currentSize.otherText ?? null) as string]
          : []),
  );
  const [nextSizeCode, setNextSizeCode] = useState<SizeCode | null>(existing?.nextSize.code ?? null);
  const [nextSizeOther, setNextSizeOther] = useState(existing?.nextSize.otherText ?? '');
  const [showSizePicker, setShowSizePicker] = useState<SizeFieldKey | null>(null);
  const [createStarterCubbies, setCreateStarterCubbies] = useState(!existing);
  const [showKidLimitModal, setShowKidLimitModal] = useState(false);
  const [kidLimitCurrentCount, setKidLimitCurrentCount] = useState(children.length);
  const [apparelSizeCurrent, setApparelSizeCurrent] = useState(existing?.apparelSizeCurrent ?? '');
  const [apparelSizeNext, setApparelSizeNext] = useState(existing?.apparelSizeNext ?? '');
  const [shoeSizeSystem, setShoeSizeSystem] = useState(existing?.shoeSizeSystem ?? 'US_SHOE');
  const [shoeSizeCurrent, setShoeSizeCurrent] = useState(existing?.shoeSizeCurrent ?? '');
  const [shoeSizeNext, setShoeSizeNext] = useState(existing?.shoeSizeNext ?? '');

  const goToKidsList = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'KidsList' as never }],
    });
    const rootNav = navigation.getParent() as any;
    rootNav?.navigate?.('Kids', { screen: 'KidsList' });
  };

  const styles = StyleSheet.create({
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    pickerField: {
      borderRadius: 16,
      backgroundColor: theme.colors.card,
      paddingHorizontal: 14,
      paddingVertical: 14,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
      gap: 6,
    },
    pickerLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    pickerValue: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    helperText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      padding: 16,
      maxHeight: '70%',
      gap: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    optionButton: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: theme.colors.chipBg,
    },
    optionButtonActive: {
      backgroundColor: theme.colors.accentCoralSoft,
    },
    optionText: {
      fontSize: 14,
      color: theme.colors.textPrimary,
      fontWeight: '500',
    },
    optionTextActive: {
      color: theme.colors.accentCoral,
      fontWeight: '700',
    },
    rowGap: {
      gap: 12,
    },
    multiSizeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    photoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    photoPreview: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.inputBg,
    },
    photoPlaceholder: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoPlaceholderText: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    photoButtons: {
      flex: 1,
      gap: 8,
    },
  });

  const pickKidPhoto = async () => {
    Alert.alert('Add Kid Photo', 'Choose a photo source', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Photos',
        onPress: () => {
          void (async () => {
            const asset = await pickPhotoFromLibrary();
            if (!asset?.uri) return;
            if (__DEV__) console.log('[KidForm] picked photo', asset);
            setPhotoUri(asset.uri);
          })();
        },
      },
      {
        text: 'Camera',
        onPress: () => {
          void (async () => {
            const asset = await takePhotoWithCamera();
            if (!asset?.uri) return;
            if (__DEV__) console.log('[KidForm] captured photo', asset);
            setPhotoUri(asset.uri);
          })();
        },
      },
    ]);
  };

  const selectSizeCode = (field: SizeFieldKey, code: SizeCode | null) => {
    if (field === 'next') {
      setNextSizeCode(code);
      if (code !== 'OTHER') setNextSizeOther('');
    }
    setShowSizePicker(null);
  };

  const save = async () => {
    try {
      if (!name.trim()) {
        Alert.alert('Name Required', 'Please enter a name.');
        return;
      }
      if (nextSizeCode === 'OTHER' && !nextSizeOther.trim()) {
        Alert.alert('Next Size Required', 'Enter the next size text.');
        return;
      }

      const fallbackCurrentSize = sizeCodeToStoredText(existing?.currentSize.code ?? null, existing?.currentSize.otherText ?? null);
      const mergedCurrentSizes = Array.from(
        new Set(
          [...currentSizeCodes, ...(fallbackCurrentSize ? [fallbackCurrentSize] : [])]
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      );
      const primaryCurrent = mergedCurrentSizes[0] || '';
      const primaryCurrentIsCode = CURRENT_SIZE_MULTI_OPTIONS.includes(primaryCurrent as SizeCode);
      const derivedCurrentCode = primaryCurrentIsCode ? (primaryCurrent as SizeCode) : (existing?.currentSize.code ?? null);
      const derivedCurrentOther = primaryCurrentIsCode ? '' : (primaryCurrent || existing?.currentSize.otherText || '');

      const autoNextFromCurrent = !nextSizeCode && derivedCurrentCode ? inferNextSize(derivedCurrentCode) : null;

      const payload = {
        name: name.trim(),
        photoUri: photoUri.trim() || undefined,
        notes: notes || undefined,
        usesMixedSizes,
        currentSizeCodes: mergedCurrentSizes,
        apparelSizeCurrent: apparelSizeCurrent.trim() || undefined,
        apparelSizeNext: apparelSizeNext.trim() || undefined,
        shoeSizeSystem: shoeSizeSystem as any,
        shoeSizeCurrent: shoeSizeCurrent.trim() || undefined,
        shoeSizeNext: shoeSizeNext.trim() || undefined,
        currentSizeCode: derivedCurrentCode ?? undefined,
        currentSizeOther: derivedCurrentCode === 'OTHER' ? derivedCurrentOther.trim() : '',
        nextSizeCode: (nextSizeCode ?? autoNextFromCurrent) ?? undefined,
        nextSizeOther: nextSizeCode === 'OTHER' ? nextSizeOther.trim() : '',
      };

      if (existing) {
        await updateChild(existing.id, payload);
        goToKidsList();
      } else {
        const canCreate = await canCreateAnotherKid();
        if (!canCreate.ok) {
          setKidLimitCurrentCount(canCreate.current);
          setShowKidLimitModal(true);
          return;
        }
        const created = await addChild(payload);
        if (created && createStarterCubbies) {
          const existingLocations = await listStorageLocations(created.id).catch(() =>
            storageLocations.filter((location) => !location.deletedAt && location.childId === created.id),
          );
          const names = new Set(existingLocations.map((location) => location.name.trim().toLowerCase()));
          const defaults = [
            { name: 'Current Closet', type: 'closet' },
            { name: 'Size-Up Bin', type: 'size_up' },
            { name: 'Sell Bin', type: 'sell' },
            { name: 'Out Grew', type: 'out_grew' },
          ] as const;
          for (const entry of defaults) {
            if (names.has(entry.name.toLowerCase())) continue;
            await createStorageLocation({ childId: created.id, name: entry.name, type: entry.type });
          }
        }
        if (returnToClosetAfterCreate) {
          const rootNav = navigation.getParent() as any;
          rootNav?.navigate('Closet', {
            screen: 'ClosetHome',
            params: { showFirstKidAddedHint: true },
          });
        } else {
          goToKidsList();
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[KidForm] save failed', {
          editing: Boolean(existing),
          hasName: Boolean(name.trim()),
          createStarterCubbies,
        }, error);
      }
      if (isKidLimitReachedError(error)) {
        const canCreate = await canCreateAnotherKid().catch(() => ({ current: children.length } as any));
        setKidLimitCurrentCount(canCreate.current ?? children.length);
        setShowKidLimitModal(true);
        return;
      }
      if (isDuplicateChildNameError(error)) {
        Alert.alert('Duplicate Child Name', 'There is already a child with that name.');
        return;
      }
      Alert.alert('Save Failed', error instanceof Error ? error.message : 'Could not save kid profile. Please try again.');
    }
  };

  return (
    <Screen>
      <View style={styles.rowGap}>
      <Card>
        <View style={styles.photoRow}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>{(name.trim()[0] || '?').toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.photoButtons}>
            <PrimaryButton label={photoUri ? 'Change Kid Photo' : 'Add Kid Photo'} variant="secondary" onPress={pickKidPhoto} />
            {photoUri ? <PrimaryButton label="Remove Photo" variant="secondary" onPress={() => setPhotoUri('')} /> : null}
          </View>
        </View>
      </Card>
      <FormInput label="Name" value={name} onChangeText={setName} placeholder="Ava" />
      <Card>
        <Text style={styles.sectionTitle}>Current sizes in rotation</Text>
        <Text style={styles.helperText}>Select all sizes they currently wear.</Text>
        <View style={styles.multiSizeGrid}>
          {CURRENT_SIZE_MULTI_OPTIONS.map((sizeCode) => {
            const active = currentSizeCodes.includes(sizeCode);
            return (
              <Pressable
                key={`current-size-multi-${sizeCode}`}
                style={[styles.optionButton, active ? styles.optionButtonActive : null]}
                onPress={() => {
                  setCurrentSizeCodes((prev) =>
                    prev.includes(sizeCode)
                      ? prev.filter((entry) => entry !== sizeCode)
                      : [...prev, sizeCode],
                  );
                }}
              >
                <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{sizeCode}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Pressable style={styles.pickerField} onPress={() => setShowSizePicker('next')}>
        <Text style={styles.pickerLabel}>Next Size (optional)</Text>
        <Text style={styles.pickerValue}>{nextSizeCode ? formatSizeDisplay(nextSizeCode, nextSizeOther) : 'Select next size (optional)'}</Text>
      </Pressable>
      {nextSizeCode === 'OTHER' ? <FormInput label="Enter next size" value={nextSizeOther} onChangeText={setNextSizeOther} placeholder="e.g. 3T" /> : null}

      <Card>
        <Text style={styles.sectionTitle}>Mixed sizes across categories</Text>
        <Text style={styles.helperText}>Default view: choose current size or all sizes.</Text>
        <ChipSelector
          label="Mixed Sizes"
          options={['On', 'Off']}
          value={usesMixedSizes ? 'On' : 'Off'}
          onChange={(value) => setUsesMixedSizes(value === 'On')}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Clothing sizes (defaults)</Text>
        <Text style={styles.helperText}>Used for suggestions and fit-bin defaults only.</Text>
        <ChipSelector
          label="Apparel Current"
          options={APPAREL_SIZE_OPTIONS}
          value={APPAREL_SIZE_OPTIONS.includes(apparelSizeCurrent as any) ? apparelSizeCurrent : (apparelSizeCurrent ? 'Other…' : undefined)}
          onChange={(value) => {
            if (value === 'Other…') {
              if (APPAREL_SIZE_OPTIONS.includes(apparelSizeCurrent as any)) setApparelSizeCurrent('');
              return;
            }
            setApparelSizeCurrent(value);
          }}
        />
        {(!APPAREL_SIZE_OPTIONS.includes(apparelSizeCurrent as any) || apparelSizeCurrent === '') ? (
          <FormInput label="Apparel Current (custom optional)" value={apparelSizeCurrent} onChangeText={setApparelSizeCurrent} placeholder="e.g. Medium" />
        ) : null}
        <ChipSelector
          label="Apparel Next"
          options={APPAREL_SIZE_OPTIONS}
          value={APPAREL_SIZE_OPTIONS.includes(apparelSizeNext as any) ? apparelSizeNext : (apparelSizeNext ? 'Other…' : undefined)}
          onChange={(value) => {
            if (value === 'Other…') {
              if (APPAREL_SIZE_OPTIONS.includes(apparelSizeNext as any)) setApparelSizeNext('');
              return;
            }
            setApparelSizeNext(value);
          }}
        />
        {(!APPAREL_SIZE_OPTIONS.includes(apparelSizeNext as any) || apparelSizeNext === '') ? (
          <FormInput label="Apparel Next (custom optional)" value={apparelSizeNext} onChangeText={setApparelSizeNext} placeholder="e.g. L" />
        ) : null}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Shoe sizes (defaults)</Text>
        <ChipSelector
          label="Shoe System"
          options={['US_SHOE']}
          value={shoeSizeSystem}
          onChange={(value) => setShoeSizeSystem(value)}
        />
        <ChipSelector
          label="Shoe Current"
          options={SHOE_SIZE_OPTIONS}
          value={SHOE_SIZE_OPTIONS.includes(shoeSizeCurrent as any) ? shoeSizeCurrent : (shoeSizeCurrent ? 'Other…' : undefined)}
          onChange={(value) => {
            if (value === 'Other…') {
              if (SHOE_SIZE_OPTIONS.includes(shoeSizeCurrent as any)) setShoeSizeCurrent('');
              return;
            }
            setShoeSizeCurrent(value);
          }}
        />
        {(!SHOE_SIZE_OPTIONS.includes(shoeSizeCurrent as any) || shoeSizeCurrent === '') ? (
          <FormInput label="Shoe Current (custom optional)" value={shoeSizeCurrent} onChangeText={setShoeSizeCurrent} placeholder="e.g. EU 28" />
        ) : null}
        <ChipSelector
          label="Shoe Next"
          options={SHOE_SIZE_OPTIONS}
          value={SHOE_SIZE_OPTIONS.includes(shoeSizeNext as any) ? shoeSizeNext : (shoeSizeNext ? 'Other…' : undefined)}
          onChange={(value) => {
            if (value === 'Other…') {
              if (SHOE_SIZE_OPTIONS.includes(shoeSizeNext as any)) setShoeSizeNext('');
              return;
            }
            setShoeSizeNext(value);
          }}
        />
        {(!SHOE_SIZE_OPTIONS.includes(shoeSizeNext as any) || shoeSizeNext === '') ? (
          <FormInput label="Shoe Next (custom optional)" value={shoeSizeNext} onChangeText={setShoeSizeNext} placeholder="e.g. EU 29" />
        ) : null}
      </Card>

      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Optional" />

      {!existing ? (
        <Card>
          <Text style={styles.sectionTitle}>Create Starter Cubbies?</Text>
          <Text style={styles.helperText}>Current Closet, Size-Up Bin, Sell Bin, and Out Grew for this child.</Text>
          <ChipSelector label="Starter Cubbies" options={['On', 'Off']} value={createStarterCubbies ? 'On' : 'Off'} onChange={(value) => setCreateStarterCubbies(value === 'On')} />
        </Card>
      ) : null}

      <PrimaryButton label={existing ? 'Save Changes' : 'Add Kid'} onPress={save} />
      {existing ? (
        <PrimaryButton
          label="Delete Kid"
          variant="danger"
          onPress={() => {
            Alert.alert(
              'Delete Kid?',
              `This will remove ${existing.name} from the app. This action can be undone only if you restore from a backup.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Kid',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      try {
                        await deleteChild(existing.id);
                        goToKidsList();
                      } catch (error) {
                        if (__DEV__) console.error('[KidForm] delete failed', { childId: existing.id }, error);
                        Alert.alert('Delete Failed', error instanceof Error ? error.message : 'Could not delete kid profile.');
                      }
                    })();
                  },
                },
              ],
            );
          }}
        />
      ) : null}
      </View>

      <Modal visible={!!showSizePicker} transparent animationType="fade" onRequestClose={() => setShowSizePicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSizePicker(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{showSizePicker ? pickerLabels[showSizePicker] : 'Select Size'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.rowGap}>
                {SIZE_OPTIONS.map((option) => {
                  const active = nextSizeCode === option.code;
                  return (
                    <Pressable key={option.code} style={[styles.optionButton, active ? styles.optionButtonActive : null]} onPress={() => selectSizeCode(showSizePicker ?? 'next', option.code)}>
                      <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable style={[styles.optionButton, !nextSizeCode ? styles.optionButtonActive : null]} onPress={() => selectSizeCode('next', null)}>
                  <Text style={[styles.optionText, !nextSizeCode ? styles.optionTextActive : null]}>None (optional)</Text>
                </Pressable>
              </View>
            </ScrollView>
            <PrimaryButton label="Cancel" variant="secondary" onPress={() => setShowSizePicker(null)} />
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
