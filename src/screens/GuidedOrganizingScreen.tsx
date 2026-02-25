import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<ClosetStackParamList, 'GuidedOrganizing'>;

export const GuidedOrganizingScreen: React.FC<Props> = ({ navigation }) => {
  const { items, updateSettings } = useData();

  const summary = useMemo(() => {
    const pants = items.filter((item) => item.clothingType === 'bottom').length;
    const tops = items.filter((item) => item.clothingType === 'top').length;
    return { total: items.length, pants, tops };
  }, [items]);

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Start with one drawer.</Text>
        <Text style={styles.meta}>Log just 5 items. That's it.</Text>
      </Card>

      <PrimaryButton label="Quick Add Item" onPress={() => navigation.navigate('AddItem', { quick: true })} />

      {summary.total >= 5 ? (
        <Card>
          <Text style={styles.meta}>You've logged {summary.total} items.</Text>
          <Text style={styles.meta}>You already have {summary.pants} pants and {summary.tops} tops.</Text>
          <PrimaryButton
            label="Looks good"
            variant="secondary"
            onPress={async () => {
              await updateSettings({ guidedOnboarding: false });
              navigation.replace('ClosetHome');
            }}
          />
        </Card>
      ) : null}
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
    fontSize: 15,
    color: '#4b5563',
  },
});
