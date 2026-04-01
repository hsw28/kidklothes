declare module 'expo-file-system' {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;

  export function getInfoAsync(uri: string): Promise<{ exists: boolean; isDirectory?: boolean; size?: number }>;
  export function makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  export function copyAsync(options: { from: string; to: string }): Promise<void>;
  export function deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  export function readDirectoryAsync(uri: string): Promise<string[]>;
  export function downloadAsync(uri: string, fileUri: string): Promise<{ uri: string; status: number }>;
  export function writeAsStringAsync(uri: string, contents: string): Promise<void>;
  export function readAsStringAsync(uri: string): Promise<string>;
}
