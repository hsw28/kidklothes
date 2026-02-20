declare module 'expo-linking' {
  export function createURL(
    path?: string,
    options?: {
      queryParams?: Record<string, string | number | boolean | undefined>;
    },
  ): string;

  export function openURL(url: string): Promise<boolean>;
}
