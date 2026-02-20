import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { OutfitsStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<OutfitsStackParamList, 'OutfitsList'>;

export const OutfitsListScreen: React.FC<Props> = ({ navigation }) => {
  const { outfits, children } = useData();

  return (
    <Screen scroll={false} style={styles.screen}>
      <View style={styles.content}>
        {outfits.length === 0 ? (
          <EmptyState title="No outfits yet" subtitle="Tap + to build an outfit from saved items." />
        ) : (
          outfits.map((outfit) => {
            const child = children.find((entry) => entry.id === outfit.childId);
            return (
              <Pressable key={outfit.id} onPress={() => navigation.navigate('OutfitBuilder', { outfitId: outfit.id })}>
                <Card>
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
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </View>

      <Pressable style={styles.fab} onPress={() => navigation.navigate('OutfitBuilder')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: {
    color: '#fff',
    fontSize: 30,
    lineHeight: 32,
    marginTop: -1,
  },
});
