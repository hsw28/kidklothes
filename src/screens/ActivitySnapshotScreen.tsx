import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { useAppTheme } from '@/theme';

export const ActivitySnapshotScreen: React.FC = () => {
  const { items, getEvents } = useData();
  const theme = useAppTheme();
  const [events, setEvents] = useState<Array<{ type: string; createdAt: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErrorMessage(undefined);
    void getEvents(1000)
      .then((rows) => {
        if (!mounted) return;
        setEvents(rows.map((row) => ({ type: row.type, createdAt: row.createdAt })));
      })
      .catch((error) => {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : 'Could not load activity snapshot.';
        setErrorMessage(message);
        if (__DEV__) console.error('[ActivitySnapshotScreen] load failed', error);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [getEvents]);

  const statusCounts = useMemo(
    () =>
      ['wishlist', 'owned', 'for-sale', 'sold'].map((status) => ({
        status,
        count: items.filter((item) => item.status === status).length,
      })),
    [items],
  );

  const topBrands = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => {
      const key = item.brand || item.brandTags[0] || 'unknown';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [items]);

  const topEvents7d = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const map = new Map<string, number>();
    events.filter((event) => event.createdAt >= since).forEach((event) => {
      map.set(event.type, (map.get(event.type) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [events]);

  return (
    <Screen scroll={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Card>
            <View style={styles.inlineStatus}>
              <ActivityIndicator color={theme.colors.accentPrimary} />
              <Text style={styles.meta}>Loading snapshot…</Text>
            </View>
          </Card>
        ) : null}

        {!loading && errorMessage ? (
          <EmptyState title="Couldn’t Load Activity Snapshot" subtitle={errorMessage} />
        ) : null}

        {!loading && !errorMessage ? (
          <>
        <Card>
          <Text style={styles.title}>Activity Snapshot</Text>
          <Text style={styles.meta}>Local-only developer analytics (last 7 days for events).</Text>
        </Card>

        <Card>
          <Text style={styles.section}>Totals</Text>
          <Text style={styles.row}>Total Items: {items.length}</Text>
          <Text style={styles.row}>Drop Prep Opened: {topEvents7d.find(([name]) => name === 'drop_prep_opened')?.[1] ?? 0}</Text>
        </Card>

        <Card>
          <Text style={styles.section}>Items by Status</Text>
          {statusCounts.map((entry) => (
            <Text key={entry.status} style={styles.row}>{entry.status}: {entry.count}</Text>
          ))}
        </Card>

        <Card>
          <Text style={styles.section}>Top Brands</Text>
          {topBrands.length === 0 ? <Text style={styles.row}>None</Text> : null}
          {topBrands.map(([brand, count]) => (
            <Text key={brand} style={styles.row}>{brand}: {count}</Text>
          ))}
        </Card>

        <Card>
          <Text style={styles.section}>Top Event Types (7d)</Text>
          {topEvents7d.length === 0 ? <Text style={styles.row}>None</Text> : null}
          {topEvents7d.map(([type, count]) => (
            <Text key={type} style={styles.row}>{type}: {count}</Text>
          ))}
        </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    fontSize: 13,
    color: '#6b7280',
  },
  section: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  row: {
    fontSize: 14,
    color: '#374151',
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
