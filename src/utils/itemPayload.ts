import { BrandFit, Condition, ItemStatus, KidFit, PrintAlias, ItemSizeScheme, ItemSizeSystem, ItemSizeType, FitBin } from '@/models';
import { closetCategoryToClothingType, getCategoryLabel } from '@/utils/categories';
import { normalizeWhitespace } from '@/utils/normalize';
import { resolveOutboundLink } from '@/utils/outbound';
import { resolvePrintName } from '@/utils/printName';

type ItemPayloadFormInput = {
  childIds?: string[];
  quickMode: boolean;
  title: string;
  url: string;
  brand: string;
  styleName: string;
  printName: string;
  brandTags: string;
  imageUrl: string;
  extraImageUrls: string;
  clothingTypeLabelFallback: string;
  size: string;
  sizeNormalized: string;
  sizeType?: ItemSizeType;
  sizeSystem?: ItemSizeSystem;
  sizeScheme?: ItemSizeScheme;
  sizeRaw?: string;
  fitBin?: FitBin;
  fitBinTouched?: boolean;
  category?: string;
  storageLocationId: string;
  brandFit?: BrandFit;
  kidFit?: KidFit;
  brandSizeNote: string;
  fabric: string;
  condition?: Condition;
  status: ItemStatus;
  purchasePrice: string;
  targetResalePrice: string;
  soldPrice: string;
  soldDate: string;
  tags: string;
  seasonTags: string;
  notes: string;
  quantity: number;
  printAliases: PrintAlias[];
  brandOverride?: string;
};

export type NormalizedItemPayload = {
  childIds?: string[];
  title: string;
  url?: string;
  brand?: string;
  styleName?: string;
  printName?: string;
  printNameNorm?: string;
  brandTags: string[];
  imageUrl?: string;
  imageUrls: string[];
  clothingType: ReturnType<typeof closetCategoryToClothingType>;
  size: string;
  sizeNormalized?: string;
  sizeType?: ItemSizeType;
  sizeSystem?: ItemSizeSystem;
  sizeScheme?: ItemSizeScheme;
  sizeRaw?: string;
  fitBin?: FitBin;
  fitBinTouched?: boolean;
  category?: string;
  storageLocationId?: string;
  brandFit?: BrandFit;
  kidFit?: KidFit;
  brandSizeNote?: string;
  fabric?: string;
  fitRating?: undefined;
  fitException?: undefined;
  condition?: Condition;
  status: ItemStatus;
  purchasePrice?: number;
  targetResalePrice?: number;
  soldPrice?: number;
  soldDate?: string;
  tags: string[];
  seasonTags: string[];
  notes?: string;
  quantity: number;
  sourceDomain?: string;
  canonicalUrl?: string;
  outboundUrl?: string;
};

const parseMoney = (value: string) => {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const normalizeItemPayload = (input: ItemPayloadFormInput): NormalizedItemPayload => {
  const mergedImageUrls = Array.from(
    new Set([input.imageUrl, ...input.extraImageUrls.split(',')].map((value) => value.trim()).filter(Boolean)),
  );

  const printNameNorm = resolvePrintName(input.printName || '', input.printAliases);
  const styleNameDisplay = input.styleName.trim() ? normalizeWhitespace(input.styleName) : '';
  const printNameDisplay = input.printName.trim() ? normalizeWhitespace(input.printName) : '';
  const derivedType = closetCategoryToClothingType(input.category);
  const baseTitle = input.quickMode
    ? `${input.size.trim() || 'New'} ${input.category ? getCategoryLabel(input.category) : input.clothingTypeLabelFallback}`
    : input.title;

  const payload = {
    childIds: input.childIds?.filter(Boolean) ?? [],
    title: baseTitle,
    url: input.url || undefined,
    brand: (input.brandOverride ?? input.brand) || undefined,
    styleName: styleNameDisplay || undefined,
    printName: printNameDisplay || undefined,
    printNameNorm: printNameNorm || undefined,
    brandTags: input.brandTags
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    imageUrl: mergedImageUrls[0] || undefined,
    imageUrls: mergedImageUrls,
    clothingType: derivedType,
    size: input.size,
    sizeNormalized: input.sizeNormalized || undefined,
    sizeType: input.sizeType,
    sizeSystem: input.sizeSystem,
    sizeScheme: input.sizeScheme,
    sizeRaw: input.sizeRaw || input.size || undefined,
    fitBin: input.fitBin,
    fitBinTouched: input.fitBinTouched,
    category: input.category,
    storageLocationId: input.storageLocationId || undefined,
    brandFit: input.brandFit,
    kidFit: input.kidFit,
    brandSizeNote: input.brandSizeNote || undefined,
    fabric: input.fabric.trim() || undefined,
    fitRating: undefined,
    fitException: undefined,
    condition: input.condition,
    status: input.status,
    purchasePrice: parseMoney(input.purchasePrice),
    targetResalePrice: parseMoney(input.targetResalePrice),
    soldPrice: parseMoney(input.soldPrice),
    soldDate: input.soldDate.trim() || undefined,
    tags: input.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    seasonTags: input.seasonTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    notes: input.notes || undefined,
    quantity: Math.max(1, Math.floor(input.quantity || 1)),
  };

  const resolved = resolveOutboundLink(payload.url || '', {
    canonicalUrl: payload.url,
    monetize: false,
  });

  return {
    ...payload,
    sourceDomain: resolved.sourceDomain || undefined,
    canonicalUrl: resolved.canonicalUrl || undefined,
    outboundUrl: resolved.outboundUrl || undefined,
  };
};
