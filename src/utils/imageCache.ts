import * as FileSystem from 'expo-file-system';

const imageCacheDir = `${FileSystem.cacheDirectory ?? ''}layetteout-images/`;

const ensureCacheDir = async () => {
  if (!FileSystem.cacheDirectory) return;
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
  if (!url.trim() || !FileSystem.cacheDirectory) return undefined;
  await ensureCacheDir();
  const ext = extensionFromUrl(url);
  const targetUri = `${imageCacheDir}${itemId}.${ext}`;
  await FileSystem.downloadAsync(url, targetUri);
  return targetUri;
};
