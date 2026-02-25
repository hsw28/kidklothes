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
import { SIZE_OPTIONS, formatSizeDisplay, inferNextSize } from '@/utils/sizes';

type Props = NativeStackScreenProps<KidsStackParamList, 'KidForm'>;

type SizeFieldKey = 'current' | 'next';

const isKidLimitReachedError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : '';
  return code === 'KID_LIMIT_REACHED' || message === 'KID_LIMIT_REACHED';
};

const pickerLabels = {
  current: 'Wearing Now (Size)',
  next: 'Next Size',
} as const;

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
  const [currentSizeCode, setCurrentSizeCode] = useState<SizeCode | null>(existing?.currentSize.code ?? null);
  const [currentSizeOther, setCurrentSizeOther] = useState(existing?.currentSize.otherText ?? '');
  const [nextSizeCode, setNextSizeCode] = useState<SizeCode | null>(existing?.nextSize.code ?? null);
  const [nextSizeOther, setNextSizeOther] = useState(existing?.nextSize.otherText ?? '');
  const [showSizePicker, setShowSizePicker] = useState<SizeFieldKey | null>(null);
  const [createStarterCubbies, setCreateStarterCubbies] = useState(!existing);
  const [showKidLimitModal, setShowKidLimitModal] = useState(false);
  const [kidLimitCurrentCount, setKidLimitCurrentCount] = useState(children.length);

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
    if (field === 'current') {
      setCurrentSizeCode(code);
      if (code !== 'OTHER') setCurrentSizeOther('');
      if (!nextSizeCode) {
        const inferred = code ? inferNextSize(code) : null;
        if (inferred) setNextSizeCode(inferred);
      }
    } else {
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
      if (currentSizeCode === 'OTHER' && !currentSizeOther.trim()) {
        Alert.alert('Size Required', 'Enter the current size text.');
        return;
      }
      if (nextSizeCode === 'OTHER' && !nextSizeOther.trim()) {
        Alert.alert('Next Size Required', 'Enter the next size text.');
        return;
      }

      const payload = {
        name: name.trim(),
        photoUri: photoUri.trim() || undefined,
        notes: notes || undefined,
        usesMixedSizes,
        currentSizeCode: currentSizeCode ?? undefined,
        currentSizeOther: currentSizeCode === 'OTHER' ? currentSizeOther.trim() : '',
        nextSizeCode: nextSizeCode ?? undefined,
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
      <Pressable style={styles.pickerField} onPress={() => setShowSizePicker('current')}>
        <Text style={styles.pickerLabel}>Wearing Now (Size)</Text>
        <Text style={styles.pickerValue}>{currentSizeCode ? formatSizeDisplay(currentSizeCode, currentSizeOther) : 'Select a size'}</Text>
      </Pressable>
      {currentSizeCode === 'OTHER' ? <FormInput label="Enter size" value={currentSizeOther} onChangeText={setCurrentSizeOther} placeholder="e.g. 24M/2T" /> : null}

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

      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Optional" />

      {!existing ? (
        <Card>
          <Text style={styles.sectionTitle}>Create Starter Cubbies?</Text>
          <Text style={styles.helperText}>Current Closet, Size-Up Bin, and Sell Bin for this child.</Text>
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
                  const active = showSizePicker === 'current' ? currentSizeCode === option.code : nextSizeCode === option.code;
                  return (
                    <Pressable key={option.code} style={[styles.optionButton, active ? styles.optionButtonActive : null]} onPress={() => selectSizeCode(showSizePicker ?? 'current', option.code)}>
                      <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
                {showSizePicker === 'next' ? (
                  <Pressable style={[styles.optionButton, !nextSizeCode ? styles.optionButtonActive : null]} onPress={() => selectSizeCode('next', null)}>
                    <Text style={[styles.optionText, !nextSizeCode ? styles.optionTextActive : null]}>None (optional)</Text>
                  </Pressable>
                ) : null}
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
