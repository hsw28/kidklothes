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
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await MediaLibrary.requestPermissionsAsync();
  if (requested.granted) return true;
  showPermissionDeniedAlert();
  return false;
};

export const saveImageToPhotoLibrary = async (uri: string): Promise<boolean> => {
  const MediaLibrary = getMediaLibraryModule();
  if (!MediaLibrary) return false;
  const allowed = await ensurePhotoLibrarySavePermission();
  if (!allowed) return false;
  await MediaLibrary.saveToLibraryAsync(uri);
  return true;
};
