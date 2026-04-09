import React from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { SaleDraft } from '@/models';
import { ItemCardViewProps, CollageViewProps } from '@/components/bst/BstAssetRenderers';
import { buildSaleDraftName, ResolvedSaleDraftItem } from '@/services/bst/draft';

export type BstCollagePageModel = Omit<CollageViewProps, 'onAssetLoadEnd'>;
export type BstItemCardModel = Omit<ItemCardViewProps, 'onAssetLoadEnd'>;

export type BstImageGeneratorInput = {
  draft: SaleDraft;
  resolvedItems: ResolvedSaleDraftItem[];
  brandingMode?: 'free' | 'pro';
  itemCardDraftItemIds?: string[];
  collagePreviewMode?: CollageViewProps['previewMode'];
};

export type BstGenerationProgress = {
  phase: 'collage' | 'item-card';
  current: number;
  total: number;
  label: string;
};

export type BstGenerationOptions = {
  onProgress?: (progress: BstGenerationProgress) => void;
};

export type BstImageGeneratorHandle = {
  generateCollages: (input: BstImageGeneratorInput, options?: BstGenerationOptions) => Promise<string[]>;
  generateItemCards: (input: BstImageGeneratorInput, options?: BstGenerationOptions) => Promise<string[]>;
  generateAll: (input: BstImageGeneratorInput, options?: BstGenerationOptions) => Promise<{ collageUris: string[]; itemCardUris: string[] }>;
};

export const buildCollageViewModels = (input: BstImageGeneratorInput): BstCollagePageModel[] => {
  const { draft, resolvedItems } = input;
  if (!resolvedItems.length) return [];
  return [{
    title: buildSaleDraftName(draft),
    items: resolvedItems,
    pageSize: resolvedItems.length,
    brandingMode: input.brandingMode ?? 'free',
    previewMode: input.collagePreviewMode ?? 'export',
    showPricesOnCollage: draft.showPricesOnCollage,
  }];
};

export const buildItemCardViewModels = ({ draft, resolvedItems, brandingMode = 'free', itemCardDraftItemIds }: BstImageGeneratorInput): BstItemCardModel[] => {
  const draftTitle = buildSaleDraftName(draft);
  const filtered = itemCardDraftItemIds?.length
    ? resolvedItems.filter((entry) => itemCardDraftItemIds.includes(entry.draftItem.id))
    : resolvedItems;
  return filtered.map((entry) => ({ draftTitle, entry, brandingMode }));
};

const ensureExportDirectory = async (): Promise<string> => {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) throw new Error('File system directory unavailable');
  const dir = `${baseDir}bst-exports/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'bst';

const prefixBase = (draft: SaleDraft): string => `${slugify(buildSaleDraftName(draft))}-${draft.id.slice(0, 8)}`;

export const cleanupGeneratedFiles = async (prefix: string, keep = 12): Promise<void> => {
  const dir = await ensureExportDirectory();
  const entries = await FileSystem.readDirectoryAsync(dir).catch(() => []);
  const matching = entries.filter((entry) => entry.startsWith(prefix)).sort().reverse();
  const stale = matching.slice(keep);
  await Promise.all(stale.map((entry) => FileSystem.deleteAsync(`${dir}${entry}`, { idempotent: true }).catch(() => undefined)));
};

export const persistCapturedUri = async (capturedUri: string, prefix: string, index: number): Promise<string> => {
  const dir = await ensureExportDirectory();
  const fileUri = `${dir}${prefix}-${String(index + 1).padStart(2, '0')}.png`;
  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
  await FileSystem.copyAsync({ from: capturedUri, to: fileUri });
  await FileSystem.deleteAsync(capturedUri, { idempotent: true }).catch(() => undefined);
  await cleanupGeneratedFiles(prefix);
  return fileUri;
};

export const generateCollages = async (
  hostRef: React.RefObject<BstImageGeneratorHandle | null>,
  input: BstImageGeneratorInput,
  options?: BstGenerationOptions,
): Promise<string[]> => {
  if (!hostRef.current) throw new Error('BST image generator unavailable');
  return hostRef.current.generateCollages(input, options);
};

export const generateItemCards = async (
  hostRef: React.RefObject<BstImageGeneratorHandle | null>,
  input: BstImageGeneratorInput,
  options?: BstGenerationOptions,
): Promise<string[]> => {
  if (!hostRef.current) throw new Error('BST image generator unavailable');
  return hostRef.current.generateItemCards(input, options);
};

export const buildCollageFilePrefix = (draft: SaleDraft): string => `${prefixBase(draft)}-collage`;
export const buildItemCardFilePrefix = (draft: SaleDraft): string => `${prefixBase(draft)}-item-card`;
