import * as FileSystem from 'expo-file-system/legacy';

const imageCacheDir = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}layetteout-images/`;
const APP_IMAGE_DIR_MARKER = '/layetteout-images/';

const ensureCacheDir = async () => {
  if (!FileSystem.documentDirectory && !FileSystem.cacheDirectory) return;
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
  if (!url.trim() || (!FileSystem.documentDirectory && !FileSystem.cacheDirectory)) return undefined;
  await ensureCacheDir();
  const ext = extensionFromUrl(url);
  const targetUri = `${imageCacheDir}${itemId}.${ext}`;
  await FileSystem.downloadAsync(url, targetUri);
  return targetUri;
};

export const isAppOwnedImageUri = (uri?: string | null): boolean => {
  const value = (uri ?? '').trim();
  if (!value) return false;
  return value.includes(APP_IMAGE_DIR_MARKER);
};

const extensionFromLocalUri = (uri: string) => {
  const cleaned = uri.split('?')[0];
  const ext = cleaned.split('.').pop()?.toLowerCase();
  if (!ext || ext.length > 5) return 'jpg';
  return ext;
};

export const persistLocalImage = async (uri: string): Promise<string> => {
  const trimmed = uri.trim();
  if (!trimmed || (!FileSystem.documentDirectory && !FileSystem.cacheDirectory)) return uri;
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
    return uri;
  }
};
