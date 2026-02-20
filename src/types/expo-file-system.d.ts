declare module 'expo-file-system' {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;

  export function makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;

  export function copyAsync(options: { from: string; to: string }): Promise<void>;
}
