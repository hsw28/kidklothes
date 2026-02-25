import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { BetaKidLimitModal } from '@/components/BetaKidLimitModal';
import { ChipSelector } from '@/components/ChipSelector';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { useUndoToast } from '@/hooks/useUndoToast';
import { ClosetStackParamList } from '@/navigation/types';
import { DRAWER_SCAN_CATEGORY_DEFS } from '@/utils/categories';
import { pickPhotoFromLibrary, takePhotoWithCamera } from '@/utils/photoPicker';
import { openKidLimitFeedbackEmail } from '@/utils/betaKidLimitFeedback';

type Props = NativeStackScreenProps<ClosetStackParamList, 'DrawerScan'>;

const isKidLimitReachedError = (error: unknown) => (error as { code?: string })?.code === 'KID_LIMIT_REACHED' || (error instanceof Error && error.message === 'KID_LIMIT_REACHED');

export const DrawerScanScreen: React.FC<Props> = ({ navigation }) => {
  const { children, items, childItems, addChild, addItemsBatch, archiveItems, logEvent, canCreateAnotherKid } = useData();
  const { showToast } = useUndoToast();
  const [childId, setChildId] = useState(children[0]?.id ?? '');
  const [newChildName, setNewChildName] = useState('');
  const [size, setSize] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [photoByLabel, setPhotoByLabel] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [showKidLimitModal, setShowKidLimitModal] = useState(false);
  const [kidLimitCurrentCount, setKidLimitCurrentCount] = useState(children.length);

  const defaultSize = useMemo(() => {
    if (!childId) return '';
    const childOwned = childItems
      .filter((link) => link.childId === childId)
      .map((link) => items.find((item) => item.id === link.itemId))
      .filter(Boolean)
      .map((item) => item!)
      .filter((item) => item.status === 'owned');
    if (childOwned.length === 0) return '';

    const freq = new Map<string, number>();
    childOwned.forEach((item) => freq.set(item.size, (freq.get(item.size) ?? 0) + 1));
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }, [childId, childItems, items]);

  const total = useMemo(() => Object.values(counts).reduce((sum, count) => sum + count, 0), [counts]);

  const addNewChild = async () => {
    if (!newChildName.trim()) return;
    const canCreate = await canCreateAnotherKid();
    if (!canCreate.ok) {
      setKidLimitCurrentCount(canCreate.current);
      setShowKidLimitModal(true);
      return;
    }
    let created;
    try {
      created = await addChild({ name: newChildName.trim() });
    } catch (error) {
      if (isKidLimitReachedError(error)) {
        setKidLimitCurrentCount(canCreate.current);
        setShowKidLimitModal(true);
        return;
      }
      throw error;
    }
    if (!created) return;
    setChildId(created.id);
    setNewChildName('');
  };

  const bump = (label: string) => {
    setCounts((prev) => ({ ...prev, [label]: (prev[label] ?? 0) + 1 }));
  };

  const pickPhotoForCategory = async (label: string) => {
    Alert.alert('Add Category Photo', 'Choose a photo source', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Photos',
        onPress: () => {
          void (async () => {
            const asset = await pickPhotoFromLibrary();
            if (!asset?.uri) return;
            if (__DEV__) console.log('[DrawerScan] picked photo', { label, ...asset });
            setPhotoByLabel((prev) => ({ ...prev, [label]: asset.uri }));
          })();
        },
      },
      {
        text: 'Camera',
        onPress: () => {
          void (async () => {
            const asset = await takePhotoWithCamera();
            if (!asset?.uri) return;
            if (__DEV__) console.log('[DrawerScan] captured photo', { label, ...asset });
            setPhotoByLabel((prev) => ({ ...prev, [label]: asset.uri }));
          })();
        },
      },
    ]);
  };

  const save = async () => {
    if (!childId) {
      Alert.alert('Select child', 'Choose a child first.');
      return;
    }
    const activeSize = size.trim() || defaultSize;
    if (!activeSize) {
      Alert.alert('Add size', 'Choose a size for this scan.');
      return;
    }
    if (total === 0) {
      Alert.alert('Nothing to save', 'Tap categories to count items first.');
      return;
    }

    setSaving(true);
    try {
      const createdIds: string[] = [];
      for (const category of DRAWER_SCAN_CATEGORY_DEFS) {
        const quantity = counts[category.label] ?? 0;
        if (quantity <= 0) continue;
        const imageUri = photoByLabel[category.label];
        const createdItems = await addItemsBatch({
          quantity,
          childId,
          title: category.label,
          clothingType: category.clothingType,
          size: activeSize,
          status: 'owned',
          statusForChild: 'owned',
          notes: undefined,
          imageUrl: imageUri,
          imageUrls: imageUri ? [imageUri] : [],
          cachedImageUri: imageUri,
          tags: [],
          seasonTags: [],
        });
        createdIds.push(...createdItems.map((item) => item.id));
        await logEvent('item_created_via', {
          createdVia: 'drawer_scan',
          childId,
          size: activeSize,
          clothingType: category.clothingType,
          quantity,
        });
      }

      const summary = DRAWER_SCAN_CATEGORY_DEFS
        .map((category) => ({ label: category.label, count: counts[category.label] ?? 0 }))
        .filter((entry) => entry.count > 0);
      setCounts({});
      setPhotoByLabel({});
      if (createdIds.length > 0) {
        showToast({
          label: `Added ${createdIds.length} Item${createdIds.length === 1 ? '' : 's'} from Drawer Scan`,
          doUndo: async () => {
            await archiveItems(createdIds);
          },
        });
      }
      navigation.replace('DrawerScanResults', { childId, size: activeSize, counts: summary });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Drawer Scan (60 sec)</Text>
        <Text style={styles.meta}>Tap categories fast, then save in one shot.</Text>
      </Card>

      <Card>
        <ChipSelector
          label="Child"
          options={children.map((child) => child.name)}
          value={children.find((child) => child.id === childId)?.name}
          onChange={(name) => setChildId(children.find((entry) => entry.name === name)?.id ?? '')}
        />
        <FormInput label="Create child (optional)" value={newChildName} onChangeText={setNewChildName} placeholder="New child name" />
        <PrimaryButton label="Add Child" variant="secondary" onPress={() => void addNewChild()} />
        <FormInput label="Size" value={size} onChangeText={setSize} placeholder={defaultSize ? `e.g. ${defaultSize}` : 'e.g. 3T'} />
      </Card>

      <Card>
        <Text style={styles.section}>Tap to count</Text>
        <View style={styles.grid}>
          {DRAWER_SCAN_CATEGORY_DEFS.map((category) => {
            const count = counts[category.label] ?? 0;
            const hasPhoto = Boolean(photoByLabel[category.label]);
            return (
              <View key={category.label} style={styles.cell}>
                <Pressable style={styles.bigButton} onPress={() => bump(category.label)}>
                  <Text style={styles.bigButtonText}>{category.label}</Text>
                  <Text style={styles.bigButtonCount}>{count}</Text>
                </Pressable>
                <Pressable onPress={() => void pickPhotoForCategory(category.label)}>
                  <Text style={styles.photoAction}>{hasPhoto ? 'Photo added' : 'Add photo (optional)'}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text style={styles.section}>Running total: {total} items</Text>
        <PrimaryButton label={saving ? 'Saving...' : `Save ${total} items`} onPress={() => void save()} />
      </Card>
      <BetaKidLimitModal
        visible={showKidLimitModal}
        onClose={() => setShowKidLimitModal(false)}
        onSendFeedback={() => { void openKidLimitFeedbackEmail(kidLimitCurrentCount); }}
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
  meta: {
    fontSize: 14,
    color: '#4b5563',
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  grid: {
    gap: 8,
  },
  cell: {
    gap: 4,
  },
  bigButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bigButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  bigButtonCount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  photoAction: {
    fontSize: 12,
    color: '#1d4ed8',
  },
});
