import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { EmptyState } from '@/components/EmptyState';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ItemStatus } from '@/models';
import { ItemsStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<ItemsStackParamList, 'ItemsList'>;
type StatusFilter = 'All' | ItemStatus;

export const ItemsListScreen: React.FC<Props> = ({ navigation }) => {
  const { items, children } = useData();
  const [childId, setChildId] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusFilter>('All');
  const [query, setQuery] = useState('');

  const childOptions = useMemo(() => ['All', ...children.map((child) => child.name)], [children]);
  const statusOptions: StatusFilter[] = ['All', 'wishlist', 'owned'];
  const activeChild = children.find((entry) => entry.id === childId);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (childId && item.childId !== childId) return false;
    if (status !== 'All' && item.status !== status) return false;
    if (!normalizedQuery) return true;

    const haystack = [item.title, item.brand ?? '', item.tags.join(' ')].join(' ').toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const canShareWishlist = Boolean(childId && status === 'wishlist' && filtered.length > 0);

  const chooseChild = (name: string) => {
    if (name === 'All') {
      setChildId(undefined);
      return;
    }
    setChildId(children.find((child) => child.name === name)?.id);
  };

  const shareWishlist = async () => {
    if (!childId || status !== 'wishlist') {
      Alert.alert('Select filters', 'Choose a child and wishlist status to export a wishlist.');
      return;
    }

    const child = children.find((entry) => entry.id === childId);
    const lines = filtered.map((item, idx) => {
      const link = item.url ? `\n   ${item.url}` : '\n   (no link saved)';
      const tags = item.tags.length ? ` [${item.tags.join(', ')}]` : '';
      return `${idx + 1}. ${item.title} - size ${item.size}${tags}${link}`;
    });

    const message = [`${child?.name ?? 'Child'} wishlist`, '', ...lines].join('\n');
    try {
      await Share.share({
        title: `${child?.name ?? 'Child'} Wishlist`,
        message,
      });
    } catch {
      Alert.alert('Share failed', 'Could not open the share sheet.');
    }
  };

  return (
    <Screen scroll={false} style={styles.screen}>
      <View style={styles.content}>
        <FormInput
          label="Search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search title, brand, or tags"
          autoCapitalize="none"
        />

        {children.length > 0 ? (
          <ChipSelector
            label="Filter by kid"
            options={childOptions}
            value={activeChild ? activeChild.name : 'All'}
            onChange={chooseChild}
          />
        ) : null}
        <ChipSelector label="Filter by status" options={statusOptions} value={status} onChange={setStatus} />
        {canShareWishlist ? <PrimaryButton label="Share Wishlist Export" variant="secondary" onPress={shareWishlist} /> : null}

        {filtered.length === 0 ? (
          <EmptyState title="No items yet" subtitle="Tap + to add your first clothing item from a link." />
        ) : (
          filtered.map((item) => {
            const child = children.find((entry) => entry.id === item.childId);
            return (
              <Pressable key={item.id} onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}>
                <Card>
                  <View style={styles.cardRow}>
                    {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} /> : <View style={styles.thumbnailPlaceholder} />}
                    <View style={styles.cardBody}>
                      <Text style={styles.title}>{item.title}</Text>
                      {!!item.brand ? <Text style={styles.brand}>Brand: {item.brand}</Text> : null}
                      <View style={styles.row}>
                        <Text style={styles.meta}>{child?.name ?? 'Unknown kid'}</Text>
                        <Text style={styles.meta}>Size {item.size}</Text>
                        <Text style={styles.meta}>{item.clothingType}</Text>
                      </View>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.status}</Text>
                      </View>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </View>

      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddItem')}>
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
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cardRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  thumbnailPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  meta: {
    fontSize: 13,
    color: '#6b7280',
  },
  brand: {
    fontSize: 13,
    color: '#374151',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'capitalize',
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
