import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PickedPhotoAsset = {
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
};

const mapAsset = (asset: ImagePicker.ImagePickerAsset | null | undefined): PickedPhotoAsset | null => {
  if (!asset?.uri) return null;
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName ?? undefined,
  };
};

const showPermissionDeniedAlert = (kind: 'photos' | 'camera') => {
  const title = kind === 'photos' ? 'Photos Access Needed' : 'Camera Access Needed';
  const message =
    kind === 'photos'
      ? 'Allow photo access in iOS Settings to choose images from your library.'
      : 'Allow camera access in iOS Settings to take a photo.';
  Alert.alert(title, message);
};

const ensureMediaLibraryPermission = async (): Promise<boolean> => {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (requested.granted) return true;
  showPermissionDeniedAlert('photos');
  return false;
};

const ensureCameraPermission = async (): Promise<boolean> => {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  const requested = await ImagePicker.requestCameraPermissionsAsync();
  if (requested.granted) return true;
  showPermissionDeniedAlert('camera');
  return false;
};

export const pickPhotoFromLibrary = async (): Promise<PickedPhotoAsset | null> => {
  const allowed = await ensureMediaLibraryPermission();
  if (!allowed) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.9,
    exif: false,
    selectionLimit: 1,
  });
  if (result.canceled) return null;
  return mapAsset(result.assets?.[0]);
};

export const takePhotoWithCamera = async (): Promise<PickedPhotoAsset | null> => {
  const allowed = await ensureCameraPermission();
  if (!allowed) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.9,
    exif: false,
  });
  if (result.canceled) return null;
  return mapAsset(result.assets?.[0]);
};

