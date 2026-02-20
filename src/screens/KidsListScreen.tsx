import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { KidsStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<KidsStackParamList, 'KidsList'>;

export const KidsListScreen: React.FC<Props> = ({ navigation }) => {
  const { children, items } = useData();

  return (
    <Screen scroll={false} style={styles.screen}>
      {children.length === 0 ? (
        <EmptyState title="No kids yet" subtitle="Tap + to add your first child profile." />
      ) : (
        children.map((child) => {
          const count = items.filter((item) => item.childId === child.id).length;
          return (
            <Pressable key={child.id} onPress={() => navigation.navigate('KidForm', { childId: child.id })}>
              <Card>
                <Text style={styles.name}>{child.name}</Text>
                <Text style={styles.meta}>{count} items</Text>
              </Card>
            </Pressable>
          );
        })
      )}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('KidForm')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingBottom: 76,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
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
