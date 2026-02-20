import React, { useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system';
import ViewShot from 'react-native-view-shot';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { Item } from '@/models';
import { OutfitsStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<OutfitsStackParamList, 'OutfitBuilder'>;

const mapSelectedItems = (selectedIds: string[], allItems: Item[]) => {
  const byId = new Map(allItems.map((item) => [item.id, item]));
  return selectedIds.map((id) => byId.get(id)).filter(Boolean) as Item[];
};

export const OutfitBuilderScreen: React.FC<Props> = ({ navigation, route }) => {
  const { children, items, outfits, addOutfit, updateOutfit, deleteOutfit } = useData();
  const editingId = route.params?.outfitId;
  const existing = useMemo(() => outfits.find((outfit) => outfit.id === editingId), [editingId, outfits]);

  const [name, setName] = useState(existing?.name ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [childId, setChildId] = useState(existing?.childId ?? '');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(existing?.itemIds ?? []);
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<any>(null);

  const availableItems = useMemo(() => items.filter((item) => item.childId === childId), [childId, items]);
  const selectedItems = useMemo(() => mapSelectedItems(selectedItemIds, availableItems), [availableItems, selectedItemIds]);
  const selectedImageUrls = useMemo(
    () => selectedItems.map((item) => item.imageUrl).filter(Boolean).slice(0, 4) as string[],
    [selectedItems],
  );
  const shareablePreviewUri = existing?.previewUri;

  if (children.length === 0) {
    return (
      <Screen>
        <EmptyState title="No kids yet" subtitle="Add a kid first to build outfits." />
      </Screen>
    );
  }

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
  };

  const capturePreviewUri = async (): Promise<string | undefined> => {
    if (!previewRef.current?.capture) return existing?.previewUri;

    try {
      const capturedUri = await previewRef.current.capture();
      if (!capturedUri) return existing?.previewUri;

      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) return capturedUri;

      const dir = `${baseDir}outfit-previews/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const fileUri = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await FileSystem.copyAsync({ from: capturedUri, to: fileUri });
      return fileUri;
    } catch {
      return existing?.previewUri;
    }
  };

  const save = async () => {
    if (!name.trim() || !childId || selectedItemIds.length === 0) {
      Alert.alert('Missing fields', 'Please choose a child, add a name, and select at least one item.');
      return;
    }

    setSaving(true);
    try {
      const previewUri = await capturePreviewUri();
      const payload = {
        name,
        childId,
        notes: notes || undefined,
        itemIds: selectedItemIds,
        previewUri,
      };

      if (existing) {
        await updateOutfit(existing.id, payload);
      } else {
        await addOutfit(payload);
      }

      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const sharePreview = async () => {
    if (!shareablePreviewUri) {
      Alert.alert('No preview yet', 'Save this outfit first to generate a shareable preview image.');
      return;
    }

    try {
      await Share.share({
        url: shareablePreviewUri,
        message: `${name || 'Outfit'} preview`,
        title: name || 'Outfit Preview',
      });
    } catch {
      Alert.alert('Share failed', 'Could not open the share sheet for this preview.');
    }
  };

  return (
    <Screen>
      <ChipSelector
        label="Pick child first"
        options={children.map((child) => child.name)}
        value={children.find((child) => child.id === childId)?.name}
        onChange={(nameValue) => {
          const next = children.find((entry) => entry.name === nameValue)?.id ?? '';
          setChildId(next);
          if (!existing || next !== existing.childId) {
            setSelectedItemIds([]);
          }
        }}
      />

      {!childId ? (
        <EmptyState title="Choose a child" subtitle="Select a child to load their saved items." />
      ) : (
        <>
          <FormInput label="Outfit name" value={name} onChangeText={setName} placeholder="Weekend picnic" />
          <FormInput label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

          <Text style={styles.heading}>Saved items</Text>
          {availableItems.length === 0 ? (
            <EmptyState title="No items for this child" subtitle="Add clothing items first." />
          ) : (
            availableItems.map((item) => {
              const active = selectedItemIds.includes(item.id);
              return (
                <Pressable key={item.id} onPress={() => toggleItem(item.id)}>
                  <Card style={[styles.pick, active && styles.pickActive]}>
                    <View style={styles.itemRow}>
                      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumb} /> : <View style={styles.thumbPlaceholder} />}
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName}>{item.title}</Text>
                        <View style={styles.row}>
                          <Text style={styles.meta}>{item.clothingType}</Text>
                          <Text style={styles.meta}>Size {item.size}</Text>
                        </View>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}

          <Text style={styles.heading}>Selected items ({selectedItems.length})</Text>
          {selectedItems.length === 0 ? (
            <EmptyState title="No selected items" subtitle="Tap items above to include them in this outfit." />
          ) : (
            selectedItems.map((item) => (
              <Card key={`selected-${item.id}`}>
                <Text style={styles.itemName}>{item.title}</Text>
                <Text style={styles.meta}>{item.clothingType} • Size {item.size}</Text>
              </Card>
            ))
          )}

          <Text style={styles.heading}>Preview</Text>
          <ViewShot ref={previewRef} options={{ format: 'jpg', quality: 0.9 }} style={styles.previewShot} collapsable={false}>
            {selectedImageUrls.length > 0 ? (
              <View style={styles.collage}>
                {selectedImageUrls.map((uri, idx) => (
                  <Image key={`${uri}-${idx}`} source={{ uri }} style={styles.collageCell} />
                ))}
                {selectedImageUrls.length === 1 ? <View style={styles.collageCell} /> : null}
                {selectedImageUrls.length === 2 ? (
                  <>
                    <View style={styles.collageCell} />
                    <View style={styles.collageCell} />
                  </>
                ) : null}
                {selectedImageUrls.length === 3 ? <View style={styles.collageCell} /> : null}
              </View>
            ) : (
              <View style={styles.textPreview}>
                <Text style={styles.previewTitle}>{name.trim() || 'Outfit Preview'}</Text>
                {selectedItems.length === 0 ? (
                  <Text style={styles.previewText}>Select items to generate preview</Text>
                ) : (
                  selectedItems.slice(0, 4).map((item) => (
                    <Text key={`preview-${item.id}`} style={styles.previewText}>
                      • {item.title}
                    </Text>
                  ))
                )}
              </View>
            )}
          </ViewShot>

          <PrimaryButton label={saving ? 'Saving...' : existing ? 'Save Outfit' : 'Create Outfit'} onPress={save} />
          {existing ? <PrimaryButton label="Share Image" variant="secondary" onPress={sharePreview} /> : null}
          {existing ? (
            <PrimaryButton
              label="Delete Outfit"
              variant="danger"
              onPress={async () => {
                await deleteOutfit(existing.id);
                navigation.goBack();
              }}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  heading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  pick: {
    borderColor: '#e5e7eb',
  },
  pickActive: {
    borderColor: '#111827',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemBody: {
    flex: 1,
    gap: 4,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  meta: {
    fontSize: 13,
    color: '#6b7280',
  },
  previewShot: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  collage: {
    width: '100%',
    aspectRatio: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  collageCell: {
    width: '50%',
    height: '50%',
    backgroundColor: '#f3f4f6',
  },
  textPreview: {
    padding: 16,
    gap: 6,
    minHeight: 140,
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  previewText: {
    fontSize: 13,
    color: '#4b5563',
  },
});
