import React, { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ActivityEvent } from '@/models';
import { useAppTheme } from '@/theme';

export const ActivityLogScreen: React.FC = () => {
  const { getEvents, clearEvents } = useData();
  const theme = useAppTheme();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      const loaded = await getEvents(300);
      setEvents(loaded);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load activity log.';
      setErrorMessage(message);
      if (__DEV__) console.error('[ActivityLogScreen] load failed', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Activity Log (Dev)</Text>
        <Text style={styles.meta}>Local-only instrumentation events.</Text>
        <PrimaryButton label="Refresh" variant="secondary" onPress={load} />
        <PrimaryButton
          label="Clear Log"
          variant="danger"
          onPress={async () => {
            await clearEvents();
            await load();
            Alert.alert('Cleared', 'Activity log cleared.');
          }}
        />
      </Card>

      {loading ? (
        <Card>
          <View style={styles.inlineStatus}>
            <ActivityIndicator color={theme.colors.accentPrimary} />
            <Text style={styles.meta}>Loading activity events…</Text>
          </View>
        </Card>
      ) : null}

      {!loading && errorMessage ? (
        <EmptyState title="Couldn’t Load Activity Log" subtitle={errorMessage} actionLabel="Retry" onActionPress={() => void load()} />
      ) : null}

      {!loading && !errorMessage ? events.map((event) => (
        <Card key={event.id}>
          <Text style={styles.eventType}>{event.type}</Text>
          <Text style={styles.meta}>{new Date(event.createdAt).toLocaleString()}</Text>
          <Text style={styles.payload}>{JSON.stringify(event.payload ?? {}, null, 2)}</Text>
        </Card>
      )) : null}

      {!loading && !errorMessage && events.length === 0 ? (
        <EmptyState title="No Activity Yet" subtitle="Local instrumentation events will appear here as you use the app." />
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  eventType: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  meta: { fontSize: 12, color: '#6b7280' },
  payload: { fontSize: 12, color: '#374151' },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
