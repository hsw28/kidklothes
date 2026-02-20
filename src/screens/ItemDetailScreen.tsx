import React from 'react';
import { Linking, StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ItemsStackParamList } from '@/navigation/types';
import { buildOutboundUrl } from '@/utils/outbound';

type Props = NativeStackScreenProps<ItemsStackParamList, 'ItemDetail'>;

export const ItemDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { items, children, deleteItem } = useData();

  const item = items.find((entry) => entry.id === route.params.itemId);
  const child = children.find((entry) => entry.id === item?.childId);

  if (!item) {
    return (
      <Screen>
        <Text style={styles.label}>Item not found.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.name}>{item.title}</Text>
        <Text style={styles.label}>Kid: {child?.name ?? 'Unknown'}</Text>
        <Text style={styles.label}>Type: {item.clothingType}</Text>
        <Text style={styles.label}>Size: {item.size}</Text>
        <Text style={styles.label}>Status: {item.status}</Text>
        {item.brand ? <Text style={styles.label}>Brand: {item.brand}</Text> : null}
        {item.tags.length > 0 ? <Text style={styles.label}>Tags: {item.tags.join(', ')}</Text> : null}
        {item.notes ? <Text style={styles.label}>Notes: {item.notes}</Text> : null}
      </Card>

      {item.url ? (
        <PrimaryButton
          label="View on site"
          onPress={() => Linking.openURL(buildOutboundUrl(item.url ?? ''))}
          variant="secondary"
        />
      ) : null}
      <PrimaryButton label="Edit Item" onPress={() => navigation.navigate('AddItem', { itemId: item.id })} />
      <PrimaryButton
        label="Delete Item"
        variant="danger"
        onPress={async () => {
          await deleteItem(item.id);
          navigation.goBack();
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  label: {
    color: '#4b5563',
    fontSize: 14,
  },
});
