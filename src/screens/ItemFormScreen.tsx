import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { ChipSelector } from '@/components/ChipSelector';
import { FormInput } from '@/components/FormInput';
import { ItemPhotoGallery } from '@/components/ItemPhotoGallery';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RemoteImage } from '@/components/RemoteImage';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { useReviewPrompt } from '@/hooks/useReviewPrompt';
import { BrandFit, ClothingType, Condition, FitBin, Item, ItemSizeScheme, ItemSizeSystem, ItemSizeType, ItemStatus, KidFit } from '@/models';
import { ItemsStackParamList } from '@/navigation/types';
import { trackItemPhotoAdded, trackItemPhotoRemoved, trackItemPhotoReordered, trackSecondPhotoLimitHit } from '@/services/bst/bstAnalytics';
import { canUseMultipleItemPhotos } from '@/services/proAccess';
import { ADD_ITEM_CATEGORY_OPTIONS, ClosetCategory, closetCategoryToClothingType, closetLabel, normalizeItemCategoryToClosetCategory } from '@/utils/categories';
import { getWishlistAwareness } from '@/utils/fitInsights';
import { canonicalizeBrand, prettyBrandFallback } from '@/utils/brandNormalize';
import { formatItemCategoryLabel } from '@/utils/itemLabels';
import { normalizeItemPayload } from '@/utils/itemPayload';
import { jaccardTokenOverlap, normalizePrintName, resolvePrintName } from '@/utils/printName';
import { getChildCurrentSizeText, getChildNextSizeText, SIZE_OPTIONS } from '@/utils/sizes';
import { fetchLinkMetadata } from '@/utils/unfurlUrl';
import { pickPhotoFromLibrary, takePhotoWithCamera } from '@/utils/photoPicker';
import { validateNewItemInput } from '@/utils/itemValidation';
import { cacheRemoteImage, persistLocalImage } from '@/utils/imageCache';
import { normalizeInventoryRealityThreshold } from '@/utils/inventoryReality';
import { APPAREL_AGE_SIZES, APPAREL_ALPHA_SIZES, US_SHOE_SIZES, computeDefaultFitBin, getSizeUIModel, inferSizeScheme, normalizeSize as normalizeStructuredSize } from '@/lib/sizing';

const statusOptions: ItemStatus[] = ['wishlist', 'owned', 'sold'];
const conditionOptions: Condition[] = ['new-with-tags', 'like-new', 'good', 'play'];
const categoryOptions: ClosetCategory[] = ADD_ITEM_CATEGORY_OPTIONS;
const storagePresetOptions = ['None', 'Sell', 'Size Up', 'Current', 'Out Grew'] as const;
type StoragePresetOption = (typeof storagePresetOptions)[number];
const brandFitOptions: Array<{ value: BrandFit; label: string }> = [
  { value: 'tts', label: 'True to size' },
  { value: 'small', label: 'Runs small' },
  { value: 'big', label: 'Runs big' },
];
const kidFitOptions: Array<{ value: KidFit; label: string }> = [
  { value: 'fits', label: 'Fits now' },
  { value: 'big', label: 'A bit big' },
  { value: 'small', label: 'A bit small' },
  { value: 'unknown', label: 'Not tried yet' },
];
const brandFitLabels = brandFitOptions.map((option) => option.label);
const kidFitLabels = kidFitOptions.map((option) => option.label);
const commonSizeLabels = SIZE_OPTIONS.filter((entry) => entry.code !== 'OTHER').map((entry) => entry.code);
const fitBinOptions: FitBin[] = ['current', 'next', 'later', 'unsure'];
const fitBinLabels: Record<FitBin, string> = {
  current: 'Current',
  next: 'Next',
  later: 'Later',
  unsure: 'Unsure',
};

type Props = NativeStackScreenProps<ItemsStackParamList, 'AddItem'>;

type SimilarCandidate = {
  item: Item;
  score: number;
  reasons: string[];
};

type PreviewCardState =
  | { status: 'idle' }
  | { status: 'loading'; domain?: string }
  | { status: 'success'; title: string; domain: string; imageUrl?: string }
  | { status: 'error'; domain?: string; message: string };

const normalizeText = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ');
const debugPollutionMarkers = ['[TextInputUI]', 'PrimaryButton onPress failed', 'ERR_INTERNAL_SQLITE_ERROR', '[React]'];

const isProbablyHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());
const MARKETPLACE_BRAND_TOKENS = new Set([
  'ebay',
  'mercari',
  'poshmark',
  'depop',
  'vinted',
  'kidizen',
  'thredup',
  'offerup',
  'facebookmarketplace',
  'marketplace',
  'whatnot',
]);

const normalizeMarketplaceToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const isMarketplaceSource = (urlValue?: string, sourceDomain?: string, siteName?: string) => {
  const candidates: string[] = [];
  const trimmedUrl = (urlValue || '').trim();
  if (trimmedUrl) {
    try {
      candidates.push(new URL(trimmedUrl).hostname.replace(/^www\./i, ''));
    } catch {
      // ignore malformed URL
    }
  }
  if (sourceDomain?.trim()) candidates.push(sourceDomain.trim());
  if (siteName?.trim()) candidates.push(siteName.trim());
  return candidates.some((value) => {
    const normalized = normalizeMarketplaceToken(value);
    return Array.from(MARKETPLACE_BRAND_TOKENS).some((token) => normalized.includes(token));
  });
};

const sanitizeAutofillBrand = (candidate: string, options: { isMarketplace: boolean }) => {
  const trimmed = candidate.trim();
  if (!trimmed) return '';
  if (!options.isMarketplace) return trimmed;
  const token = normalizeMarketplaceToken(trimmed);
  if (!token || MARKETPLACE_BRAND_TOKENS.has(token)) return '';
  return trimmed;
};

const extractHttpUrl = (value: string): string | undefined => {
  const match = value.match(/https?:\/\/[^\s'"`<>]+/i);
  if (!match) return undefined;
  return match[0].replace(/[),\].]+$/, '');
};

const sanitizeUrlInput = (raw: string) => {
  const trimmed = raw.trim();
  const polluted = debugPollutionMarkers.some((marker) => trimmed.includes(marker));
  if (!polluted) return { value: raw, polluted: false };
  return { value: extractHttpUrl(trimmed) ?? '', polluted: true };
};

const isValidHttpImageUrl = (value?: string) => {
  if (!value) return false;
  const normalized = value.startsWith('//') ? `https:${value}` : value;
  return /^https?:\/\/\S+$/i.test(normalized.trim());
};

const normalizeImageCandidate = (value?: string): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
};

const parseImageUrlList = (primary: string, extras: string): string[] =>
  Array.from(new Set([primary, ...extras.split(',')].map((value) => normalizeImageCandidate(value)).filter(Boolean)));

const prettifyWord = (token: string) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();

const kqSlugToTitle = (value: string): string | undefined => {
  try {
    const parsed = new URL(value);
    const productsIdx = parsed.pathname.split('/').findIndex((part) => part === 'products');
    const slug = parsed.pathname.split('/')[productsIdx + 1] ?? '';
    if (!slug) return undefined;
    const rawParts = slug
      .split('-')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^w\d+$/i.test(part))
      .filter((part) => !['modal', 'bamboo', 'rib', 'skinny', 'pointelle'].includes(part.toLowerCase()));
    if (rawParts.length < 3) return undefined;
    const printStart = rawParts.findIndex((part) =>
      ['tiny', 'mini', 'little', 'vintage', 'happy', 'blue', 'pink', 'green', 'floral', 'monstera', 'berries', 'berry'].includes(part.toLowerCase()),
    );
    const left = rawParts.slice(0, printStart > 1 ? printStart : Math.max(0, rawParts.length - 2));
    const right = printStart > 1 ? rawParts.slice(printStart) : rawParts.slice(-2);
    const titleLeft = left.map(prettifyWord).join(' ');
    const titleRight = right.map(prettifyWord).join(' ');
    const combined = [titleLeft, titleRight].filter(Boolean).join(' — ');
    return combined || rawParts.map(prettifyWord).join(' ');
  } catch {
    return undefined;
  }
};

