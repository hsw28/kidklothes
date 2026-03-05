import * as ExpoLinking from 'expo-linking';
import { ItemStatus } from '@/models';

type ShareIntentLike = {
  webUrl?: string;
  text?: string;
  files?: Array<{ path?: string; mimeType?: string }>;
};

const firstUrlInText = (value?: string): string | undefined => {
  if (!value) return undefined;
  const match = value.match(/https?:\/\/[^\s]+/i);
  return match?.[0];
};

const isHttpUrl = (value?: string): value is string => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const extractUrlFromShareIntent = (intent?: ShareIntentLike | null): string | undefined => {
  if (!intent) return undefined;

  const fromWebUrl = intent.webUrl?.trim();
  if (isHttpUrl(fromWebUrl)) return fromWebUrl;

  const fromText = firstUrlInText(intent.text?.trim());
  if (isHttpUrl(fromText)) return fromText;

  return undefined;
};

type AddItemShareOptions = {
  destination: 'closet' | 'wishlist';
  status?: ItemStatus;
  source?: string;
};

const buildAddItemPath = (destination: 'closet' | 'wishlist') =>
  destination === 'wishlist' ? '/wishlist/add' : '/closet/items/add';

export const toAddItemDeepLink = (
  url: string,
  options: AddItemShareOptions = { destination: 'closet' },
): string => {
  const destination = options.destination;
  const status = options.status ?? (destination === 'wishlist' ? 'wishlist' : 'owned');
  return ExpoLinking.createURL(buildAddItemPath(destination), {
    scheme: 'layetteout',
    queryParams: {
      url,
      prefillStatus: status,
      source: options.source ?? 'shareext',
    },
  });
};
