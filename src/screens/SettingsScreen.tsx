import React from 'react';
import { Alert, Text } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';

export const SettingsScreen: React.FC = () => {
  const { refresh } = useData();

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Settings</Text>
        <Text style={{ color: '#4b5563' }}>
          Data is stored locally with SQLite. Migrations run on startup and can be replaced by a Supabase adapter later.
        </Text>
      </Card>

      <PrimaryButton
        label="Reload Local Data"
        variant="secondary"
        onPress={async () => {
          await refresh();
          Alert.alert('Done', 'Local data refreshed.');
        }}
      />
    </Screen>
  );
};
