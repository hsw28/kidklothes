declare module 'expo-share-intent' {
  import type { ReactNode } from 'react';

  export interface ShareIntentFile {
    path?: string;
    mimeType?: string;
    fileName?: string;
  }

  export interface ShareIntent {
    text?: string;
    webUrl?: string;
    files?: ShareIntentFile[];
  }

  export function ShareIntentProvider(props: { children?: ReactNode }): JSX.Element;

  export function useShareIntentContext(): {
    hasShareIntent: boolean;
    shareIntent: ShareIntent | null;
    resetShareIntent: () => void;
    error?: string | null;
  };
}
