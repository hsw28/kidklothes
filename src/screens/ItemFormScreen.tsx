import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChipSelector } from '@/components/ChipSelector';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClothingType, ItemStatus } from '@/models';
import { ItemsStackParamList } from '@/navigation/types';
import { unfurlUrl } from '@/utils/unfurlUrl';

const clothingTypes: ClothingType[] = ['sleeper', 'romper', 'top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'];
const statusOptions: ItemStatus[] = ['wishlist', 'owned'];

type Props = NativeStackScreenProps<ItemsStackParamList, 'AddItem'>;

export const ItemFormScreen: React.FC<Props> = ({ route, navigation }) => {
  const { children, items, addItem, updateItem } = useData();
  const editing = route.params?.itemId;
  const existing = useMemo(() => items.find((item) => item.id === editing), [editing, items]);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [url, setUrl] = useState(existing?.url ?? route.params?.url ?? '');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? '');
  const [size, setSize] = useState(existing?.size ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [childId, setChildId] = useState(existing?.childId ?? children[0]?.id ?? '');
  const [clothingType, setClothingType] = useState<ClothingType>(existing?.clothingType ?? 'top');
  const [status, setStatus] = useState<ItemStatus>(existing?.status ?? 'wishlist');
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);

  useEffect(() => {
    const sharedUrl = route.params?.url?.trim();
    if (!existing && sharedUrl) {
      setUrl(sharedUrl);
    }
  }, [existing, route.params?.url]);

  if (children.length === 0) {
    return (
      <Screen>
        <Text style={styles.message}>Add a kid first before adding clothing items.</Text>
      </Screen>
    );
  }

  const fetchPreview = async () => {
    if (!url.trim()) {
      Alert.alert('URL required', 'Please paste a product URL first.');
      return;
    }

    setIsFetchingPreview(true);
    try {
      const preview = await unfurlUrl(url);
      setTitle(preview.title || title);
      setBrand(preview.brand || brand);
      setImageUrl(preview.imageUrl || imageUrl);
    } catch {
      Alert.alert('Invalid URL', 'Please enter a valid URL to fetch preview data.');
    } finally {
      setIsFetchingPreview(false);
    }
  };

  const save = async () => {
    if (!title.trim() || !size.trim() || !childId) {
      Alert.alert('Missing fields', 'Please enter title, size, and choose a kid.');
      return;
    }

    const payload = {
      childId,
      title,
      url: url || undefined,
      brand: brand || undefined,
      imageUrl: imageUrl || undefined,
      clothingType,
      size,
      status,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      notes: notes || undefined,
    };

    if (existing) {
      await updateItem(existing.id, payload);
      navigation.replace('ItemDetail', { itemId: existing.id });
    } else {
      await addItem(payload);
      navigation.goBack();
    }
  };

  return (
    <Screen>
      <FormInput label="URL" value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="https://..." />
      <PrimaryButton label={isFetchingPreview ? 'Fetching...' : 'Fetch Preview'} onPress={fetchPreview} variant="secondary" />

      <FormInput label="Title" value={title} onChangeText={setTitle} placeholder="Auto-filled after preview" />
      <FormInput label="Brand" value={brand} onChangeText={setBrand} placeholder="Auto-filled after preview" />
      <FormInput label="Image URL" value={imageUrl} onChangeText={setImageUrl} placeholder="Optional" autoCapitalize="none" />
      <FormInput label="Size" value={size} onChangeText={setSize} placeholder="e.g. 5T" />

      <View style={styles.section}>
        <ChipSelector
          label="Child"
          options={children.map((entry) => entry.name)}
          value={children.find((entry) => entry.id === childId)?.name}
          onChange={(name) => setChildId(children.find((entry) => entry.name === name)?.id ?? '')}
        />
      </View>

      <View style={styles.section}>
        <ChipSelector label="Clothing type" options={clothingTypes} value={clothingType} onChange={setClothingType} />
      </View>

      <View style={styles.section}>
        <ChipSelector label="Status" options={statusOptions} value={status} onChange={setStatus} />
      </View>

      <FormInput label="Tags (comma-separated)" value={tags} onChangeText={setTags} placeholder="casual, summer" />
      <FormInput label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

      <PrimaryButton label={existing ? 'Save Changes' : 'Save Item'} onPress={save} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  message: {
    fontSize: 16,
    color: '#374151',
  },
  section: {
    gap: 6,
  },
});
