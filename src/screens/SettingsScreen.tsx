import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, PanResponder, PanResponderInstance, Platform, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProComingSoonModal } from '@/components/ProComingSoonModal';
import { ProComingSoonTeaser } from '@/components/ProComingSoonTeaser';
import { Screen } from '@/components/Screen';
import { appConfig } from '@/config';
import { useData } from '@/db/DataContext';
import { repository } from '@/db/repository';
import { AppSettings, BackupPayload, Child } from '@/models';
import { SettingsStackParamList } from '@/navigation/types';
import { debugPrintPurchasesDiagnostics } from '@/services/purchases';
import {
  ClosetCategory,
  closetCategories,
  closetLabel,
  getConfiguredKidsPreviewCategories,
  KIDS_PREVIEW_CATEGORIES,
  reorderCategoryList,
  sanitizeCategoryOrder,
} from '@/utils/categories';
import { isAdvancedUnlocked } from '@/utils/featureUnlock';
import { getChildItems, getCoveredNudges, getDeclutterInsights, getSizeUpCounts, getWearingNowByCategory } from '@/utils/fitInsights';
import { INVENTORY_REALITY_THRESHOLDS, normalizeInventoryRealityThreshold } from '@/utils/inventoryReality';
import { cacheRemoteImage, findPersistedImageByFilename, isAppOwnedImageUri, persistLocalImage } from '@/utils/imageCache';
import { getItemLocalImageUri, getItemRemoteImageUri } from '@/utils/itemMedia';
import { openKidLimitFeedbackEmail } from '@/utils/betaKidLimitFeedback';
import * as FileSystem from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { PRIVACY_POLICY_URL } from '@/constants/legal';

