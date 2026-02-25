import ShareIntentModule from 'expo-share-intent/build/ExpoShareIntentModule';

type PendingSharePayload = {
  url: string;
  destination?: 'closet' | 'wishlist' | null;
  childMode?: 'auto' | 'choose';
  createdAt?: string;
};

const moduleAny = ShareIntentModule as any;

export const setAppGroupInt = async (key: string, value: number): Promise<void> => {
  if (!moduleAny?.setAppGroupInt) return;
  try {
    await moduleAny.setAppGroupInt(key, value);
  } catch (error) {
    if (__DEV__) console.warn('[AppGroupStorage] setAppGroupInt failed', key, value, error);
  }
};

export const getAppGroupInt = async (key: string): Promise<number | null> => {
  if (!moduleAny?.getAppGroupInt) return null;
  try {
    const value = await moduleAny.getAppGroupInt(key);
    return typeof value === 'number' ? value : null;
  } catch (error) {
    if (__DEV__) console.warn('[AppGroupStorage] getAppGroupInt failed', key, error);
    return null;
  }
};

export const getPendingSharePayload = async (): Promise<PendingSharePayload | null> => {
  if (!moduleAny?.getAppGroupString) return null;
  try {
    const raw = await moduleAny.getAppGroupString('pendingSharePayload');
    if (!raw || typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw) as PendingSharePayload;
    if (!parsed?.url || typeof parsed.url !== 'string') return null;
    return parsed;
  } catch (error) {
    if (__DEV__) console.warn('[AppGroupStorage] getPendingSharePayload failed', error);
    return null;
  }
};

export const clearPendingSharePayload = async (): Promise<void> => {
  if (!moduleAny?.clearAppGroupValue) return;
  try {
    await moduleAny.clearAppGroupValue('pendingSharePayload');
  } catch (error) {
    if (__DEV__) console.warn('[AppGroupStorage] clearPendingSharePayload failed', error);
  }
};

