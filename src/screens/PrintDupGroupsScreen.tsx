import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { getDuplicatePrintGroups } from '@/utils/closetViewInsights';

type Props = NativeStackScreenProps<ClosetStackParamList, 'PrintDupGroups'>;

const normalize = (value: string) => value.toLowerCase().trim();

export const PrintDupGroupsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { items, childItems } = useData();
  const childId = route.params?.childId;
  const brandId = route.params?.brandId;
  const groups = useMemo(() => {
    if (!childId) return [];
    const raw = getDuplicatePrintGroups(childId, items, childItems, 50);
    if (!brandId) return raw;
    const brand = normalize(brandId);
    return raw.filter((group) => {
      return items.some((item) => normalize(item.printName ?? '') === normalize(group.printName) && item.childIds.includes(childId) && (
        normalize(item.brand ?? '') === brand || item.brandTags.some((tag) => normalize(tag) === brand)
      ));
    });
  }, [childId, brandId, items, childItems]);

  if (groups.length === 0) {
    return (
      <Screen>
        <EmptyState title="No duplicate print groups" subtitle="Nothing to review yet." />
      </Screen>
    );
  }

  return (
    <Screen>
      {groups.map((group) => (
        <Pressable
          key={`${group.printName}-${group.sizes.join('|')}`}
          onPress={() =>
            navigation.navigate('ItemsList', {
              hideInbox: true,
              initialChildId: childId,
              initialStatus: 'owned',
            })
          }
        >
          <Card>
            <Text style={styles.title}>{group.printName}</Text>
            <Text style={styles.meta}>Sizes: {group.sizes.join(', ')}</Text>
            <Text style={styles.meta}>Items: {group.count}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    fontSize: 13,
    color: '#6b7280',
  },
});