const closetAddViewModes: AppSettings['closetAddDefaultView'][] = ['detailed', 'simple'];
const DEV_SAMPLE_MARKER = '[DEV_SAMPLE_GENERATED]';
const closetAddViewLabels: Record<AppSettings['closetAddDefaultView'], string> = {
  detailed: 'Detailed',
  simple: 'Simple',
};
const SOCIAL_LINKS = [
  {
    label: 'Instagram',
    url: 'https://www.instagram.com/layetteout',
    icon: 'IG',
  },
  {
    label: 'TikTok',
    url: 'https://www.tiktok.com/@layette.out',
    icon: '♪',
  },
];

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const {
    refresh,
    refreshPurchaseState,
    settings,
    updateSettings,
    children,
    childItems,
    items,
    storageLocations,
    addChild,
    addItem,
    archiveItems,
    createStorageLocation,
    deleteChild,
    deleteStorageLocation,
    exportBackup,
    importBackup,
  } = useData();
  const [versionTapCount, setVersionTapCount] = useState(0);
  const [repairingImages, setRepairingImages] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState({ total: 0, processed: 0, recovered: 0, failed: 0, noSource: 0 });
  const [showProModal, setShowProModal] = useState(false);
  const advancedUnlocked = isAdvancedUnlocked(settings, children, childItems, items);
  const showDeveloperTools = __DEV__ && Boolean(settings.developerModeEnabled);
  const appVersionLabel = Constants.expoConfig?.version ?? 'dev';

  const openExternalLink = async (url: string, label: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open link', `Please try again later: ${label}`);
    }
  };

  const updateKidsPreviewCategoryOrder = async (category: ClosetCategory, direction: 'up' | 'down') => {
    const current = sanitizeCategoryOrder(settings.kidsPreviewCategories, {
      includeOther: true,
      fallback: getConfiguredKidsPreviewCategories(settings),
    });
    await updateSettings({ kidsPreviewCategories: reorderCategoryList(current, category, direction) });
  };

  const toggleKidsPreviewCategory = async (category: ClosetCategory) => {
    const current = sanitizeCategoryOrder(settings.kidsPreviewCategories, {
      includeOther: true,
      fallback: getConfiguredKidsPreviewCategories(settings),
    });
    const next = current.includes(category)
      ? current.filter((entry) => entry !== category)
      : [...current, category];
    await updateSettings({
      kidsPreviewCategories: next.length > 0 ? next : [...KIDS_PREVIEW_CATEGORIES],
    });
  };

  const runReminderCheck = async () => {
    if (!settings.notificationsEnabled) {
      Alert.alert('Notifications are off', 'Enable notifications to use reminder checks.');
      return;
    }

    const unsortedCount = items.filter((item) => !item.size.trim() || !item.sizeNormalized || !item.category).length;
    const outgrowCount = items.filter((item) => item.fitRating === 'small').length;

    const messages: string[] = [];
    if (settings.notifyWeeklyTidy && unsortedCount > 0) {
      messages.push(`You saved ${unsortedCount} unsorted items. Want to tidy them?`);
    }
    if (settings.notifyOutgrow && outgrowCount > 0) {
      messages.push(`${outgrowCount} items are marked small. Review closet sizing?`);
    }

    if (messages.length === 0) {
      const covered = getCoveredNudges(items);
      if (covered.length > 0) {
        Alert.alert('You are covered', covered.join('\n'));
      } else {
        Alert.alert('No reminder right now', 'No active reminder conditions were found.');
      }
    } else {
      const covered = getCoveredNudges(items);
      Alert.alert('Reminder preview', [messages.join('\n\n'), covered.length ? `\n${covered.join('\n')}` : ''].join('\n'));
    }

    await updateSettings({ lastPromptedAt: Date.now() });
  };

  const exportJsonBackup = async () => {
    try {
      const payload = await exportBackup();
      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) {
        Alert.alert('Export failed', 'No writable directory found.');
        return;
      }

      const uri = `${baseDir}layette-out-backup-${Date.now()}.json`;
      await LegacyFileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Backup saved', `Backup saved locally at:\n${uri}`);
        return;
      }

      await Sharing.shareAsync(uri, {
        dialogTitle: 'Export Layette Out Backup',
        mimeType: 'application/json',
      });
    } catch {
      Alert.alert('Export failed', 'Could not export backup JSON.');
    }
  };

  const importJsonBackup = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (picked.canceled) return;

      const file = picked.assets[0];
      const raw = await LegacyFileSystem.readAsStringAsync(file.uri);
      const parsed = JSON.parse(raw) as BackupPayload;
      await importBackup(parsed);
      Alert.alert('Import complete', 'Backup was imported successfully.');
    } catch {
      Alert.alert('Import failed', 'Could not import backup JSON.');
    }
  };

  const runPurgeReview = () => {
    const insights = getDeclutterInsights(items);
    Alert.alert(
      'Purge Review',
      [
        `Items never worn: ${insights.neverWornCount}`,
        `Duplicates across adjacent sizes: ${insights.duplicateAdjacentCount}`,
        `Skipped during wear tracking: ${insights.skippedWearCount}`,
        `Outgrown but still stored: ${insights.outgrownStoredCount}`,
      ].join('\n'),
    );
  };

  const runSizeUpCoverage = () => {
    if (children.length === 0) {
      Alert.alert('No kids yet', 'Add a kid first.');
      return;
    }

    const lines = children.map((child) => {
      const childData = getChildItems(child, items, childItems);
      const owned = childData.items.filter((item) => item.status === 'owned');
      const wearingNow = getWearingNowByCategory(owned);
      const sizeUps = getSizeUpCounts(owned, wearingNow);
      const summary = Array.from(sizeUps.entries())
        .map(([cat, count]) => `${cat}:${count}`)
        .join(', ');
      return `${child.name}: ${summary || 'no size-up inventory yet'}`;
    });
    Alert.alert('Size-Up Dashboard', lines.join('\n'));
  };

  const generateSampleCloset = async () => {
    const brands = ['Kate Quinn', 'Little Sleepies', 'Kyte Baby'] as const;
    let child: Child | undefined = children[0];
    if (!child) {
      child = await addChild({ name: 'Sample Kid', notes: DEV_SAMPLE_MARKER, currentSizeCode: '2T', nextSizeCode: '3T' });
    }
    if (!child) return;

    const childLocations = storageLocations.filter((location) => location.childId === child!.id && !location.deletedAt);
    let currentCloset = childLocations.find((location) => location.name === 'Current Closet');
    let sizeUpBin = childLocations.find((location) => location.name === 'Size-Up Bin');
    let sellBin = childLocations.find((location) => location.name === 'Sell Bin');
    let outGrew = childLocations.find((location) => location.name === 'Out Grew');

    if (!currentCloset) currentCloset = await createStorageLocation({ childId: child.id, name: 'Current Closet', type: 'closet', notes: DEV_SAMPLE_MARKER });
    if (!sizeUpBin) sizeUpBin = await createStorageLocation({ childId: child.id, name: 'Size-Up Bin', type: 'size_up', notes: DEV_SAMPLE_MARKER });
    if (!sellBin) sellBin = await createStorageLocation({ childId: child.id, name: 'Sell Bin', type: 'sell', notes: DEV_SAMPLE_MARKER });
    if (!outGrew) outGrew = await createStorageLocation({ childId: child.id, name: 'Out Grew', type: 'out_grew', notes: DEV_SAMPLE_MARKER });

    const templates = [
      { title: 'Blueberries PJs', clothingType: 'sleeper', size: '2T', brand: brands[0], printName: 'Blueberries', status: 'owned' as const },
      { title: 'Blueberries PJs', clothingType: 'sleeper', size: '3T', brand: brands[0], printName: 'Blueberries', status: 'owned' as const },
      { title: 'Stars Set', clothingType: 'top', size: '2T', brand: brands[1], printName: 'Stars', status: 'owned' as const },
      { title: 'Stars Set', clothingType: 'top', size: '3T', brand: brands[1], printName: 'Stars', status: 'owned' as const },
      { title: 'Zip Sleeper', clothingType: 'sleeper', size: '2T', brand: brands[1], status: 'owned' as const },
      { title: 'Bamboo Romper', clothingType: 'romper', size: '2T', brand: brands[2], status: 'wishlist' as const },
      { title: 'Ruffle Dress', clothingType: 'dress', size: '3T', brand: brands[0], status: 'wishlist' as const },
      { title: 'Joggers', clothingType: 'bottom', size: '2T', brand: brands[2], status: 'owned' as const },
      { title: 'Leggings', clothingType: 'bottom', size: '3T', brand: brands[0], status: 'owned' as const },
      { title: 'Crew Top', clothingType: 'top', size: '3T', brand: brands[1], status: 'owned' as const },
      { title: 'Puffer Jacket', clothingType: 'outerwear', size: '3T', brand: brands[2], status: 'owned' as const },
      { title: 'Boots', clothingType: 'shoes', size: '8', brand: brands[2], status: 'owned' as const },
    ];

    const createdIds: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      const tpl = templates[i % templates.length];
      const status = i < 3 ? 'for-sale' : tpl.status;
      const locationId = i < 2 ? sizeUpBin?.id : i < 4 ? outGrew?.id : i < 7 && status === 'for-sale' ? sellBin?.id : currentCloset?.id;
      const created = await addItem({
        childId: child.id,
        title: tpl.title,
        clothingType: tpl.clothingType as any,
        size: tpl.size,
        status,
        statusForChild: status,
        brand: tpl.brand,
        brandTags: [tpl.brand],
        printName: tpl.printName,
        notes: DEV_SAMPLE_MARKER,
        tags: i % 2 === 0 ? ['warm'] : ['transitional'],
        seasonTags: i % 2 === 0 ? ['Warm'] : ['Transitional'],
        storageLocationId: locationId,
        targetResalePrice: status === 'for-sale' ? 18 + i : undefined,
        purchasePrice: 24 + i,
      });
      if (created?.id) createdIds.push(created.id);
    }
    Alert.alert('Sample Closet Generated', `Created ${createdIds.length} items for ${child.name}.`);
  };

  const resetSampleData = async () => {
    const sampleItemIds = items.filter((item) => (item.notes ?? '').includes(DEV_SAMPLE_MARKER)).map((item) => item.id);
    const sampleLocationIds = storageLocations.filter((location) => (location.notes ?? '').includes(DEV_SAMPLE_MARKER)).map((location) => location.id);
    const sampleChildren = children.filter((child) => (child.notes ?? '').includes(DEV_SAMPLE_MARKER));
    if (sampleItemIds.length === 0 && sampleLocationIds.length === 0 && sampleChildren.length === 0) {
      Alert.alert('Nothing to Reset', 'No generated sample data was found.');
      return;
    }
    if (sampleItemIds.length > 0) await archiveItems(sampleItemIds);
    for (const locationId of sampleLocationIds) await deleteStorageLocation(locationId);
    for (const child of sampleChildren) {
      const childLinks = childItems.filter((link) => link.childId === child.id && !sampleItemIds.includes(link.itemId));
      if (childLinks.length === 0) {
        await deleteChild(child.id);
      }
    }
    Alert.alert('Sample Data Reset', `Archived ${sampleItemIds.length} items and removed ${sampleLocationIds.length} locations.`);
  };

  const runDevQaChecklist = () => {
    const wishlistWithImages = items.filter((item) => item.status === 'wishlist' && Boolean(item.cachedImageUri || item.imageUrls[0] || item.imageUrl));
    const ownedWithImages = items.filter((item) => item.status === 'owned' && Boolean(item.cachedImageUri || item.imageUrls[0] || item.imageUrl));
    const formCategoryOptions = closetCategories.filter((category) => category !== 'other');
    const hasSets = formCategoryOptions.includes('sets');
    const categoryLabels = formCategoryOptions.map((category) => closetLabel[category]);

    if (__DEV__) {
      console.log('=== Layette Out DEV QA Checklist ===');
      console.log(`[Check] Closet Add Item category source includes "Sets": ${hasSets ? 'PASS' : 'FAIL'}`);
      console.log('[Info] Shared category labels used by Closet + Item Form:', categoryLabels.join(', '));
      console.log(`[Info] Wishlist items with saved imageUrl/imageUrls: ${wishlistWithImages.length}`);
      console.log(`[Info] Closet-owned items with saved imageUrl/imageUrls: ${ownedWithImages.length}`);
      console.log('[Manual] Add URL to Wishlist -> confirm image renders on wishlist list card.');
      console.log('[Manual] Add URL to Closet -> confirm image renders on closet/item list surfaces.');
      console.log('[Manual] Open Add Item -> Category includes "Sets" and matches Closet categories.');
      if (Platform.OS === 'ios') {
        console.log('[Manual] Kid Form -> Add Kid Photo -> confirm Photos picker opens (not Files).');
        console.log('[Manual] Item Form -> Replace Image -> confirm Photos picker opens (not Files).');
      } else {
        console.log('[Manual] Photo picker check is iOS-specific; verify on iOS simulator/device.');
      }
      console.log('=== End DEV QA Checklist ===');
    }

    Alert.alert(
      'DEV QA Checklist',
      [
        `${hasSets ? 'PASS' : 'FAIL'}: Category options include Sets`,
        `Wishlist items with images: ${wishlistWithImages.length}`,
        `Closet-owned items with images: ${ownedWithImages.length}`,
        'See Metro/Xcode console for manual verification checklist.',
      ].join('\n'),
    );
  };
  const repairMissingImages = async () => {
    if (repairingImages) return;
    setRepairingImages(true);
    setRestoreProgress({ total: items.length, processed: 0, recovered: 0, failed: 0, noSource: 0 });
    try {
      let repaired = 0;
      let failed = 0;
      let scanned = 0;
      let noSource = 0;
      let canReadPhotoLibrary = true;
      try {
        const currentPerm = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (!currentPerm.granted) {
          const askedPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          canReadPhotoLibrary = askedPerm.granted;
        }
      } catch {
        // If permission check fails, continue and rely on file operations/fallback remote URLs.
      }

      for (const item of items) {
        scanned += 1;
        const cached = (item.cachedImageUri ?? '').trim();
        if (cached && isAppOwnedImageUri(cached)) {
          try {
            const cachedInfo = await LegacyFileSystem.getInfoAsync(cached);
            if (!cachedInfo.exists) {
              const rebound = await findPersistedImageByFilename(cached);
              if (rebound) {
                await repository.updateItemCachedImage(item.id, rebound);
                repaired += 1;
                setRestoreProgress({ total: items.length, processed: scanned, recovered: repaired, failed, noSource });
                continue;
              }
            }
          } catch {
            // continue with normal recovery paths
          }
        }
        const remoteCandidates = Array.from(
          new Set(
            [getItemRemoteImageUri(item), ...(item.imageUrls ?? []), item.imageUrl]
              .map((value) => (value ?? '').trim())
              .filter((value) => /^https?:\/\//i.test(value)),
          ),
        );
        const localCandidates = Array.from(
          new Set(
            [cached, getItemLocalImageUri(item), ...(item.imageUrls ?? []), item.imageUrl]
              .map((value) => (value ?? '').trim())
              .filter((value) => /^(file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/i.test(value)),
          ),
        );
        const hasAnySource = localCandidates.length > 0 || remoteCandidates.length > 0;
        if (!hasAnySource) {
          noSource += 1;
          setRestoreProgress({ total: items.length, processed: scanned, recovered: repaired, failed, noSource });
          continue;
        }

        let restored = false;
        if (localCandidates.length > 0) {
          for (const candidate of localCandidates) {
            const needsPhotoLibraryAccess = /^(ph:\/\/|assets-library:\/\/)/i.test(candidate);
            if (needsPhotoLibraryAccess && !canReadPhotoLibrary) {
              continue;
            }
            try {
              const persisted = await persistLocalImage(candidate);
              if (persisted && isAppOwnedImageUri(persisted)) {
                if (/^file:\/\//i.test(persisted)) {
                  try {
                    const info = await LegacyFileSystem.getInfoAsync(persisted);
                    if (!info.exists) {
                      const rebound = await findPersistedImageByFilename(persisted);
                      if (!rebound) continue;
                      await repository.updateItemCachedImage(item.id, rebound);
                      repaired += 1;
                      restored = true;
                      break;
                    }
                  } catch {
                    continue;
                  }
                }
                await repository.updateItemCachedImage(item.id, persisted);
                repaired += 1;
                restored = true;
                break;
              }
            } catch {
              // try next local candidate
            }
          }
        }

        if (restored) {
          setRestoreProgress({ total: items.length, processed: scanned, recovered: repaired, failed, noSource });
          continue;
        }

        if (remoteCandidates.length === 0) {
          failed += 1;
          setRestoreProgress({ total: items.length, processed: scanned, recovered: repaired, failed, noSource });
          continue;
        }
        let restoredFromRemote = false;
        for (const remote of remoteCandidates) {
          try {
            const cached = await cacheRemoteImage(item.id, remote);
            if (!cached) continue;
            await repository.updateItemCachedImage(item.id, cached);
            repaired += 1;
            restoredFromRemote = true;
            break;
          } catch {
            // try next remote candidate
          }
        }
        if (!restoredFromRemote) {
          failed += 1;
        }
        setRestoreProgress({ total: items.length, processed: scanned, recovered: repaired, failed, noSource });
      }

      await refresh();
      if (repaired === 0 && failed === 0) {
        Alert.alert('Restore complete', `Scanned ${scanned} items.\nNo recoverable image sources were found.`);
        return;
      }
      Alert.alert('Restore complete', `Recovered: ${repaired}\nCould not recover: ${failed}\nNo source found: ${noSource}`);
    } finally {
      setRepairingImages(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Settings</Text>
        <Text style={{ color: '#4b5563' }}>
          Data stays local. Configure optional reminder nudges and backup/export.
        </Text>
      </Card>
      <ProComingSoonTeaser variant="card" onPress={() => setShowProModal(true)} />
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Follow for Updates</Text>
        <Text style={{ color: '#6b7280' }}>
          Follow Layette Out on Instagram or TikTok for feature updates, then send feedback if there is something you want prioritized.
        </Text>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          {SOCIAL_LINKS.map((link) => (
            <Pressable
              key={link.label}
              onPress={() => void openExternalLink(link.url, link.label)}
              accessibilityRole="button"
              accessibilityLabel={link.label}
              style={{
                flex: 1,
                minHeight: 52,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                backgroundColor: '#FFFFFF',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingHorizontal: 14,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  backgroundColor: '#F3F4F6',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#111827', fontSize: 11, fontWeight: '800' }}>{link.icon}</Text>
              </View>
              <Text style={{ color: '#111827', fontWeight: '700' }}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ marginTop: 12 }}>
          <PrimaryButton
            label="Send Feedback"
            variant="secondary"
            onPress={() => {
              void openKidLimitFeedbackEmail(children.length);
            }}
          />
        </View>
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Photos</Text>
        <Text style={{ color: '#6b7280', fontSize: 12 }}>
          We’re sorry if you lost any photos. This photo storage issue has been fixed for new saves and updates. Use Restore Missing Images to recover older photos when a source still exists (saved local file or live product URL). If the original local file was already removed and no URL is available, that photo cannot be restored.
        </Text>
        <PrimaryButton label={repairingImages ? 'Restoring Images...' : 'Restore Missing Images'} variant="secondary" onPress={repairMissingImages} />
        <PrimaryButton label="Review Missing Photos" variant="secondary" onPress={() => navigation.navigate('MissingPhotoRepair')} />
        {repairingImages ? (
          <View style={{ marginTop: 8, gap: 6 }}>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>
              Restoring {restoreProgress.processed} / {Math.max(restoreProgress.total, 1)} items
            </Text>
            <View style={{ height: 8, borderRadius: 999, backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
              <View
                style={{
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, (restoreProgress.processed / Math.max(restoreProgress.total, 1)) * 100))}%`,
                  backgroundColor: '#111827',
                }}
              />
            </View>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>
              Recovered: {restoreProgress.recovered} • Failed: {restoreProgress.failed} • No source: {restoreProgress.noSource}
            </Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <ChipSelector
          label="Closet Add Default View"
          options={closetAddViewModes.map((mode) => closetAddViewLabels[mode])}
          value={closetAddViewLabels[settings.closetAddDefaultView]}
          onChange={(value) => {
            const mode = closetAddViewModes.find((entry) => closetAddViewLabels[entry] === value) ?? settings.closetAddDefaultView;
            updateSettings({ closetAddDefaultView: mode });
          }}
        />
        <ChipSelector
          label="Show Guided Start on Launch"
          options={['Off', 'On']}
          value={settings.guidedOnboarding ? 'On' : 'Off'}
          onChange={(value) => updateSettings({ guidedOnboarding: value === 'On' })}
        />
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Category Layout</Text>
        <Text style={{ color: '#6b7280' }}>
          Configure which categories appear on Kids cards. Closet and Wishlist category layout can be edited directly from those screens (long-press a category, then use the reorder controls).
        </Text>
        <KidsPreviewPrefsEditor
          ordered={sanitizeCategoryOrder(settings.kidsPreviewCategories, { includeOther: true, fallback: getConfiguredKidsPreviewCategories(settings) })}
          visible={new Set(getConfiguredKidsPreviewCategories(settings))}
          onMove={updateKidsPreviewCategoryOrder}
          onToggleVisible={toggleKidsPreviewCategory}
        />
      </Card>

      <Card>
        <ChipSelector
          label="Notifications"
          options={['Off', 'On']}
          value={settings.notificationsEnabled ? 'On' : 'Off'}
          onChange={(value) => updateSettings({ notificationsEnabled: value === 'On' })}
        />
        <ChipSelector
          label="Weekly Tidy Reminder"
          options={['Off', 'On']}
          value={settings.notifyWeeklyTidy ? 'On' : 'Off'}
          onChange={(value) => updateSettings({ notifyWeeklyTidy: value === 'On' })}
        />
        <ChipSelector
          label="Outgrow Reminder"
          options={['Off', 'On']}
          value={settings.notifyOutgrow ? 'On' : 'Off'}
          onChange={(value) => updateSettings({ notifyOutgrow: value === 'On' })}
        />
        <ChipSelector
          label="Advanced Features"
          options={['Locked', 'Unlocked']}
          value={settings.advancedFeaturesUnlocked ? 'Unlocked' : 'Locked'}
          onChange={(value) => updateSettings({ advancedFeaturesUnlocked: value === 'Unlocked' })}
        />
        <ChipSelector
          label="Inventory Reality Check Threshold"
          options={INVENTORY_REALITY_THRESHOLDS.map(String)}
          value={String(normalizeInventoryRealityThreshold(settings.inventoryRealityCheckOwnedThreshold))}
          onChange={(value) => updateSettings({ inventoryRealityCheckOwnedThreshold: normalizeInventoryRealityThreshold(Number(value)) })}
        />
      </Card>

      <PrimaryButton label="Run Reminder Check" variant="secondary" onPress={runReminderCheck} />
      {advancedUnlocked ? <PrimaryButton label="Purge Review" variant="secondary" onPress={runPurgeReview} /> : null}
      {advancedUnlocked ? <PrimaryButton label="Size-Up Dashboard" variant="secondary" onPress={runSizeUpCoverage} /> : null}
      <PrimaryButton label="Export JSON Backup" variant="secondary" onPress={exportJsonBackup} />
      <PrimaryButton label="Import JSON Backup" variant="secondary" onPress={importJsonBackup} />
      {!advancedUnlocked ? (
        <Text style={{ color: '#6b7280' }}>Advanced features are locked. Auto-unlock at 20 total items or 12 items for one child, or unlock manually above.</Text>
      ) : null}
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Privacy & Legal</Text>
        <View style={{ marginTop: 8 }}>
          <Pressable
            onPress={() => navigation.navigate('PrivacySummary')}
            style={{ paddingVertical: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Privacy Summary"
          >
            <Text style={{ color: '#111827', fontWeight: '600' }}>Privacy Summary</Text>
            <Text style={{ color: '#6b7280' }}>How Layette Out stores and uses your data.</Text>
          </Pressable>
          <Pressable
            onPress={() => void openExternalLink(PRIVACY_POLICY_URL, 'Privacy Policy')}
            style={{ paddingVertical: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Privacy Policy"
          >
            <Text style={{ color: '#111827', fontWeight: '600' }}>Privacy Policy</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('TermsSummary')}
            style={{ paddingVertical: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Terms Summary"
          >
            <Text style={{ color: '#111827', fontWeight: '600' }}>Terms Summary</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('TermsOfService')}
            style={{ paddingVertical: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Terms of Service"
          >
            <Text style={{ color: '#111827', fontWeight: '600' }}>Terms of Service</Text>
          </Pressable>
        </View>
      </Card>
      {showDeveloperTools ? (
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Developer</Text>
          <Text style={{ color: '#6b7280' }}>Local tools for QA, sample data, and debugging.</Text>
          <ChipSelector
            label="Developer Mode"
            options={['Off', 'On']}
            value={settings.developerModeEnabled ? 'On' : 'Off'}
            onChange={(value) => updateSettings({ developerModeEnabled: value === 'On' })}
          />
          <PrimaryButton label="Open Activity Log (Dev)" variant="secondary" onPress={() => navigation.navigate('ActivityLog')} />
          <PrimaryButton label="Activity Snapshot (Dev)" variant="secondary" onPress={() => navigation.navigate('ActivitySnapshot')} />
          <PrimaryButton label="Run QA Checklist (Dev)" variant="secondary" onPress={runDevQaChecklist} />
          <PrimaryButton label="Generate Sample Closet" variant="secondary" onPress={() => void generateSampleCloset()} />
          <PrimaryButton label="Reset Sample Data" variant="secondary" onPress={() => void resetSampleData()} />
          {appConfig.monetizationEnabled ? (
            <>
              <PrimaryButton
                label="Refresh Purchase State (Dev)"
                variant="secondary"
                onPress={async () => {
                  const snapshot = await refreshPurchaseState();
                  Alert.alert('Purchase state refreshed', snapshot ? `Entitled: ${snapshot.isEntitled ? 'yes' : 'no'}` : 'No snapshot available.');
                }}
              />
              <PrimaryButton
                label="Print Purchase Debug (Dev)"
                variant="secondary"
                onPress={async () => {
                  await debugPrintPurchasesDiagnostics();
                  Alert.alert('Printed', 'Offerings + customer info logged to console.');
                }}
              />
            </>
          ) : null}
        </Card>
      ) : null}
      <PrimaryButton
        label="Reset Guided Start"
        variant="secondary"
        onPress={async () => {
          await updateSettings({ guidedOnboardingCompleted: false, guidedOnboarding: true });
          Alert.alert('Reset', 'Guided start will show again on next Closet launch.');
        }}
      />
      <PrimaryButton
        label="Reload Local Data"
        variant="secondary"
        onPress={async () => {
          await refresh();
          Alert.alert('Done', 'Local data refreshed.');
        }}
      />
      <Pressable
        onPress={async () => {
          if (!__DEV__) return;
          const next = versionTapCount + 1;
          if (!settings.developerModeEnabled && next >= 7) {
            setVersionTapCount(0);
            await updateSettings({ developerModeEnabled: true });
            Alert.alert('Developer Mode Enabled', 'Developer tools are now visible in Settings.');
            return;
          }
          setVersionTapCount(next);
        }}
        style={{ paddingVertical: 6, alignItems: 'center' }}
        accessibilityRole="button"
        accessibilityLabel="App version"
      >
        <Text style={{ color: '#9ca3af', fontSize: 12 }}>
          Version {appVersionLabel}{__DEV__ && settings.developerModeEnabled ? ' • Developer Mode' : ''}
        </Text>
      </Pressable>
      <ProComingSoonModal
        visible={showProModal}
        onClose={() => setShowProModal(false)}
        onFeedback={() => { void openKidLimitFeedbackEmail(children.length); }}
      />
    </Screen>
  );
};

type DraggableCategoryPrefsEditorProps = {
  title: string;
  ordered: ClosetCategory[];
  hidden: Set<ClosetCategory>;
  onReorder: (next: ClosetCategory[]) => Promise<void>;
  onToggleHidden: (category: ClosetCategory) => Promise<void>;
};

const DRAG_ROW_SLOT = 48;

const moveInList = (list: ClosetCategory[], from: number, to: number): ClosetCategory[] => {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

const DraggableCategoryPrefsEditor: React.FC<DraggableCategoryPrefsEditorProps> = ({ title, ordered, hidden, onReorder, onToggleHidden }) => {
  const [localOrder, setLocalOrder] = useState<ClosetCategory[]>(ordered);
  const [draggingCategory, setDraggingCategory] = useState<ClosetCategory | null>(null);
  const localOrderRef = useRef<ClosetCategory[]>(ordered);
  const dragStateRef = useRef<{ category: ClosetCategory; startIndex: number } | null>(null);
  const panRespondersRef = useRef<Record<string, PanResponderInstance>>({});

  useEffect(() => {
    setLocalOrder(ordered);
    localOrderRef.current = ordered;
  }, [ordered]);

  const getResponder = (category: ClosetCategory) => {
    if (panRespondersRef.current[category]) return panRespondersRef.current[category];
    panRespondersRef.current[category] = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 3,
      onPanResponderGrant: () => {
        const currentIndex = localOrderRef.current.indexOf(category);
        dragStateRef.current = { category, startIndex: currentIndex };
        setDraggingCategory(category);
      },
      onPanResponderMove: (_, gestureState) => {
        const state = dragStateRef.current;
        if (!state || state.category !== category) return;
        const current = localOrderRef.current;
        const currentIndex = current.indexOf(category);
        if (currentIndex < 0) return;
        const targetIndex = Math.max(0, Math.min(current.length - 1, state.startIndex + Math.round(gestureState.dy / DRAG_ROW_SLOT)));
        if (targetIndex === currentIndex) return;
        const next = moveInList(current, currentIndex, targetIndex);
        localOrderRef.current = next;
        setLocalOrder(next);
      },
      onPanResponderRelease: () => {
        const next = [...localOrderRef.current];
        dragStateRef.current = null;
        setDraggingCategory(null);
        void onReorder(next);
      },
      onPanResponderTerminate: () => {
        const next = [...localOrderRef.current];
        dragStateRef.current = null;
        setDraggingCategory(null);
        void onReorder(next);
      },
    });
    return panRespondersRef.current[category];
  };

  return (
    <View style={{ marginTop: 12, gap: 6 }}>
      <Text style={{ fontWeight: '700', color: '#1f2937' }}>{title}</Text>
      <Text style={{ color: '#6b7280' }}>Drag the handle to reorder.</Text>
      {localOrder.map((category) => {
        const isHidden = hidden.has(category);
        const isDragging = draggingCategory === category;
        return (
          <View
            key={`${title}-${category}`}
            style={{
              minHeight: DRAG_ROW_SLOT,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              paddingVertical: 6,
              opacity: isDragging ? 0.8 : 1,
              backgroundColor: isDragging ? '#F7F2ED' : 'transparent',
              borderRadius: 12,
            }}
          >
            <Text style={{ flex: 1, color: isHidden ? '#9ca3af' : '#111827' }}>
              {closetLabel[category]}{isHidden ? ' (hidden)' : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Pressable onPress={() => void onToggleHidden(category)}>
                <Text style={{ color: '#6b7280', fontWeight: '700' }}>{isHidden ? 'Show' : 'Hide'}</Text>
              </Pressable>
              <View
                {...getResponder(category).panHandlers}
                style={{
                  minWidth: 28,
                  minHeight: 28,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#F3EEE8',
                }}
              >
                <Text style={{ color: '#6b7280', fontWeight: '700' }}>≡</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};

type KidsPreviewPrefsEditorProps = {
  ordered: ClosetCategory[];
  visible: Set<ClosetCategory>;
  onMove: (category: ClosetCategory, direction: 'up' | 'down') => Promise<void>;
  onToggleVisible: (category: ClosetCategory) => Promise<void>;
};

const KidsPreviewPrefsEditor: React.FC<KidsPreviewPrefsEditorProps> = ({ ordered, visible, onMove, onToggleVisible }) => (
  <View style={{ marginTop: 12, gap: 6 }}>
    <Text style={{ fontWeight: '700', color: '#1f2937' }}>Kids Card Categories</Text>
    <Text style={{ color: '#6b7280' }}>Choose which categories appear on Kids cards and reorder them. All categories are shown by default.</Text>
    {closetCategories.map((category) => {
      const enabled = visible.has(category);
      const index = ordered.indexOf(category);
      return (
        <View
          key={`kids-${category}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            paddingVertical: 6,
          }}
        >
          <Text style={{ flex: 1, color: enabled ? '#111827' : '#9ca3af' }}>
            {closetLabel[category]}{enabled ? '' : ' (hidden)'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable disabled={!enabled || index <= 0} onPress={() => void onMove(category, 'up')}>
              <Text style={{ color: !enabled || index <= 0 ? '#d1d5db' : '#6b7280', fontWeight: '700' }}>↑</Text>
            </Pressable>
            <Pressable disabled={!enabled || index < 0 || index >= ordered.length - 1} onPress={() => void onMove(category, 'down')}>
              <Text style={{ color: !enabled || index < 0 || index >= ordered.length - 1 ? '#d1d5db' : '#6b7280', fontWeight: '700' }}>↓</Text>
            </Pressable>
            <Pressable onPress={() => void onToggleVisible(category)}>
              <Text style={{ color: '#6b7280', fontWeight: '700' }}>{enabled ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
        </View>
      );
    })}
  </View>
);
