import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RemoteImage } from '@/components/RemoteImage';
import { useData } from '@/db/DataContext';
import { getItemDisplayImageUri, getItemDisplayFallbackUri, getItemLocalImageUri, getItemRemoteImageUri } from '@/utils/itemMedia';
import { isAppOwnedImageUri, persistLocalImage } from '@/utils/imageCache';
import { pickPhotoFromLibrary } from '@/utils/photoPicker';
import * as LegacyFileSystem from 'expo-file-system/legacy';

const isLocalLike = (value: string) => /^(file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/i.test(value);

export const MissingPhotoRepairScreen: React.FC = () => {
  const { items, updateItem, updateItemCachedImage } = useData();
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadCandidates = async () => {
      setLoading(true);
      try {
        const next: string[] = [];
        for (const item of items) {
          const cached = (item.cachedImageUri ?? '').trim();
          const display = getItemDisplayImageUri(item);
          const remote = getItemRemoteImageUri(item);
          const local = getItemLocalImageUri(item);
          const localSources = [cached, ...(item.imageUrls ?? []), item.imageUrl ?? ''].map((value) => value.trim()).filter((value) => isLocalLike(value));
          const hasLocalSource = localSources.length > 0 || Boolean(local);
          const hasRemoteSource = Boolean(remote);

          let hasValidAppCopy = false;
          if (cached && isAppOwnedImageUri(cached) && /^file:\/\//i.test(cached)) {
            try {
              const info = await LegacyFileSystem.getInfoAsync(cached);
              hasValidAppCopy = Boolean(info.exists);
            } catch {
              hasValidAppCopy = false;
            }
          }

          const hasAnySource = hasLocalSource || hasRemoteSource;
          const hasAnyDisplay = Boolean(display);

          if (hasValidAppCopy) continue;
          // Include all entries that currently have no usable photo, even if they have no source.
          if (!hasAnyDisplay || hasAnySource) {
            next.push(item.id);
          }
        }
        if (!cancelled) {
          setCandidateIds(next);
          setIndex(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const activeItem = useMemo(() => items.find((item) => item.id === candidateIds[index]), [items, candidateIds, index]);
  const total = candidateIds.length;

  const goPrev = () => setIndex((current) => Math.max(0, current - 1));
  const goNext = () => setIndex((current) => Math.min(Math.max(total - 1, 0), current + 1));

  const replacePhoto = async () => {
    if (!activeItem || repairing) return;
    setRepairing(true);
    try {
      const asset = await pickPhotoFromLibrary();
      if (!asset?.uri) return;
      const persisted = await persistLocalImage(asset.uri);
      await updateItem(activeItem.id, { imageUrl: persisted, imageUrls: [persisted] });
      await updateItemCachedImage(activeItem.id, persisted);
      setCandidateIds((current) => {
        const next = current.filter((id) => id !== activeItem.id);
        if (next.length === 0) {
          setIndex(0);
          return next;
        }
        const nextIndex = Math.min(index, next.length - 1);
        setIndex(nextIndex);
        return next;
      });
    } finally {
      setRepairing(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Review Missing Photos</Text>
        <Text style={{ color: '#6b7280', fontSize: 13 }}>
          Step through items and reattach photos from your library.
        </Text>
      </Card>

      {loading ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color="#4B5563" />
            <Text style={{ color: '#6b7280', fontSize: 13 }}>Loading items...</Text>
          </View>
        </Card>
      ) : null}

      {!loading && total === 0 ? (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>No items need photo repair</Text>
          <Text style={{ color: '#6b7280', fontSize: 13 }}>If you still see blanks elsewhere, run Restore Missing Images, then come back here.</Text>
        </Card>
      ) : null}

      {!loading && total > 0 && activeItem ? (
        <Card>
          <Text style={{ color: '#6b7280', fontSize: 12 }}>
            Item {index + 1} of {total}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{activeItem.title || 'Untitled item'}</Text>
          <Text style={{ color: '#6b7280', fontSize: 13 }}>
            {activeItem.size || 'No size'} • {activeItem.brand || 'No brand'}
          </Text>

          <View style={{ marginTop: 10 }}>
            <RemoteImage
              uri={getItemDisplayImageUri(activeItem)}
              fallbackUri={getItemDisplayFallbackUri(activeItem)}
              style={{ width: '100%', height: 220, borderRadius: 12, backgroundColor: '#F3F4F6' }}
              fallbackLabel={activeItem.title || 'Item'}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <Pressable onPress={goPrev} disabled={index === 0} accessibilityRole="button">
              <Text style={{ color: index === 0 ? '#9CA3AF' : '#111827', fontWeight: '700' }}>Previous</Text>
            </Pressable>
            <Pressable onPress={goNext} disabled={index >= total - 1} accessibilityRole="button">
              <Text style={{ color: index >= total - 1 ? '#9CA3AF' : '#111827', fontWeight: '700' }}>Next</Text>
            </Pressable>
          </View>

          <PrimaryButton
            label={repairing ? 'Saving...' : 'Replace Photo'}
            onPress={() => void replacePhoto()}
            variant="secondary"
          />
        </Card>
      ) : null}
    </Screen>
  );
};
