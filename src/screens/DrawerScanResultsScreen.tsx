import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ClosetStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<ClosetStackParamList, 'DrawerScanResults'>;

export const DrawerScanResultsScreen: React.FC<Props> = ({ navigation, route }) => {
  const total = route.params.counts.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Saved {total} items</Text>
        <Text style={styles.meta}>Counts by type:</Text>
        {route.params.counts.map((entry) => (
          <Text key={entry.label} style={styles.meta}>
            {entry.label}: {entry.count}
          </Text>
        ))}
      </Card>

      <PrimaryButton
        label="Refine details later"
        onPress={() =>
          navigation.navigate('ItemsList', {
            hideInbox: true,
            initialStatus: 'owned',
            initialTodayOnly: true,
            initialChildId: route.params.childId,
            initialSize: route.params.size,
          })
        }
      />
      <PrimaryButton label="Back to Closet" variant="secondary" onPress={() => navigation.navigate('ClosetHome')} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  meta: {
    fontSize: 14,
    color: '#4b5563',
  },
});
