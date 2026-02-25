declare module 'expo-document-picker' {
  export type DocumentPickerAsset = {
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
  };

  export type DocumentPickerResult =
    | { canceled: true; assets: [] }
    | { canceled: false; assets: DocumentPickerAsset[] };

  export function getDocumentAsync(options?: {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
  }): Promise<DocumentPickerResult>;
}
