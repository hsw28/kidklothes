import { Alert } from 'react-native';

const getMediaLibraryModule = (): typeof import('expo-media-library') | null => {
  try {
    // Keep this native module lazy so app startup does not depend on it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-media-library');
  } catch (error) {
    if (__DEV__) console.warn('[photoLibrary] expo-media-library unavailable', error);
    return null;
  }
};

const showPermissionDeniedAlert = () => {
  Alert.alert('Photos Access Needed', 'Allow photo library access in iOS Settings to save BST cards to your phone.');
};

export const ensurePhotoLibrarySavePermission = async (): Promise<boolean> => {
  const MediaLibrary = getMediaLibraryModule();
  if (!MediaLibrary) return false;
  try {
    const current = await MediaLibrary.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await MediaLibrary.requestPermissionsAsync();
    if (requested.granted) return true;
    showPermissionDeniedAlert();
    return false;
  } catch (error) {
    if (__DEV__) console.warn('[photoLibrary] permission check failed', error);
    return false;
  }
};

export const saveImageToPhotoLibrary = async (uri: string): Promise<boolean> => {
  const MediaLibrary = getMediaLibraryModule();
  if (!MediaLibrary) return false;
  const allowed = await ensurePhotoLibrarySavePermission();
  if (!allowed) return false;
  try {
    await MediaLibrary.saveToLibraryAsync(uri);
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[photoLibrary] saveToLibraryAsync failed, trying createAssetAsync', { uri, error });
    try {
      await MediaLibrary.createAssetAsync(uri);
      return true;
    } catch (fallbackError) {
      if (__DEV__) console.warn('[photoLibrary] createAssetAsync failed', { uri, fallbackError });
      return false;
    }
  }
};
