import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { getChildItems, sizeToNumber } from '@/utils/fitInsights';

type Props = NativeStackScreenProps<ClosetStackParamList, 'GuidedSnapshot'>;

export const GuidedSnapshotScreen: React.FC<Props> = ({ route, navigation }) => {
  const { children, items, childItems, updateSettings } = useData();
  const { childId, currentSize, clothingType } = route.params;

  const child = children.find((entry) => entry.id === childId);
  const summary = useMemo(() => {
    if (!child) {
      return {
        currentCount: 0,
        sizeUpCount: 0,
        total: 0,
        byTypeCurrent: new Map<string, number>(),
        byTypeSizeUp: new Map<string, number>(),
      };
    }

    const childData = getChildItems(child, items, childItems);
    const targetCategory = clothingType === 'top' ? 'top' : clothingType === 'bottom' ? 'bottom' : clothingType;
    const owned = childData.items.filter((item) => item.status === 'owned');
    const relevant = owned.filter((item) => item.clothingType === targetCategory);

    const currentCount = relevant.filter((item) => item.size.toUpperCase().trim() === currentSize.toUpperCase().trim()).length;
    const currentNum = sizeToNumber(currentSize);
    const sizeUpCount = relevant.filter((item) => {
      const n = sizeToNumber(item.size);
      return n !== undefined && currentNum !== undefined && n > currentNum;
    }).length;

    const byTypeCurrent = new Map<string, number>();
    const byTypeSizeUp = new Map<string, number>();
    ['bottom', 'top', 'sleeper', 'outerwear', 'shoes'].forEach((type) => {
      const typeItems = owned.filter((item) => item.clothingType === type);
      const current = typeItems.filter((item) => item.size.toUpperCase().trim() === currentSize.toUpperCase().trim()).length;
      const sizeUps = typeItems.filter((item) => {
        const n = sizeToNumber(item.size);
        return n !== undefined && currentNum !== undefined && n > currentNum;
      }).length;
      byTypeCurrent.set(type, current);
      byTypeSizeUp.set(type, sizeUps);
    });

    return {
      currentCount,
      sizeUpCount,
      total: childData.items.length,
      byTypeCurrent,
      byTypeSizeUp,
    };
  }, [child, items, childItems, clothingType, currentSize]);

  const completeness = Math.min(summary.total / 10, 1);
  const confidence = Math.min(summary.total / 12, 1);
  const shouldShowCovered = confidence >= 0.7 && summary.sizeUpCount >= 3;

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Instant snapshot</Text>
        <Text style={styles.meta}>You currently have:</Text>
        <Text style={styles.meta}>- {summary.currentCount} {clothingType} in {currentSize}</Text>
        <Text style={styles.meta}>- {summary.sizeUpCount} {clothingType} in size-ups</Text>
      </Card>

      {summary.total >= 5 ? (
        <Card>
          <Text style={styles.section}>What we can already see</Text>
          <Text style={styles.meta}>Pants now: {summary.byTypeCurrent.get('bottom') ?? 0}</Text>
          <Text style={styles.meta}>Tops now: {summary.byTypeCurrent.get('top') ?? 0}</Text>
          <Text style={styles.meta}>Size-ups tracked: {(summary.byTypeSizeUp.get('bottom') ?? 0) + (summary.byTypeSizeUp.get('top') ?? 0)}</Text>
        </Card>
      ) : null}

      {shouldShowCovered ? (
        <Card>
          <Text style={styles.covered}>You're covered for this category right now.</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.section}>Snapshot completeness</Text>
        <View style={styles.meterBg}>
          <View style={[styles.meterFill, { width: `${Math.round(completeness * 100)}%` }]} />
        </View>
        <Text style={styles.meta}>{Math.round(completeness * 100)}% complete</Text>
        <Text style={styles.meta}>Snapshots improve as you add more.</Text>
      </Card>

      <PrimaryButton label="Add more items" onPress={() => navigation.navigate('AddItem', { quick: true, prefillType: clothingType, shoppingMode: true })} />
      <PrimaryButton
        label="Done"
        variant="secondary"
        onPress={async () => {
          await updateSettings({ guidedOnboarding: false });
          navigation.replace('ClosetHome');
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    color: '#4b5563',
    fontSize: 15,
  },
  covered: {
    color: '#047857',
    fontSize: 16,
    fontWeight: '700',
  },
  meterBg: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
  },
  meterFill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
});
