import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { useReviewPrompt } from '@/hooks/useReviewPrompt';
import { useUndoToast } from '@/hooks/useUndoToast';
import { ClothingType } from '@/models';
import { ClosetStackParamList } from '@/navigation/types';
import { BATCH_ADD_CLOTHING_TYPE_OPTIONS, clothingTypeDisplayLabel } from '@/utils/categories';
import { pickPhotoFromLibrary, takePhotoWithCamera } from '@/utils/photoPicker';

type Props = NativeStackScreenProps<ClosetStackParamList, 'BatchAdd'>;

const typeOptions: ClothingType[] = BATCH_ADD_CLOTHING_TYPE_OPTIONS;

export const BatchAddScreen: React.FC<Props> = ({ navigation }) => {
  const { children, addItemsBatch, archiveItems, logEvent } = useData();
  const { recordMeaningfulActionAndMaybePrompt } = useReviewPrompt();
  const { showToast } = useUndoToast();
  const [childId, setChildId] = useState(children[0]?.id ?? '');
  const [size, setSize] = useState('');
  const [clothingType, setClothingType] = useState<ClothingType>('top');
  const [quantityText, setQuantityText] = useState('1');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    Alert.alert('Add Batch Photo', 'Choose a photo source', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Photos',
        onPress: () => {
          void (async () => {
            const asset = await pickPhotoFromLibrary();
            if (!asset?.uri) return;
            if (__DEV__) console.log('[BatchAdd] picked photo', asset);
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
            if (__DEV__) console.log('[BatchAdd] captured photo', asset);
            setPhotoUri(asset.uri);
          })();
        },
      },
    ]);
  };

  const save = async () => {
    const quantity = Math.max(1, Math.min(30, Number(quantityText || '1')));
    if (!childId) {
      Alert.alert('Missing child', 'Select a child first.');
      return;
    }
    if (!size.trim()) {
      Alert.alert('Missing size', 'Enter a size first.');
      return;
    }

    setSaving(true);
    try {
      const createdItems = await addItemsBatch({
        quantity,
        childId,
        title: clothingTypeDisplayLabel(clothingType),
        clothingType,
        size: size.trim(),
        status: 'owned',
        statusForChild: 'owned',
        notes: notes.trim() || undefined,
        imageUrl: photoUri || undefined,
        imageUrls: photoUri ? [photoUri] : [],
        cachedImageUri: photoUri || undefined,
        tags: [],
        seasonTags: [],
      });
      if (createdItems.length > 0) {
        const createdIds = createdItems.map((item) => item.id);
        const createdCount = createdItems.reduce((sum, item) => sum + item.quantity, 0);
        showToast({
          label: `Added ${createdCount} Item${createdCount === 1 ? '' : 's'} in Batch`,
          doUndo: async () => {
            await archiveItems(createdIds);
          },
        });
      }
      await logEvent('item_created_via', {
        createdVia: 'batch_add',
        childId,
        size: size.trim(),
        clothingType,
        quantity,
      });
      await recordMeaningfulActionAndMaybePrompt('batch_add_saved', 'batch_add_save');
      navigation.navigate('ItemsList', {
        hideInbox: true,
        initialStatus: 'owned',
        initialTodayOnly: true,
        initialChildId: childId,
        initialSize: size.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  if (children.length === 0) {
    return (
      <Screen>
        <Card>
          <Text style={styles.meta}>Add a child first, then use Batch Add.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Batch Add</Text>
        <Text style={styles.meta}>Record multiple copies of the same item in one save.</Text>
      </Card>
      <Card>
        <ChipSelector
          label="Child"
          options={children.map((child) => child.name)}
          value={children.find((entry) => entry.id === childId)?.name}
          onChange={(name) => setChildId(children.find((entry) => entry.name === name)?.id ?? '')}
        />
        <FormInput label="Size" value={size} onChangeText={setSize} placeholder="e.g. 3T" />
        <ChipSelector label="Clothing type" options={typeOptions} value={clothingType} onChange={setClothingType} />
        <FormInput label="Quantity (1-30)" value={quantityText} onChangeText={setQuantityText} keyboardType="number-pad" />
        <FormInput label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
        <PrimaryButton label={photoUri ? 'Replace Photo' : 'Add Photo (optional)'} variant="secondary" onPress={() => void pickPhoto()} />
        <PrimaryButton label={saving ? 'Saving...' : 'Save Batch'} onPress={() => void save()} />
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  meta: {
    fontSize: 14,
    color: '#4b5563',
  },
});