const getDomainLabel = (value: string) => {
  try {
    return new URL(value.trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const printStopwords = new Set([
  'baby',
  'kids',
  'kid',
  'girls',
  'boys',
  'toddler',
  'ruffle',
  'graphic',
  'short',
  'long',
  'sleeve',
  'sleeveless',
  'dress',
  'romper',
  'sleeper',
  'top',
  'tee',
  'shirt',
  'pants',
  'pant',
  'bottom',
  'shorts',
  'pajamas',
  'pajama',
  'pj',
  'outerwear',
  'jacket',
  'coat',
  'shoes',
  'shoe',
  'size',
  'pack',
  'set',
]);

const suggestPrintName = (titleValue: string, brandValue: string, brandTagsValue: string): string | undefined => {
  const cleaned = titleValue
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (cleaned.length === 0) return undefined;

  const brandTokens = new Set(
    `${brandValue} ${brandTagsValue}`
      .toLowerCase()
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );

  const candidates = cleaned.filter((rawToken) => {
    const token = rawToken.toLowerCase();
    if (token.length < 4) return false;
    if (brandTokens.has(token)) return false;
    if (printStopwords.has(token)) return false;
    if (/^\d+[tmc]?$/i.test(token)) return false;
    return true;
  });

  if (candidates.length === 0) return undefined;
  return candidates[0];
};

const normalizeStorageToken = (value: string) => value.toLowerCase().trim().replace(/[\s-]+/g, '_');

const getStoragePresetForLocation = (location?: { name?: string; type?: string }): StoragePresetOption | undefined => {
  if (!location) return undefined;
  const name = normalizeStorageToken(location.name ?? '');
  const type = normalizeStorageToken(location.type ?? '');
  if (name === 'sell_bin' || type === 'sell') return 'Sell';
  if (name === 'size_up_bin' || type === 'size_up') return 'Size Up';
  if (name === 'current_closet' || type === 'closet') return 'Current';
  if (name === 'out_grew' || name === 'outgrew' || type === 'out_grew') return 'Out Grew';
  return undefined;
};

const getFormStatus = (value?: ItemStatus): ItemStatus => (value === 'for-sale' ? 'owned' : (value ?? 'wishlist'));

const getStorageConfigForPreset = (preset: Exclude<StoragePresetOption, 'None'>) => {
  if (preset === 'Sell') return { name: 'Sell Bin', type: 'sell' };
  if (preset === 'Size Up') return { name: 'Size-Up Bin', type: 'size_up' };
  if (preset === 'Current') return { name: 'Current Closet', type: 'closet' };
  return { name: 'Out Grew', type: 'out_grew' };
};

export const ItemFormScreen: React.FC<Props> = ({ route, navigation }) => {
  const { children, items, childItems, storageLocations, printAliases, settings, purchaseState, logEvent, addItem, updateItem, updateItemCachedImage, updateSettings, createStorageLocation } = useData();
  const { recordMeaningfulActionAndMaybePrompt } = useReviewPrompt();
  const editing = route.params?.itemId;
  const duplicateFromItemId = route.params?.duplicateFromItemId;
  const shoppingMode = route.params?.shoppingMode === true;
  const existing = useMemo(() => items.find((item) => item.id === editing), [editing, items]);
  const sourceItemId = duplicateFromItemId ?? editing;
  const sourceItem = useMemo(() => items.find((item) => item.id === sourceItemId), [sourceItemId, items]);
  const sourceChildLink = useMemo(() => childItems.find((link) => link.itemId === sourceItemId), [childItems, sourceItemId]);

  const initialType = sourceItem?.clothingType ?? route.params?.prefillType ?? (shoppingMode ? settings.lastShoppingType : undefined) ?? 'top';

  const [title, setTitle] = useState(sourceItem?.title ?? '');
  const [url, setUrl] = useState(sourceItem?.url ?? route.params?.url ?? '');
  const [brand, setBrand] = useState(sourceItem?.brand ?? route.params?.prefillBrand ?? '');
  const [styleName, setStyleName] = useState(sourceItem?.styleName ?? '');
  const [printName, setPrintName] = useState(sourceItem?.printName ?? '');
  const [brandTags, setBrandTags] = useState(sourceItem?.brandTags.join(', ') ?? sourceItem?.brand ?? route.params?.prefillBrand ?? '');
  const existingPrimaryImage = sourceItem?.imageUrl ?? sourceItem?.imageUrls?.[0] ?? sourceItem?.cachedImageUri ?? '';
  const existingExtraImages = sourceItem
    ? (sourceItem.imageUrls ?? []).filter((entry) => entry && entry !== existingPrimaryImage).join(', ')
    : '';
  const [imageUrl, setImageUrl] = useState(existingPrimaryImage);
  const [extraImageUrls, setExtraImageUrls] = useState(existingExtraImages);
  const [size, setSize] = useState(sourceItem?.size ?? '');
  const [sizeNormalized, setSizeNormalized] = useState(sourceItem?.sizeNormalized ?? '');
  const [sizeType, setSizeType] = useState<ItemSizeType | undefined>(sourceItem?.sizeType);
  const [sizeSystem, setSizeSystem] = useState<ItemSizeSystem | undefined>(sourceItem?.sizeSystem);
  const [sizeScheme, setSizeScheme] = useState<ItemSizeScheme | undefined>(sourceItem?.sizeScheme);
  const [sizeRaw, setSizeRaw] = useState(sourceItem?.sizeRaw ?? sourceItem?.size ?? '');
  const [fitBin, setFitBin] = useState<FitBin>(sourceItem?.fitBin ?? 'unsure');
  const [fitBinTouched, setFitBinTouched] = useState(Boolean(sourceItem?.fitBinTouched));
  const [brandSizeNote, setBrandSizeNote] = useState(sourceItem?.brandSizeNote ?? '');
  const [fabric, setFabric] = useState(sourceItem?.fabric ?? '');
  const [brandFit, setBrandFit] = useState<BrandFit | undefined>(sourceItem?.brandFit);
  const [kidFit, setKidFit] = useState<KidFit | undefined>(sourceItem?.kidFit ?? (editing ? undefined : 'unknown'));
  const [purchasePrice, setPurchasePrice] = useState(sourceItem?.purchasePrice?.toString() ?? '');
  const [targetResalePrice, setTargetResalePrice] = useState(sourceItem?.targetResalePrice?.toString() ?? '');
  const [soldPrice, setSoldPrice] = useState(sourceItem?.soldPrice?.toString() ?? '');
  const [soldDate, setSoldDate] = useState(sourceItem?.soldDate ?? '');
  const [notes, setNotes] = useState(sourceItem?.notes ?? '');
  const [tags, setTags] = useState(sourceItem?.tags.join(', ') ?? '');
  const [seasonTags, setSeasonTags] = useState(sourceItem?.seasonTags.join(', ') ?? '');
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(
    sourceItem?.childIds.length
      ? sourceItem.childIds
      : route.params?.prefillChildId
        ? [route.params.prefillChildId]
        : settings.lastShoppingChildId
          ? [settings.lastShoppingChildId]
          : children[0]?.id
            ? [children[0].id]
            : [],
  );
  const [clothingType, setClothingType] = useState<ClothingType>(initialType);
  const [status, setStatus] = useState<ItemStatus>(getFormStatus(sourceItem?.status ?? route.params?.prefillStatus));
  const [storagePreset, setStoragePreset] = useState<StoragePresetOption>(() => {
    const matchedLocation = storageLocations.find((location) => location.id === sourceChildLink?.storageLocationId);
    return getStoragePresetForLocation(matchedLocation) ?? (sourceItem?.status === 'for-sale' ? 'Sell' : 'None');
  });
  const [storagePresetTouched, setStoragePresetTouched] = useState(false);
  const [quantity, setQuantity] = useState(Math.max(1, sourceItem?.quantity ?? 1));
  const [condition, setCondition] = useState<Condition | undefined>(sourceItem?.condition);
  const [category, setCategory] = useState<ClosetCategory | undefined>(
    normalizeItemCategoryToClosetCategory(sourceItem?.category)
    ?? normalizeItemCategoryToClosetCategory(route.params?.prefillCategory),
  );
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [previewCard, setPreviewCard] = useState<PreviewCardState>(() => (route.params?.url ? { status: 'loading', domain: getDomainLabel(route.params.url) } : { status: 'idle' }));
  const [showPhotoEarlyAccessModal, setShowPhotoEarlyAccessModal] = useState(false);
  const [photoEarlyAccessJoinedThisSession, setPhotoEarlyAccessJoinedThisSession] = useState(false);
  const [showAdvancedMediaFields, setShowAdvancedMediaFields] = useState(false);
  const [titleTouched, setTitleTouched] = useState(Boolean(sourceItem?.title));
  const [brandTouched, setBrandTouched] = useState(Boolean(sourceItem?.brand));
  const [imageTouched, setImageTouched] = useState(Boolean(sourceItem?.imageUrl || sourceItem?.cachedImageUri));
  const [quickMode, setQuickMode] = useState(() => {
    if (editing) return false;
    if (typeof route.params?.quick === 'boolean') return route.params.quick;
    const isClosetAddFlow = route.params?.shoppingMode === true || route.params?.prefillStatus === 'owned';
    return isClosetAddFlow ? settings.closetAddDefaultView === 'simple' : false;
  });
  const [duplicateCandidates, setDuplicateCandidates] = useState<SimilarCandidate[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showSizePickerModal, setShowSizePickerModal] = useState(false);
  const [duplicateModalMessage, setDuplicateModalMessage] = useState('These look close to what you are adding.');
  const [pendingAddAnother, setPendingAddAnother] = useState(false);
  const [didAutofillPrint, setDidAutofillPrint] = useState(Boolean(sourceItem?.printName));
  const [showPrintSuggestions, setShowPrintSuggestions] = useState(true);
  const [debouncedPrintQuery, setDebouncedPrintQuery] = useState((existing?.printName ?? '').trim());
  const [sizePickerSection, setSizePickerSection] = useState<'AGE' | 'ALPHA' | 'CUSTOM' | 'SHOE'>(
    (sourceItem?.sizeScheme === 'ALPHA' ? 'ALPHA' : sourceItem?.sizeScheme === 'SHOE' ? 'SHOE' : sourceItem?.sizeScheme === 'CUSTOM' ? 'CUSTOM' : 'AGE'),
  );
  const isWebImportFlow = Boolean(route.params?.url?.trim()) || route.params?.source === 'shareext';
  const primaryChildId = selectedChildIds[0] ?? '';
  const deepLinkUrlRef = useRef(route.params?.url?.trim() || '');
  const imageTouchedRef = useRef(Boolean(sourceItem?.imageUrl || sourceItem?.cachedImageUri));
  const imageUrlRef = useRef(existingPrimaryImage);
  const prevCategoryRef = useRef<string | undefined>(undefined);
  const autoUnfurlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAutoRequestUrlRef = useRef('');
  const lastAutoSuccessUrlRef = useRef('');
  const autofillMetaRef = useRef<{ titleAutoValue?: string; brandAutoValue?: string; imageAutoValue?: string }>({});
  const showLocationFeatures = children.length > 0;
  const hasMultiPhotoAccess = canUseMultipleItemPhotos(settings, purchaseState);
  const scopedStorageLocations = useMemo(
    () => storageLocations.filter((location) => !location.childId || location.childId === primaryChildId),
    [storageLocations, primaryChildId],
  );
  useEffect(() => {
    imageTouchedRef.current = imageTouched;
  }, [imageTouched]);
  useEffect(() => {
    imageUrlRef.current = imageUrl;
  }, [imageUrl]);

  const photoUris = useMemo(() => parseImageUrlList(imageUrl, extraImageUrls), [extraImageUrls, imageUrl]);

  const syncPhotoFields = (nextPhotoUris: string[]) => {
    const normalized = Array.from(new Set(nextPhotoUris.map((entry) => normalizeImageCandidate(entry)).filter(Boolean)));
    imageTouchedRef.current = normalized.length > 0;
    imageUrlRef.current = normalized[0] ?? '';
    setImageTouched(normalized.length > 0);
    setImageUrl(normalized[0] ?? '');
    setExtraImageUrls(normalized.slice(1).join(', '));
  };

  const openPhotoPaywall = () => {
    void trackSecondPhotoLimitHit(logEvent, {
      itemId: editing || undefined,
      itemCount: photoUris.length,
      isPro: hasMultiPhotoAccess,
      triggeredFrom: 'item_form',
    });
    void logEvent('early_access_modal_opened', {
      surface: 'item_multi_photo',
      joined: Boolean(settings.proEarlyAccessJoined),
    });
    setShowPhotoEarlyAccessModal(true);
  };

  const joinPhotoEarlyAccess = async () => {
    await updateSettings({ proEarlyAccessJoined: true });
    await logEvent('early_access_joined', { surface: 'item_multi_photo' });
    setPhotoEarlyAccessJoinedThisSession(true);
  };

  const defaultWearingSize = useMemo(() => {
    if (!quickMode || !primaryChildId) return '';
    const linked = childItems
      .filter((link) => link.childId === primaryChildId)
      .map((link) => items.find((item) => item.id === link.itemId))
      .filter(Boolean)
      .map((item) => item as Item)
      .filter((item) => item.status === 'owned' && item.clothingType === clothingType);
    if (linked.length === 0) return '';

    const freq = new Map<string, number>();
    linked.forEach((item) => freq.set(item.size, (freq.get(item.size) ?? 0) + 1));
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }, [quickMode, primaryChildId, childItems, items, clothingType]);
  const selectedChild = useMemo(() => children.find((entry) => entry.id === primaryChildId), [children, primaryChildId]);
  const sizeUiModel = useMemo(
    () => getSizeUIModel({ categoryIdOrName: category || clothingType, shoeSystem: selectedChild?.shoeSizeSystem ?? 'US_SHOE' }),
    [category, clothingType, selectedChild?.shoeSizeSystem],
  );
  const sizePickerSectionOptions = useMemo(
    () => sizeUiModel.sections.map((section) => ({ key: section.key, title: section.title, options: section.options ?? [] })),
    [sizeUiModel],
  );
  const childCurrentSizeText = useMemo(() => getChildCurrentSizeText(selectedChild), [selectedChild]);
  const childNextSizeText = useMemo(() => getChildNextSizeText(selectedChild), [selectedChild]);
  const suggestedSizeChoices = useMemo(() => {
    const pinned = [childCurrentSizeText, childNextSizeText]
      .map((value) => (value || '').trim())
      .filter(Boolean);
    const recent = items
      .filter((item) => item.childIds.includes(primaryChildId))
      .map((item) => item.size.trim())
      .filter(Boolean);
    return Array.from(new Set([...pinned, ...recent, ...commonSizeLabels])).slice(0, 24);
  }, [childCurrentSizeText, childNextSizeText, items, primaryChildId]);

  useEffect(() => {
    const sharedUrl = route.params?.url?.trim();
    if (!existing && sharedUrl) setUrl(sharedUrl);
  }, [existing, route.params?.url]);

  useEffect(() => {
    if (existing) return;
    if (route.params?.source !== 'shareext') return;

    const sharedUrl = route.params?.url?.trim() || '';
    const sharedTitle = (route.params?.sharedTitle || '').trim();
    const sharedImageUrl = normalizeImageCandidate(route.params?.sharedImageUrl || '');
    const sharedSiteName = (route.params?.sharedSiteName || '').trim();

    if (sharedTitle && (!titleTouched || !title.trim())) {
      setTitle(sharedTitle);
      autofillMetaRef.current.titleAutoValue = sharedTitle;
    }

    if (sharedImageUrl && isValidHttpImageUrl(sharedImageUrl) && (!imageTouchedRef.current || !imageUrlRef.current.trim())) {
      syncPhotoFields([sharedImageUrl]);
      autofillMetaRef.current.imageAutoValue = sharedImageUrl;
    }

    if (sharedSiteName && !brandTouched && !brand.trim() && !isMarketplaceSource(sharedUrl, undefined, sharedSiteName)) {
      setBrand(sharedSiteName);
      autofillMetaRef.current.brandAutoValue = sharedSiteName;
      if (!brandTags.trim()) setBrandTags(sharedSiteName);
    }

    if (sharedUrl) {
      setPreviewCard((prev) => (
        prev.status === 'success'
          ? prev
          : {
              status: 'success',
              title: sharedTitle || getDomainLabel(sharedUrl) || 'Preview',
              domain: sharedSiteName || getDomainLabel(sharedUrl),
              imageUrl: sharedImageUrl || undefined,
            }
      ));
    }
  }, [
    brand,
    brandTags,
    brandTouched,
    existing,
    route.params?.sharedImageUrl,
    route.params?.sharedSiteName,
    route.params?.sharedTitle,
    route.params?.source,
    route.params?.url,
    title,
    titleTouched,
  ]);

  useEffect(() => {
    return () => {
      if (autoUnfurlTimerRef.current) clearTimeout(autoUnfurlTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedPrintQuery((printName || title || '').trim());
    }, 400);
    return () => clearTimeout(handle);
  }, [printName, title]);

  const applySizeValue = React.useCallback(
    (rawValue: string, explicitScheme?: ItemSizeScheme) => {
      const nextRaw = rawValue;
      const nextNormalized = normalizeStructuredSize(nextRaw || '');
      const nextType: ItemSizeType = sizeUiModel.sizeType;
      const nextSystem: ItemSizeSystem = (sizeUiModel.sizeSystem === 'US_SHOE' ? 'US_SHOE' : 'APPAREL') as ItemSizeSystem;
      const inferred = (explicitScheme ?? inferSizeScheme(nextRaw || '')) as ItemSizeScheme;
      setSize(nextRaw);
      setSizeRaw(nextRaw);
      setSizeNormalized(nextNormalized);
      setSizeType(nextType);
      setSizeSystem(nextSystem);
      setSizeScheme(inferred);
      if (!fitBinTouched) {
        setFitBin(
          computeDefaultFitBin({
            sizeType: nextType,
            sizeNormalized: nextNormalized,
            kid: selectedChild ?? {},
          }),
        );
      }
    },
    [fitBinTouched, selectedChild, sizeUiModel.sizeSystem, sizeUiModel.sizeType],
  );

  useEffect(() => {
    if (!category) return;
    const derived = closetCategoryToClothingType(category);
    if (derived !== clothingType) setClothingType(derived);
  }, [category, clothingType]);

  useEffect(() => {
    const categoryKey = category || clothingType;
    if (!categoryKey) return;
    if (prevCategoryRef.current === undefined) {
      prevCategoryRef.current = categoryKey;
      return;
    }
    if (prevCategoryRef.current === categoryKey) return;
    prevCategoryRef.current = categoryKey;
    const nextType: ItemSizeType = sizeUiModel.sizeType;
    const nextSystem: ItemSizeSystem = (sizeUiModel.sizeSystem === 'US_SHOE' ? 'US_SHOE' : 'APPAREL') as ItemSizeSystem;
    const preservedRaw = (sizeRaw || size || '').trim();
    const preservedNormalized = normalizeStructuredSize(preservedRaw);
    const hasPreservedSize = Boolean(preservedRaw);

    setSizeType(nextType);
    setSizeSystem(nextSystem);
    if (hasPreservedSize) {
      setSize(preservedRaw);
      setSizeRaw(preservedRaw);
      setSizeNormalized(preservedNormalized);
      if (!sizeScheme) {
        setSizeScheme(inferSizeScheme(preservedRaw) as ItemSizeScheme);
      }
    } else {
      setSize('');
      setSizeRaw('');
      setSizeNormalized('');
      setSizeScheme(undefined);
    }
    if (!fitBinTouched) {
      setFitBin(
        hasPreservedSize
          ? computeDefaultFitBin({
              sizeType: nextType,
              sizeNormalized: preservedNormalized,
              kid: selectedChild ?? {},
            })
          : 'unsure',
      );
    }
    const defaultSection = sizeUiModel.sizeType === 'shoe' ? 'SHOE' : 'AGE';
    setSizePickerSection(defaultSection);
  }, [category, clothingType, fitBinTouched, selectedChild, size, sizeRaw, sizeScheme, sizeUiModel.sizeSystem, sizeUiModel.sizeType]);

  useEffect(() => {
    if (sizeUiModel.sizeType === 'shoe' && !['SHOE', 'CUSTOM'].includes(sizePickerSection)) setSizePickerSection('SHOE');
    if (sizeUiModel.sizeType === 'apparel' && sizePickerSection === 'SHOE') setSizePickerSection('AGE');
  }, [sizeUiModel.sizeType, sizePickerSection]);

  useEffect(() => {
    if (quickMode && !existing && !size.trim() && defaultWearingSize) {
      applySizeValue(defaultWearingSize);
    }
  }, [quickMode, existing, size, defaultWearingSize, applySizeValue]);

  useEffect(() => {
    if (children.length === 1 && selectedChildIds[0] !== children[0]?.id) {
      setSelectedChildIds(children[0]?.id ? [children[0].id] : []);
    }
  }, [children, selectedChildIds]);

  useEffect(() => {
    if (shoppingMode && quickMode && !existing) {
      updateSettings({ lastShoppingType: clothingType, lastShoppingChildId: primaryChildId || undefined });
    }
  }, [shoppingMode, quickMode, existing, clothingType, primaryChildId]);

  useEffect(() => {
    const sanitized = sanitizeUrlInput(url);
    if (sanitized.polluted) {
      if (sanitized.value !== url) setUrl(sanitized.value);
      void logEvent('warning_url_input_polluted', { source: 'item_form', sanitized: Boolean(sanitized.value) });
      return;
    }

    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setPreviewCard({ status: 'idle' });
      if (autoUnfurlTimerRef.current) clearTimeout(autoUnfurlTimerRef.current);
      return;
    }

    if (!isProbablyHttpUrl(normalizedUrl)) {
      setPreviewCard({ status: 'idle' });
      if (autoUnfurlTimerRef.current) clearTimeout(autoUnfurlTimerRef.current);
      return;
    }

    void logEvent('unfurl_auto_detected', { url: normalizedUrl });
    setPreviewCard((prev) => (prev.status === 'success' && lastAutoSuccessUrlRef.current === normalizedUrl ? prev : { status: 'loading', domain: getDomainLabel(normalizedUrl) }));

    if (autoUnfurlTimerRef.current) clearTimeout(autoUnfurlTimerRef.current);

    const shouldImmediate = Boolean(deepLinkUrlRef.current) && deepLinkUrlRef.current === normalizedUrl && !lastAutoSuccessUrlRef.current;
    if (!shouldImmediate && (latestAutoRequestUrlRef.current === normalizedUrl || lastAutoSuccessUrlRef.current === normalizedUrl)) {
      return;
    }

    const kickoff = () => {
      latestAutoRequestUrlRef.current = normalizedUrl;
      void runPreviewFetch('auto');
    };

    if (shouldImmediate) {
      kickoff();
      return;
    }

    autoUnfurlTimerRef.current = setTimeout(kickoff, 650);
  }, [url, logEvent]);

  useEffect(() => {
    if (quickMode || existing || didAutofillPrint || printName.trim()) return;
    const suggestion = suggestPrintName(title, brand, brandTags);
    if (!suggestion) return;
    // Keep print name user-controlled; suggestions are shown below the field.
    setDidAutofillPrint(true);
  }, [quickMode, existing, didAutofillPrint, printName, title, brand, brandTags]);

  if (children.length === 0) {
    return (
      <Screen>
        <Text style={styles.message}>Add a kid first before adding clothing items.</Text>
      </Screen>
    );
  }

  const applyPreviewAutofill = async (preview: Awaited<ReturnType<typeof fetchLinkMetadata>>) => {
    const rawPreviewTitle = (preview.title || '').trim();
    const previewSite = (preview.siteName || '').trim();
    const previewDomain = getDomainLabel(preview.canonicalUrl || url || '');
    const weakTitle =
      !rawPreviewTitle ||
      rawPreviewTitle.length < 6 ||
      normalizeText(rawPreviewTitle) === normalizeText(previewSite || '') ||
      normalizeText(rawPreviewTitle).replace(/\s+/g, '') === normalizeText(previewDomain.replace(/\.[a-z]+$/, ''));
    const derivedKqTitle = (preview.canonicalUrl || url || '').includes('katequinn.com')
      ? kqSlugToTitle(preview.canonicalUrl || url || '')
      : undefined;
    const nextTitle = (weakTitle ? (derivedKqTitle || rawPreviewTitle) : rawPreviewTitle).trim();
    if (weakTitle && derivedKqTitle) {
      void logEvent('unfurl_kq_fallback_used', { kind: 'title', url: preview.canonicalUrl || url || '' });
    }
    const currentTitleTrim = title.trim();
    if (nextTitle && (!titleTouched || !currentTitleTrim || currentTitleTrim === 'New Item' || currentTitleTrim === autofillMetaRef.current.titleAutoValue)) {
      setTitle(nextTitle);
      autofillMetaRef.current.titleAutoValue = nextTitle;
    }

    const previewSourceUrl = preview.canonicalUrl || url || '';
    const fromMarketplace = isMarketplaceSource(previewSourceUrl, preview.sourceDomain, preview.siteName);
    const canonicalBrand = await canonicalizeBrand(preview.brand || null, previewSourceUrl || null, preview.siteName || null);
    const nextBrand = sanitizeAutofillBrand(
      (
        canonicalBrand?.brandName
        || (preview.brand || '').trim()
        || (fromMarketplace ? '' : (preview.siteName || '').trim())
        || (fromMarketplace ? '' : prettyBrandFallback(preview.brand || null, previewSourceUrl || null, preview.siteName || null))
      ).trim(),
      { isMarketplace: fromMarketplace },
    );
    if (nextBrand && (!brandTouched || !brand.trim() || brand.trim() === autofillMetaRef.current.brandAutoValue)) {
      setBrand(nextBrand);
      autofillMetaRef.current.brandAutoValue = nextBrand;
      if (!brandTags.trim()) setBrandTags(nextBrand);
    }

    const previewImages = (preview.imageUrls ?? [])
      .map((entry) => normalizeImageCandidate(entry))
      .filter(isValidHttpImageUrl)
      .slice(0, 6);
    const primaryImage = normalizeImageCandidate(preview.imageUrl || previewImages[0] || '');
    if (!preview.imageUrl && previewImages[0] && (preview.canonicalUrl || url || '').includes('katequinn.com')) {
      void logEvent('unfurl_kq_fallback_used', { kind: 'image', url: preview.canonicalUrl || url || '' });
    }
    const currentImageTouched = imageTouchedRef.current;
    const currentImageUrl = imageUrlRef.current.trim();
    if (primaryImage && (!currentImageTouched || !currentImageUrl || currentImageUrl === autofillMetaRef.current.imageAutoValue)) {
      const extras = previewImages.filter((entry) => entry !== primaryImage).slice(0, hasMultiPhotoAccess ? 5 : 0);
      syncPhotoFields([primaryImage, ...extras]);
      autofillMetaRef.current.imageAutoValue = primaryImage;
    }
  };

  const runPreviewFetch = async (mode: 'auto' | 'manual') => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      if (mode === 'manual') Alert.alert('URL required', 'Please paste a product URL first.');
      return;
    }
    if (!isProbablyHttpUrl(normalizedUrl)) {
      setPreviewCard({ status: 'error', domain: getDomainLabel(normalizedUrl), message: 'Couldn’t fetch preview' });
      if (mode === 'auto') {
        await logEvent('unfurl_auto_failed', { reason: 'invalid_url', url: normalizedUrl });
      }
      return;
    }

    if (mode === 'manual') {
      await logEvent('unfurl_manual_refresh_clicked', { url: normalizedUrl });
    } else {
      await logEvent('unfurl_auto_started', { url: normalizedUrl });
    }

    setIsFetchingPreview(true);
    setPreviewCard({ status: 'loading', domain: getDomainLabel(normalizedUrl) });
    try {
      const preview = await fetchLinkMetadata(normalizedUrl);
      await applyPreviewAutofill(preview);

      const canonical = (preview.canonicalUrl || '').trim();
      if (canonical && isProbablyHttpUrl(canonical) && canonical !== normalizedUrl && !route.params?.url) {
        setUrl(canonical);
      } else if (canonical && !isProbablyHttpUrl(canonical) && __DEV__) {
        console.warn('[ItemForm] ignoring non-http canonicalUrl from preview', canonical);
      }

      setPreviewCard({
        status: 'success',
        title:
          (
            (((preview.title || '').trim().length < 6 || normalizeText((preview.title || '').trim()) === normalizeText((preview.siteName || '').trim()))
              && (preview.canonicalUrl || normalizedUrl).includes('katequinn.com')
              ? kqSlugToTitle(preview.canonicalUrl || normalizedUrl)
              : undefined)
            || (preview.title || '').trim()
            || getDomainLabel(normalizedUrl)
            || 'Preview'
          ),
        domain: (preview.siteName || '').trim() || preview.sourceDomain || getDomainLabel(canonical || normalizedUrl),
        imageUrl: normalizeImageCandidate(preview.imageUrl || preview.imageUrls?.[0] || '') || undefined,
      });

      if (mode === 'auto') {
        lastAutoSuccessUrlRef.current = normalizedUrl;
        await logEvent('unfurl_auto_success', {
          url: normalizedUrl,
          fallback: Boolean(preview.isFallback),
          hadImage: Boolean(preview.imageUrl || preview.imageUrls?.[0]),
        });
      }
    } catch (error) {
      setPreviewCard({ status: 'error', domain: getDomainLabel(normalizedUrl), message: 'Couldn’t fetch preview' });
      if (mode === 'auto') {
        await logEvent('unfurl_auto_failed', {
          url: normalizedUrl,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    } finally {
      setIsFetchingPreview(false);
    }
  };

  const fetchPreview = async () => {
    await runPreviewFetch('manual');
  };

  const buildPayload = (overrides?: { brand?: string; storageLocationId?: string }) =>
    normalizeItemPayload({
      childIds: selectedChildIds,
      quickMode,
      title,
      url,
      brand,
      styleName,
      printName,
      brandTags: brand,
      imageUrl: photoUris[0] ?? '',
      extraImageUrls: photoUris.slice(1).join(', '),
      clothingTypeLabelFallback: clothingType,
      size,
      sizeNormalized,
      sizeType,
      sizeSystem,
      sizeScheme,
      sizeRaw,
      fitBin,
      fitBinTouched,
      category,
      storageLocationId: overrides?.storageLocationId ?? '',
      brandFit,
      kidFit,
      brandSizeNote,
      fabric,
      condition,
      status,
      purchasePrice,
      targetResalePrice,
      soldPrice,
      soldDate,
      tags,
      seasonTags,
      notes,
      quantity,
      printAliases,
      brandOverride: overrides?.brand,
    });

  const resolveStorageLocationIdForSave = async (): Promise<string> => {
    if (storagePreset === 'None') {
      return storagePresetTouched ? '' : (sourceChildLink?.storageLocationId ?? '');
    }
    if (!primaryChildId) return sourceChildLink?.storageLocationId ?? '';

    const config = getStorageConfigForPreset(storagePreset);
    const existingLocation = scopedStorageLocations.find((location) => {
      const preset = getStoragePresetForLocation(location);
      return preset === storagePreset && (!location.childId || location.childId === primaryChildId);
    });
    if (existingLocation?.id) return existingLocation.id;

    const created = await createStorageLocation({ childId: primaryChildId, name: config.name, type: config.type });
    return created?.id ?? '';
  };

  const getDuplicateCandidates = (): SimilarCandidate[] => {
    const draftTitle = normalizeText((quickMode ? (title.trim() || `${size.trim() || 'New'} ${category ? closetLabel[category] : clothingType}`) : title).trim());
    const normalizedBrand = normalizeText(brand || '');
    const normalizedPrint = resolvePrintName(printName, printAliases);
    const draftCategory = category;

    return items
      .filter((candidate) => {
        if (editing && candidate.id === editing) return false;
        if (normalizeText(candidate.size) !== normalizeText(size)) return false;
        if (candidate.status !== status) return false;
        if (candidate.clothingType !== clothingType) return false;
        return true;
      })
      .flatMap((candidate) => {
        if (draftCategory) {
          const candidateCategory = normalizeItemCategoryToClosetCategory(candidate.category);
          if (candidateCategory && candidateCategory !== draftCategory) return [];
        }
        const exactTitle = draftTitle && normalizeText(candidate.title) === draftTitle;
        const candidateBrand = normalizeText(candidate.brand || candidate.brandTags[0] || '');
        const sameBrand = !normalizedBrand || (candidateBrand && candidateBrand === normalizedBrand);
        if (exactTitle) {
          return [{ item: candidate, score: 1, reasons: sameBrand ? ['Exact same title', 'Same brand', 'Same size'] : ['Exact same title', 'Same size'] } satisfies SimilarCandidate];
        }

        if (!normalizedBrand || !normalizedPrint) return [];
        if (!candidateBrand || candidateBrand !== normalizedBrand) return [];
        const candidatePrint = candidate.printNameNorm || resolvePrintName(candidate.printName ?? '', printAliases);
        if (!candidatePrint || candidatePrint !== normalizedPrint) return [];
        return [{ item: candidate, score: 0.96, reasons: ['Same brand', 'Same category', 'Same print', 'Same size'] } satisfies SimilarCandidate];
      })
      .slice(0, 3);
  };

  const completeSave = async (addAnother: boolean) => {
    const goToWishlistHome = () => {
      const parentNav = navigation.getParent() as { navigate?: (name: string, params?: Record<string, unknown>) => void } | undefined;
      if (parentNav?.navigate) {
        parentNav.navigate('Wishlist', {
          screen: 'ItemsList',
          params: { initialStatus: 'wishlist', hideInbox: true },
        });
        return;
      }
      navigation.replace('ItemsList' as never, { initialStatus: 'wishlist', hideInbox: true } as never);
    };
    const closeItemForm = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      goToWishlistHome();
    };
    const maybeCacheSavedImage = async (itemId: string, candidateUrl?: string) => {
      const normalized = (candidateUrl || '').trim();
      if (!/^https?:\/\//i.test(normalized)) return;
      try {
        const cached = await cacheRemoteImage(itemId, normalized);
        if (cached) await updateItemCachedImage(itemId, cached);
      } catch (error) {
        if (__DEV__) console.warn('[ItemForm] image cache failed after save', { itemId, url: normalized }, error);
      }
    };

    let effectiveBrand = brand.trim();
    const shouldNormalizeBrandOnSave = Boolean(effectiveBrand) && (!brandTouched || effectiveBrand === (autofillMetaRef.current.brandAutoValue ?? '').trim());
    if (shouldNormalizeBrandOnSave) {
      const canonicalBrand = await canonicalizeBrand(effectiveBrand || null, url || null, null);
      if (canonicalBrand?.brandName && canonicalBrand.brandName !== effectiveBrand) {
        effectiveBrand = canonicalBrand.brandName;
        setBrand(canonicalBrand.brandName);
        autofillMetaRef.current.brandAutoValue = canonicalBrand.brandName;
      }
    }

    const resolvedStorageLocationId = await resolveStorageLocationIdForSave();
    const payload = buildPayload({ brand: effectiveBrand || undefined, storageLocationId: resolvedStorageLocationId });
    if (brandFit) await logEvent('item_form_field_used_brand_fit', { value: brandFit });
    if (kidFit) await logEvent('item_form_field_used_kid_fit', { value: kidFit });
    if (sizeNormalized.trim() || brandSizeNote.trim() || existing?.fitRating || existing?.fitException) {
      await logEvent('item_form_saved_with_deprecated_fields', {
        hasSizeNormalized: Boolean(sizeNormalized.trim()),
        hasBrandSizeNote: Boolean(brandSizeNote.trim()),
        hasFitRating: Boolean(existing?.fitRating),
        hasFitException: Boolean(existing?.fitException),
      });
    }
    if (existing) {
      await updateItem(existing.id, payload);
      await maybeCacheSavedImage(existing.id, payload.imageUrl);
      await recordMeaningfulActionAndMaybePrompt('item_updated', 'item_form_update');
      navigation.replace('ItemDetail', { itemId: existing.id });
      return;
    }

    const created = await addItem(payload);
    if (created) {
      await maybeCacheSavedImage(created.id, payload.imageUrl);
    }

    if (status === 'wishlist' && size.trim()) {
      const awareness = getWishlistAwareness(items, {
        childId: primaryChildId,
        clothingType: closetCategoryToClothingType(category),
        category,
        size,
      });
      const inventoryRealityThreshold = normalizeInventoryRealityThreshold(settings.inventoryRealityCheckOwnedThreshold);
      if (awareness.ownedCount >= inventoryRealityThreshold) {
        Alert.alert('Inventory Reality Check', `You already own ${awareness.ownedCount} ${category ? closetLabel[category] : clothingType} items in size ${size}.`);
      }
    }

    await logEvent('item_saved', { itemId: created?.id ?? null, quickMode, shoppingMode, addAnother });
    if (quickMode) {
      await logEvent('item_created_via', {
        createdVia: 'quick_add',
        childId: primaryChildId,
        status,
        itemId: created?.id ?? null,
      });
    }
    await recordMeaningfulActionAndMaybePrompt('item_saved', quickMode ? 'item_form_quick_save' : 'item_form_save');

    if (!addAnother) {
      if (status === 'wishlist' && created) {
        if (isWebImportFlow) {
          goToWishlistHome();
          return;
        }
        const hasMeaningfulDetails = Boolean(
          printName.trim() ||
            fabric.trim() ||
            notes.trim() ||
            tags.trim() ||
            seasonTags.trim() ||
            extraImageUrls.trim() ||
            (url.trim() && titleTouched) ||
            (brand.trim() && brandTouched) ||
            imageTouched,
        );

        if (!hasMeaningfulDetails) {
          Alert.alert('Saved to Wishlist', 'You can add details later.', [
            { text: 'Close', style: 'cancel', onPress: closeItemForm },
            { text: 'Add Details', onPress: () => navigation.replace('ItemDetail', { itemId: created.id }) },
          ]);
          return;
        }

        Alert.alert('Saved to Wishlist', 'Saved.', [{ text: 'OK', onPress: closeItemForm }]);
        return;
      }
      if (status === 'owned' && created && (shoppingMode || route.params?.prefillStatus === 'owned')) {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        const parent = navigation.getParent() as { navigate?: (screen: string, params?: Record<string, unknown>) => void } | undefined;
        if (parent) {
          parent.navigate?.('ClosetHome', { revealLatestAdd: true });
        } else {
          navigation.goBack();
        }
        return;
      }
      navigation.goBack();
      return;
    }

    setTitle('');
    setTitleTouched(false);
    setUrl('');
    setBrand('');
    setBrandTouched(false);
    setPrintName('');
    setBrandTags('');
    setImageUrl('');
    setImageTouched(false);
    setExtraImageUrls('');
    setSize(defaultWearingSize || '');
    setSizeRaw(defaultWearingSize || '');
    setSizeNormalized('');
    setSizeType(undefined);
    setSizeSystem(undefined);
    setSizeScheme(undefined);
    setFitBinTouched(false);
    setFitBin(
      computeDefaultFitBin({
        sizeType: sizeUiModel.sizeType,
        sizeNormalized: normalizeStructuredSize(defaultWearingSize || ''),
        kid: selectedChild ?? {},
      }),
    );
    setBrandSizeNote('');
    setFabric('');
    setBrandFit(undefined);
    setKidFit('unknown');
    setPurchasePrice('');
    setTargetResalePrice('');
    setSoldPrice('');
    setSoldDate('');
    setNotes('');
    setTags('');
    setSeasonTags('');
    setQuantity(1);
    setCategory(undefined);
    setDidAutofillPrint(false);
    setPreviewCard({ status: 'idle' });
    latestAutoRequestUrlRef.current = '';
    lastAutoSuccessUrlRef.current = '';
    autofillMetaRef.current = {};
    if (children.length === 1 && children[0]?.id) setSelectedChildIds([children[0].id]);
  };

  const attemptSave = async (addAnother: boolean) => {
    try {
      if (selectedChildIds.length === 0) {
        Alert.alert('Missing Fields', 'Please choose at least one kid.');
        return;
      }

      if (!quickMode && !title.trim()) {
        Alert.alert('Missing Fields', 'Please enter a title.');
        return;
      }

      if (!category) {
        Alert.alert('Missing Fields', 'Please choose a category.');
        return;
      }

      if (!size.trim()) {
        Alert.alert('Missing Fields', 'Please add a size.');
        return;
      }

      if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
        Alert.alert('Invalid URL', 'URL must start with http:// or https://');
        return;
      }

      validateNewItemInput({
        title: (quickMode ? (title.trim() || `${size.trim() || 'New'} ${category ? closetLabel[category] : 'Item'}`) : title).trim(),
        clothingType,
        status,
        category,
        size,
        quantity,
      });

      if (!existing) {
        if (quantity === 1) {
          const highConfidence = getDuplicateCandidates();
          if (highConfidence.length > 0) {
            setDuplicateCandidates(highConfidence);
            setDuplicateModalMessage('These look close to what you are adding.');
            setPendingAddAnother(addAnother);
            setShowDuplicateModal(true);
            await logEvent('duplicate_warn_shown', {
              childId: primaryChildId,
              clothingType,
              size,
              candidateIds: highConfidence.map((entry) => entry.item.id),
            });
            return;
          }
        }
      }

      await completeSave(addAnother);
    } catch (error) {
      if (__DEV__) console.error('[ItemForm] save failed', { editing, quickMode, addAnother, childId: primaryChildId, clothingType, status }, error);
      void logEvent('item_save_failed', {
        editing: Boolean(editing),
        quickMode,
        addAnother,
        childId: primaryChildId || null,
        status,
        message: error instanceof Error ? error.message : 'unknown',
      }).catch(() => undefined);
      Alert.alert('Save Failed', error instanceof Error ? error.message : 'Could not save item. Please try again.');
    }
  };

  const chooseImageFromLibrary = async () => {
    if (!hasMultiPhotoAccess && photoUris.length >= 1) {
      openPhotoPaywall();
      return;
    }
    Alert.alert('Add Item Photo', 'Choose a photo source', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Photos',
        onPress: () => {
          void (async () => {
            const asset = await pickPhotoFromLibrary();
            if (!asset?.uri) return;
            if (__DEV__) console.log('[ItemForm] picked photo', asset);
            const persistentUri = await persistLocalImage(asset.uri);
            syncPhotoFields([...photoUris, persistentUri]);
            await trackItemPhotoAdded(logEvent, {
              itemId: editing || undefined,
              itemCount: photoUris.length + 1,
              isPro: hasMultiPhotoAccess,
              triggeredFrom: 'item_form_library',
            });
          })();
        },
      },
      {
        text: 'Camera',
        onPress: () => {
          void (async () => {
            const asset = await takePhotoWithCamera();
            if (!asset?.uri) return;
            if (__DEV__) console.log('[ItemForm] captured photo', asset);
            const persistentUri = await persistLocalImage(asset.uri);
            syncPhotoFields([...photoUris, persistentUri]);
            await trackItemPhotoAdded(logEvent, {
              itemId: editing || undefined,
              itemCount: photoUris.length + 1,
              isPro: hasMultiPhotoAccess,
              triggeredFrom: 'item_form_camera',
            });
          })();
        },
      },
    ]);
  };

  const printSuggestions = useMemo(() => {
    if (quickMode || !showPrintSuggestions) return [];
    const query = debouncedPrintQuery;
    if (!query) return [];
    const normalizedQuery = resolvePrintName(query, printAliases) || normalizePrintName(query);

    const candidatePool = items
      .filter((item) => item.id !== editing)
      .filter((item) => item.childIds.includes(primaryChildId))
      .filter((item) =>
        brand.trim()
          ? item.brandTags.includes(brand.trim()) || (item.brand ?? '').toLowerCase().trim() === brand.toLowerCase().trim()
          : true,
      )
      .map((item) => {
        const canonical = item.printNameNorm || resolvePrintName(item.printName ?? '', printAliases);
        return canonical;
      })
      .filter(Boolean);

    const uniqueCanonicals = Array.from(new Set(candidatePool));
    return uniqueCanonicals
      .map((canonical) => ({
        canonical,
        score: jaccardTokenOverlap(query, canonical),
      }))
      .filter((entry) => entry.canonical !== normalizedQuery)
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [quickMode, showPrintSuggestions, debouncedPrintQuery, items, editing, primaryChildId, brand, printAliases]);
  const topPrintSuggestion = printSuggestions[0];

  return (
    <Screen>
      {!existing ? (
        <Pressable onPress={() => setQuickMode((prev) => !prev)}>
          <Text style={styles.modeSwitch}>{quickMode ? 'Switch to Detailed View' : 'Switch to Simple View'}</Text>
        </Pressable>
      ) : null}

      <>
        {(!existing || !quickMode) ? (
          <>
          <FormInput
            label="Paste a product and we'll fill in the details"
            value={url}
            onChangeText={(value) => {
              const sanitized = sanitizeUrlInput(value);
              if (sanitized.polluted) {
                void logEvent('warning_url_input_polluted', { source: 'item_form_on_change', sanitized: Boolean(sanitized.value) });
              }
              setUrl(sanitized.value !== value ? sanitized.value : value);
            }}
            autoCapitalize="none"
            placeholder="https://... (optional)"
          />
          <Text style={styles.urlTip}>URL is optional. You can also enter details manually below.</Text>
          <Text style={styles.urlTip}>Tip: You can also add items directly from your browser using the Share button.</Text>
          {(previewCard.status === 'loading' || previewCard.status === 'success' || previewCard.status === 'error') ? (
            <Card>
              {previewCard.status === 'loading' ? (
                <View style={styles.previewCard}>
                  <View style={styles.previewImageSkeleton} />
                  <View style={styles.previewTextCol}>
                    <View style={styles.previewLineSkeleton} />
                    <View style={styles.previewLineSkeletonShort} />
                    <Text style={styles.previewDomain}>{previewCard.domain || 'Loading preview...'}</Text>
                  </View>
                </View>
              ) : previewCard.status === 'success' ? (
                <View style={styles.previewCard}>
                  <RemoteImage uri={previewCard.imageUrl} style={styles.previewImage} fallbackLabel={previewCard.status === 'success' ? previewCard.title : 'Preview'} />
                  <View style={styles.previewTextCol}>
                    <Text style={styles.previewTitle} numberOfLines={2} ellipsizeMode="tail">{previewCard.title}</Text>
                    <Text style={styles.previewDomain} numberOfLines={1} ellipsizeMode="middle">{previewCard.domain}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.previewCard}>
                  <View style={styles.previewImageSkeleton} />
                  <View style={styles.previewTextCol}>
                    <Text style={styles.previewError}>Couldn’t fetch preview</Text>
                    <Pressable onPress={() => void fetchPreview()}>
                      <Text style={styles.previewRetry}>Retry</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Card>
          ) : null}
          <PrimaryButton
            label={isFetchingPreview ? 'Refreshing...' : 'Refresh Preview'}
            onPress={() => {
              if (isFetchingPreview) return;
              return fetchPreview();
            }}
            variant="secondary"
          />
          </>
        ) : null}

        {!quickMode ? (
          <>
          <FormInput
            label="Title"
            value={title}
            onChangeText={(value) => {
              setTitleTouched(true);
              setTitle(value);
            }}
            placeholder="Auto-filled after preview"
          />
          <FormInput
            label="Brand"
            value={brand}
            onChangeText={(value) => {
              setBrandTouched(true);
              setBrand(value);
            }}
            placeholder="Auto-filled after preview"
          />
          <FormInput
            label="Style Name (optional)"
            value={styleName}
            onChangeText={setStyleName}
            placeholder="e.g. Pocket Tee"
          />
          <FormInput
            label="Print Name (optional)"
            value={printName}
            onChangeText={(value) => {
              setPrintName(value);
              setDidAutofillPrint(true);
              setShowPrintSuggestions(true);
            }}
            placeholder="e.g. Blueberries"
          />
          {printSuggestions.length > 0 ? (
            <View style={styles.suggestionWrap}>
              {topPrintSuggestion && topPrintSuggestion.score >= 0.7 ? (
                <Text style={styles.suggestionTitle}>Did You Mean: {topPrintSuggestion.canonical}?</Text>
              ) : (
                <Text style={styles.suggestionTitle}>Suggestions</Text>
              )}
              {printSuggestions.map((entry) => (
                <Pressable
                  key={entry.canonical}
                  style={styles.suggestionPill}
                  onPress={() => {
                    setPrintName(entry.canonical);
                    setShowPrintSuggestions(false);
                  }}
                >
                  <Text style={styles.suggestionText}>{entry.canonical}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable onPress={() => setShowAdvancedMediaFields((prev) => !prev)}>
            <Text style={styles.modeSwitch}>{showAdvancedMediaFields ? 'Hide Advanced Image Fields' : 'Show Advanced Image Fields'}</Text>
          </Pressable>
          {showAdvancedMediaFields ? (
            <>
              <FormInput
                label="Image URL"
                value={imageUrl}
                onChangeText={(value) => {
                  syncPhotoFields([value, ...photoUris.slice(1)]);
                }}
                placeholder="Optional"
                autoCapitalize="none"
              />
              {hasMultiPhotoAccess ? (
                <FormInput
                  label="More image URLs (comma-separated)"
                  value={extraImageUrls}
                  onChangeText={setExtraImageUrls}
                  placeholder="https://..., https://..."
                  autoCapitalize="none"
                />
              ) : (
                <Pressable onPress={openPhotoPaywall}>
                  <Text style={styles.urlTip}>Add more photos</Text>
                  <Text style={styles.urlTipSecondary}>{settings.proEarlyAccessJoined ? 'Early access joined' : 'Pro feature'}</Text>
                </Pressable>
              )}
            </>
          ) : null}
          </>
        ) : null}
      </>

      <ItemPhotoGallery
        photoUris={photoUris}
        canAddMore={hasMultiPhotoAccess || photoUris.length === 0}
        onAddPhoto={() => void chooseImageFromLibrary()}
        onLockedPress={openPhotoPaywall}
        lockedJoined={Boolean(settings.proEarlyAccessJoined)}
        onMakePrimary={(index) => {
          const next = [...photoUris];
          const [chosen] = next.splice(index, 1);
          next.unshift(chosen);
          syncPhotoFields(next);
          void trackItemPhotoReordered(logEvent, {
            itemId: editing || undefined,
            itemCount: next.length,
            isPro: hasMultiPhotoAccess,
            triggeredFrom: 'item_form',
          });
        }}
        onRemove={(index) => {
          const next = photoUris.filter((_, entryIndex) => entryIndex !== index);
          syncPhotoFields(next);
          void trackItemPhotoRemoved(logEvent, {
            itemId: editing || undefined,
            itemCount: next.length,
            isPro: hasMultiPhotoAccess,
            triggeredFrom: 'item_form',
          });
        }}
      />

      {children.length === 1 ? (
        <Text style={styles.assignmentMeta}>Assigned to {children[0]?.name}</Text>
      ) : (
        <ChipSelector
          label="Kids"
          options={children.map((entry) => entry.name)}
          selectedValues={children.filter((entry) => selectedChildIds.includes(entry.id)).map((entry) => entry.name)}
          onChange={(name) => {
            const nextId = children.find((entry) => entry.name === name)?.id;
            if (!nextId) return;
            setSelectedChildIds((current) => (
              current.includes(nextId)
                ? current.filter((entry) => entry !== nextId)
                : [...current, nextId]
            ));
          }}
        />
      )}
      <View style={styles.quantityRow}>
        <Text style={styles.quantityLabel}>Quantity</Text>
        <View style={styles.quantityControls}>
          <Pressable style={styles.quantityButton} onPress={() => setQuantity((current) => Math.max(1, current - 1))}>
            <Text style={styles.quantityButtonText}>-</Text>
          </Pressable>
          <Text style={styles.quantityValue}>{quantity}</Text>
          <Pressable style={styles.quantityButton} onPress={() => setQuantity((current) => Math.min(30, current + 1))}>
            <Text style={styles.quantityButtonText}>+</Text>
          </Pressable>
        </View>
      </View>
      {selectedChildIds.length > 1 && quantity < selectedChildIds.length ? (
        <Text style={styles.assignmentWarning}>Quantity is lower than the number of assigned children.</Text>
      ) : null}
      <ChipSelector
        label="Category"
        options={categoryOptions.map((entry) => closetLabel[entry])}
        value={category ? closetLabel[category] : undefined}
        onChange={(label) => setCategory(categoryOptions.find((entry) => closetLabel[entry] === label))}
      />
        <ChipSelector label="Status" options={statusOptions} value={status} onChange={setStatus} />
      {showLocationFeatures ? (
        <ChipSelector
          label="Storage Location (optional)"
          options={[...storagePresetOptions]}
          value={storagePreset}
          onChange={(label) => {
            setStoragePresetTouched(true);
            setStoragePreset(label);
          }}
        />
      ) : null}

      <ChipSelector
        label={sizeUiModel.sizeType === 'shoe' ? 'Shoe Size Type' : 'Size Type'}
        options={sizePickerSectionOptions.map((section) => section.title)}
        value={sizePickerSectionOptions.find((section) => section.key === sizePickerSection)?.title}
        onChange={(title) => {
          const next = sizePickerSectionOptions.find((section) => section.title === title);
          if (!next) return;
          setSizePickerSection(next.key);
        }}
      />
      {sizePickerSection !== 'CUSTOM' && (
        <View style={styles.sizeGrid}>
          {(sizePickerSectionOptions.find((section) => section.key === sizePickerSection)?.options ?? []).slice(0, 20).map((choice) => (
            <Pressable
              key={`structured-size-${sizePickerSection}-${choice}`}
              style={[styles.suggestionPill, normalizeText(size) === normalizeText(choice) ? styles.sizeChoiceActive : null]}
              onPress={() => applySizeValue(choice, sizePickerSection === 'SHOE' ? 'SHOE' : sizePickerSection)}
            >
              <Text style={[styles.suggestionText, normalizeText(size) === normalizeText(choice) ? styles.sizeChoiceTextActive : null]}>{choice}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <FormInput
        label={sizeUiModel.sizeType === 'shoe' ? 'Shoe size' : 'Size'}
        value={size}
        onChangeText={(value) => applySizeValue(value, sizePickerSection === 'SHOE' ? 'SHOE' : sizePickerSection === 'CUSTOM' ? 'CUSTOM' : undefined)}
        placeholder={defaultWearingSize ? `e.g. ${defaultWearingSize}` : (sizeUiModel.sizeType === 'shoe' ? 'e.g. 10C' : 'e.g. 5T')}
      />
      {(childCurrentSizeText || childNextSizeText || suggestedSizeChoices.length > 0) ? (
        <View style={styles.suggestionWrap}>
          {(childCurrentSizeText || childNextSizeText) ? (
            <View style={styles.sizePinnedWrap}>
              {childCurrentSizeText ? (
                <Pressable
                  style={[styles.suggestionPill, normalizeText(size) === normalizeText(childCurrentSizeText) ? styles.sizeChoiceActive : null]}
                  onPress={() => applySizeValue(childCurrentSizeText)}
                >
                  <Text style={[styles.suggestionText, normalizeText(size) === normalizeText(childCurrentSizeText) ? styles.sizeChoiceTextActive : null]}>
                    Now: {childCurrentSizeText}
                  </Text>
                </Pressable>
              ) : null}
              {childNextSizeText ? (
                <Pressable
                  style={[styles.suggestionPill, normalizeText(size) === normalizeText(childNextSizeText) ? styles.sizeChoiceActive : null]}
                  onPress={() => applySizeValue(childNextSizeText)}
                >
                  <Text style={[styles.suggestionText, normalizeText(size) === normalizeText(childNextSizeText) ? styles.sizeChoiceTextActive : null]}>
                    Next: {childNextSizeText}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View style={styles.sizeGrid}>
            {suggestedSizeChoices
              .filter((choice) => normalizeText(choice) !== normalizeText(childCurrentSizeText || '') && normalizeText(choice) !== normalizeText(childNextSizeText || ''))
              .slice(0, 6)
              .map((choice) => (
                <Pressable
                  key={`inline-size-${choice}`}
                  style={[styles.suggestionPill, normalizeText(size) === normalizeText(choice) ? styles.sizeChoiceActive : null]}
                  onPress={() => applySizeValue(choice)}
                >
                  <Text style={[styles.suggestionText, normalizeText(size) === normalizeText(choice) ? styles.sizeChoiceTextActive : null]}>{choice}</Text>
                </Pressable>
              ))}
          </View>
        </View>
      ) : null}
      <PrimaryButton label="More Sizes" variant="secondary" onPress={() => setShowSizePickerModal(true)} />
      <ChipSelector
        label="Fit Bin"
        options={fitBinOptions.map((option) => fitBinLabels[option])}
        value={fitBinLabels[fitBin]}
        onChange={(label) => {
          const next = fitBinOptions.find((option) => fitBinLabels[option] === label);
          if (!next) return;
          setFitBin(next);
          setFitBinTouched(true);
        }}
      />

      {!quickMode ? (
        <>
          {status !== 'wishlist' ? (
            <>
              <ChipSelector
                label="Runs"
                options={brandFitLabels}
                value={brandFitOptions.find((option) => option.value === brandFit)?.label}
                onChange={(label) => setBrandFit(brandFitOptions.find((option) => option.label === label)?.value)}
              />
              <ChipSelector
                label={primaryChildId ? `Fit on ${children.find((entry) => entry.id === primaryChildId)?.name ?? 'Kid'}` : 'Fit on kid'}
                options={kidFitLabels}
                value={kidFitOptions.find((option) => option.value === kidFit)?.label}
                onChange={(label) => setKidFit(kidFitOptions.find((option) => option.label === label)?.value)}
              />
              <FormInput label="Notes (optional)" value={brandSizeNote} onChangeText={setBrandSizeNote} placeholder="e.g. runs long" />
              <FormInput label="Fabric (optional)" value={fabric} onChangeText={setFabric} placeholder="e.g. cotton rib, bamboo modal" />
            </>
          ) : null}
          {status !== 'wishlist' ? (
            <FormInput label="Purchase Price (optional)" value={purchasePrice} onChangeText={setPurchasePrice} placeholder="e.g. 24.99" keyboardType="decimal-pad" />
          ) : null}
          {(storagePreset === 'Sell' || status === 'sold') ? (
            <>
              <FormInput
                label="Target Resale Price"
                value={targetResalePrice}
                onChangeText={setTargetResalePrice}
                placeholder="e.g. 18.00"
                keyboardType="decimal-pad"
              />
              {status === 'sold' ? (
                <>
                  <FormInput label="Sold Price" value={soldPrice} onChangeText={setSoldPrice} placeholder="e.g. 15.00" keyboardType="decimal-pad" />
                  <FormInput label="Sold Date" value={soldDate} onChangeText={setSoldDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
                </>
              ) : null}
            </>
          ) : null}
          {status !== 'wishlist' ? <ChipSelector label="Condition" options={conditionOptions} value={condition} onChange={setCondition} /> : null}
          <FormInput label="Tags (comma-separated)" value={tags} onChangeText={setTags} placeholder="casual, school" />
          <FormInput label="Season Tags" value={seasonTags} onChangeText={setSeasonTags} placeholder="winter, summer" />
        </>
      ) : null}

      <FormInput label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

      <PrimaryButton label={existing ? 'Save Changes' : 'Save Item'} onPress={() => void attemptSave(false)} />
      {!existing && quickMode ? <PrimaryButton label="Save & Add Another" variant="secondary" onPress={() => void attemptSave(true)} /> : null}

      <Modal visible={showDuplicateModal} transparent animationType="fade" onRequestClose={() => setShowDuplicateModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Similar Items Found</Text>
            <Text style={styles.modalText}>{duplicateModalMessage}</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {duplicateCandidates.map((entry) => {
                const thumb = entry.item.cachedImageUri || entry.item.imageUrls[0] || entry.item.imageUrl;
                return (
                  <Pressable
                    key={entry.item.id}
                    style={styles.similarRow}
                    onPress={async () => {
                      await logEvent('duplicate_warn_action', { action: 'open_existing', existingId: entry.item.id });
                      setShowDuplicateModal(false);
                      navigation.replace('ItemDetail', { itemId: entry.item.id });
                    }}
                  >
                    {thumb ? <Image source={{ uri: thumb }} style={styles.similarThumb} /> : <View style={styles.similarThumbPlaceholder} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.similarTitle}>{entry.item.title}</Text>
                      <Text style={styles.similarMeta}>{entry.item.size} • {formatItemCategoryLabel(entry.item)}</Text>
                      <Text style={styles.similarMeta}>Why: {entry.reasons.join(' + ')}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <PrimaryButton
              label="Keep Anyway"
              onPress={async () => {
                await logEvent('duplicate_warn_action', { action: 'keep_anyway' });
                setShowDuplicateModal(false);
                await completeSave(pendingAddAnother);
              }}
            />
            <PrimaryButton
              label="Cancel"
              variant="secondary"
              onPress={async () => {
                await logEvent('duplicate_warn_action', { action: 'cancel' });
                setShowDuplicateModal(false);
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showSizePickerModal} transparent animationType="fade" onRequestClose={() => setShowSizePickerModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pick Common Size</Text>
            {(childCurrentSizeText || childNextSizeText) ? (
              <View style={styles.sizePinnedWrap}>
                {childCurrentSizeText ? (
                  <Pressable
                    style={styles.suggestionPill}
                    onPress={() => {
                      applySizeValue(childCurrentSizeText);
                      setShowSizePickerModal(false);
                    }}
                  >
                    <Text style={styles.suggestionText}>Now: {childCurrentSizeText}</Text>
                  </Pressable>
                ) : null}
                {childNextSizeText ? (
                  <Pressable
                    style={styles.suggestionPill}
                    onPress={() => {
                      applySizeValue(childNextSizeText);
                      setShowSizePickerModal(false);
                    }}
                  >
                    <Text style={styles.suggestionText}>Next: {childNextSizeText}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              <View style={styles.sizeGrid}>
                {suggestedSizeChoices.map((choice) => (
                  <Pressable
                    key={`size-${choice}`}
                    style={[styles.suggestionPill, normalizeText(size) === normalizeText(choice) ? styles.sizeChoiceActive : null]}
                    onPress={() => {
                      applySizeValue(choice);
                      setShowSizePickerModal(false);
                    }}
                  >
                    <Text style={[styles.suggestionText, normalizeText(size) === normalizeText(choice) ? styles.sizeChoiceTextActive : null]}>{choice}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <PrimaryButton label="Close" variant="secondary" onPress={() => setShowSizePickerModal(false)} />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPhotoEarlyAccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowPhotoEarlyAccessModal(false);
          setPhotoEarlyAccessJoinedThisSession(false);
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setShowPhotoEarlyAccessModal(false);
            setPhotoEarlyAccessJoinedThisSession(false);
          }}
        >
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>{photoEarlyAccessJoinedThisSession ? 'You’re on the list' : 'Get early access to Pro'}</Text>
            {photoEarlyAccessJoinedThisSession ? (
              <Text style={styles.modalText}>We’ll let you know when Pro is ready.</Text>
            ) : (
              <>
                <Text style={styles.modalText}>Be the first to unlock:</Text>
                <Text style={styles.modalBullet}>• BST post builder (coming soon)</Text>
                <Text style={styles.modalBullet}>• More photos per item</Text>
                <Text style={styles.modalBullet}>• Custom categories</Text>
                <Text style={styles.modalBullet}>• And more features coming soon</Text>
                <Text style={styles.modalFooter}>We’ll let you know as soon as it’s ready.</Text>
                <PrimaryButton label="Join early access" onPress={() => void joinPhotoEarlyAccess()} />
                <PrimaryButton
                  label="Not now"
                  variant="secondary"
                  onPress={() => {
                    setShowPhotoEarlyAccessModal(false);
                    setPhotoEarlyAccessJoinedThisSession(false);
                  }}
                />
              </>
            )}
            {photoEarlyAccessJoinedThisSession ? (
              <PrimaryButton
                label="Done"
                onPress={() => {
                  setShowPhotoEarlyAccessModal(false);
                  setPhotoEarlyAccessJoinedThisSession(false);
                }}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  modeSwitch: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    fontSize: 16,
    color: '#374151',
  },
  assignmentMeta: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '600',
  },
  assignmentWarning: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  quantityLabel: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '600',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  quantityButtonText: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '700',
  },
  quantityValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalText: {
    color: '#4b5563',
    fontSize: 13,
  },
  modalBullet: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  modalFooter: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  similarRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 6,
  },
  similarThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  similarThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  similarTitle: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  similarMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  suggestionWrap: {
    gap: 6,
  },
  sizePinnedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionTitle: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '700',
  },
  suggestionPill: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
  },
  suggestionText: {
    fontSize: 12,
    color: '#1f2937',
    fontWeight: '600',
  },
  sizeChoiceActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#c7d2fe',
  },
  sizeChoiceTextActive: {
    color: '#3730a3',
  },
  previewCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  previewTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  previewImageSkeleton: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
  },
  previewLineSkeleton: {
    height: 14,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    width: '90%',
  },
  previewLineSkeletonShort: {
    height: 12,
    borderRadius: 8,
    backgroundColor: '#eef0f3',
    width: '55%',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  previewDomain: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  previewError: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '600',
  },
  previewRetry: {
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '700',
  },
  urlTip: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: -6,
    marginBottom: 6,
  },
  urlTipSecondary: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: -2,
    marginBottom: 6,
    fontWeight: '600',
  },
});
