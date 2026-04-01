type PendingSharePayload = {
  url: string;
  destination?: 'closet' | 'wishlist' | null;
  childMode?: 'auto' | 'choose';
  createdAt?: string;
};

const getModule = (): any => {
  try {
    // Keep the native share-intent bridge fully lazy so a bad/missing
    // extension module cannot break normal app startup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-share-intent/build/ExpoShareIntentModule') as any;
  } catch (error) {
    if (__DEV__) console.warn('[AppGroupStorage] share-intent bridge unavailable', error);
    return null;
  }
};

export const setAppGroupInt = async (key: string, value: number): Promise<void> => {
  const moduleAny = getModule();
  if (!moduleAny?.setAppGroupInt) return;
  try {
    await moduleAny.setAppGroupInt(key, value);
  } catch (error) {
    if (__DEV__) console.warn('[AppGroupStorage] setAppGroupInt failed', key, value, error);
  }
};

export const getAppGroupInt = async (key: string): Promise<number | null> => {
  const moduleAny = getModule();
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
  const moduleAny = getModule();
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
  const moduleAny = getModule();
  if (!moduleAny?.clearAppGroupValue) return;
  try {
    await moduleAny.clearAppGroupValue('pendingSharePayload');
  } catch (error) {
    if (__DEV__) console.warn('[AppGroupStorage] clearPendingSharePayload failed', error);
  }
};
