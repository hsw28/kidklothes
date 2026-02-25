import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { OutfitsStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<OutfitsStackParamList, 'OutfitsList'>;

export const OutfitsListScreen: React.FC<Props> = ({ navigation }) => {
  const { outfits, children } = useData();
  const [packingMode, setPackingMode] = useState(false);
  const [selectedOutfitIds, setSelectedOutfitIds] = useState<string[]>([]);

  const selectedOutfits = useMemo(() => outfits.filter((outfit) => selectedOutfitIds.includes(outfit.id)), [outfits, selectedOutfitIds]);

  const toggleSelectOutfit = (id: string) => {
    setSelectedOutfitIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const sharePackingList = async () => {
    if (selectedOutfits.length === 0) {
      Alert.alert('No outfits selected', 'Select at least one outfit for packing list mode.');
      return;
    }

    const lines = selectedOutfits.map((outfit, idx) => {
      const child = children.find((entry) => entry.id === outfit.childId);
      const preview = outfit.previewUri ? `\nPreview: ${outfit.previewUri}` : '';
      return `${idx + 1}. ${outfit.name} (${child?.name ?? 'Unknown kid'})${preview}`;
    });

    const message = ['Packing list', '', ...lines].join('\n');
    await Share.share({
      title: 'Packing list',
      message,
    });
  };

  return (
    <Screen
      scroll={false}
      style={styles.screen}
      overlay={<FloatingActionButton onPress={() => navigation.navigate('OutfitBuilder')} accessibilityLabel="Add outfit" testID="outfits-fab-add" />}
    >
      <View style={styles.content}>
        <View style={styles.topActions}>
          <PrimaryButton
            label={packingMode ? 'Done Selecting' : 'Packing List Mode'}
            variant="secondary"
            onPress={() => {
              setPackingMode((prev) => !prev);
              if (packingMode) setSelectedOutfitIds([]);
            }}
          />
          {packingMode ? <PrimaryButton label="Share Packing List" variant="secondary" onPress={sharePackingList} /> : null}
        </View>

        {outfits.length === 0 ? (
          <EmptyState title="No outfits yet" subtitle="Tap + to build an outfit from saved items." />
        ) : (
          outfits.map((outfit) => {
            const child = children.find((entry) => entry.id === outfit.childId);
            const selected = selectedOutfitIds.includes(outfit.id);
            return (
              <Pressable
                key={outfit.id}
                onPress={() => {
                  if (packingMode) {
                    toggleSelectOutfit(outfit.id);
                    return;
                  }
                  navigation.navigate('OutfitBuilder', { outfitId: outfit.id });
                }}
              >
                <Card style={selected && styles.selectedCard}>
                  <View style={styles.cardRow}>
                    {outfit.previewUri ? (
                      <Image source={{ uri: outfit.previewUri }} style={styles.preview} />
                    ) : (
                      <View style={styles.previewPlaceholder}>
                        <Text style={styles.previewPlaceholderText}>No Preview</Text>
                      </View>
                    )}
                    <View style={styles.cardBody}>
                      <Text style={styles.name}>{outfit.name}</Text>
                      <View style={styles.row}>
                        <Text style={styles.meta}>{child?.name ?? 'Unknown kid'}</Text>
                        <Text style={styles.meta}>{outfit.itemIds.length} items</Text>
                      </View>
                      {packingMode ? <Text style={styles.selectHint}>{selected ? 'Selected' : 'Tap to select'}</Text> : null}
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </View>

    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 76,
  },
  topActions: {
    gap: 8,
  },
  selectedCard: {
    borderColor: '#111827',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  previewPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  previewPlaceholderText: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
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
  selectHint: {
    fontSize: 12,
    color: '#374151',
  },
});
