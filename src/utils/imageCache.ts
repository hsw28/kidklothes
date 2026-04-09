import * as FileSystem from 'expo-file-system/legacy';

const imageCacheDir = `${FileSystem.documentDirectory ?? ''}layetteout-images/`;
const MANAGED_MEDIA_DIR_NAMES = ['layetteout-images', 'outfit-previews', 'bst-exports'] as const;
const LEGACY_MANAGED_MEDIA_DIR_NAMES = ['layetteout-photos'] as const;
const MANAGED_MEDIA_DIR_MARKERS = [...MANAGED_MEDIA_DIR_NAMES, ...LEGACY_MANAGED_MEDIA_DIR_NAMES].map((name) => `/${name}/`);

export const getAppImageCacheDirectoryUri = (): string | undefined => {
  if (!FileSystem.documentDirectory) return undefined;
  return imageCacheDir;
};

export const getManagedMediaDirectoryUris = (): string[] => {
  const roots = [FileSystem.documentDirectory, FileSystem.cacheDirectory].filter(Boolean) as string[];
  const seen = new Set<string>();
  const uris: string[] = [];
  for (const root of roots) {
    for (const name of [...MANAGED_MEDIA_DIR_NAMES, ...LEGACY_MANAGED_MEDIA_DIR_NAMES]) {
      const uri = `${root}${name}/`;
      if (seen.has(uri)) continue;
      seen.add(uri);
      uris.push(uri);
    }
  }
  return uris;
};

const ensureCacheDir = async () => {
  if (!FileSystem.documentDirectory) return;
  await FileSystem.makeDirectoryAsync(imageCacheDir, { intermediates: true });
};

const extensionFromUrl = (url: string) => {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (!ext || ext.length > 5) return 'jpg';
    return ext;
  } catch {
    return 'jpg';
  }
};

export const cacheRemoteImage = async (itemId: string, url: string): Promise<string | undefined> => {
  if (!url.trim() || !FileSystem.documentDirectory) return undefined;
  await ensureCacheDir();
  const ext = extensionFromUrl(url);
  const targetUri = `${imageCacheDir}${itemId}.${ext}`;
  await FileSystem.downloadAsync(url, targetUri);
  return targetUri;
};

export const isAppOwnedImageUri = (uri?: string | null): boolean => {
  const value = (uri ?? '').trim();
  if (!value) return false;
  return MANAGED_MEDIA_DIR_MARKERS.some((marker) => value.includes(marker));
};

const basenameFromUri = (uri: string): string | undefined => {
  const trimmed = uri.trim();
  if (!trimmed) return undefined;
  const withoutQuery = trimmed.split('?')[0];
  const parts = withoutQuery.split('/');
  const last = parts[parts.length - 1]?.trim();
  return last || undefined;
};

export const findPersistedImageByFilename = async (uri: string): Promise<string | undefined> => {
  const fileName = basenameFromUri(uri);
  if (!fileName) return undefined;
  for (const directoryUri of getManagedMediaDirectoryUris()) {
    const candidate = `${directoryUri}${fileName}`;
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      if (info.exists) return candidate;
    } catch {
      // continue scanning the remaining managed directories
    }
  }
  return undefined;
};

const extensionFromLocalUri = (uri: string) => {
  const cleaned = uri.split('?')[0];
  const ext = cleaned.split('.').pop()?.toLowerCase();
  if (!ext || ext.length > 5) return 'jpg';
  return ext;
};

export const persistLocalImage = async (uri: string): Promise<string> => {
  const trimmed = uri.trim();
  if (!trimmed || !FileSystem.documentDirectory) return uri;
  if (isAppOwnedImageUri(trimmed)) return trimmed;
  if (!/^file:\/\//i.test(trimmed) && !/^content:\/\//i.test(trimmed) && !/^ph:\/\//i.test(trimmed) && !/^assets-library:\/\//i.test(trimmed)) {
    return uri;
  }

  await ensureCacheDir();
  const ext = extensionFromLocalUri(trimmed);
  const targetUri = `${imageCacheDir}local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    await FileSystem.copyAsync({ from: trimmed, to: targetUri });
    return targetUri;
  } catch {
    // Fallback for some iOS photo-library URIs (ph:// / assets-library://) where direct copy can fail.
    try {
      const response = await fetch(trimmed);
      if (!response.ok) return uri;
      const bytes = new Uint8Array(await response.arrayBuffer());

      let base64 = '';
      try {
        const BufferCtor = (globalThis as any).Buffer ?? require('buffer').Buffer;
        base64 = BufferCtor.from(bytes).toString('base64');
      } catch {
        const btoaFn = (globalThis as any).btoa;
        if (!btoaFn) return uri;
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        base64 = btoaFn(binary);
      }

      await FileSystem.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      return targetUri;
    } catch {
      return uri;
    }
  }
};
