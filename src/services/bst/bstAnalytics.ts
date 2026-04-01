import { capturePostHogEvent } from '@/services/analytics/posthog';

type AnalyticsLogger = (type: string, payload?: Record<string, unknown>) => Promise<void>;

type BstAnalyticsMetadata = {
  draftId?: string;
  itemId?: string;
  itemCount?: number;
  generatedCardCount?: number;
  generatedCollageCount?: number;
  remainingFreeCards?: number;
  selectedFreeCardCount?: number;
  isPro?: boolean;
  triggeredFrom?: string;
  productId?: string;
  packageIdentifier?: string;
  source?: string;
  trigger?: 'card_limit' | 'second_draft' | 'photo_limit' | 'manual_upgrade';
  assetType?: string;
  copyType?: string;
  reason?: string;
};

export const resolvePaywallTrigger = (
  source?: string,
): 'card_limit' | 'second_draft' | 'photo_limit' | 'manual_upgrade' => {
  switch (source) {
    case 'bst_card_limit':
      return 'card_limit';
    case 'bst_draft_limit':
      return 'second_draft';
    case 'item_multi_photo':
      return 'photo_limit';
    default:
      return 'manual_upgrade';
  }
};

const safeTrack = async (logEvent: AnalyticsLogger, type: string, metadata?: BstAnalyticsMetadata): Promise<void> => {
  const normalizedMetadata = metadata?.source && !metadata.trigger
    ? { ...metadata, trigger: resolvePaywallTrigger(metadata.source) }
    : metadata;

  console.log(`[BST_ANALYTICS] ${type}`, normalizedMetadata ?? {});
  void capturePostHogEvent(type, normalizedMetadata);
  try {
    await logEvent(type, normalizedMetadata);
  } catch {
    // Analytics should never block the main user flow.
  }
};

export const trackSellBinOpened = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'sell_bin_opened', metadata);

export const trackBstCreateStarted = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_create_started', metadata);

export const trackBstDraftCreated = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_draft_created', metadata);

export const trackBstDraftDeleted = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_draft_deleted', metadata);

export const trackBstDraftArchived = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_draft_archived', metadata);

export const trackBstPreviewOpened = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_preview_opened', metadata);

export const trackBstCollageGenerated = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_collage_generated', metadata);

export const trackBstItemCardGenerated = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_item_card_generated', metadata);

export const trackBstItemCardGeneratedCount = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_item_card_generated_count', metadata);

export const trackBstListingTextCopied = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_listing_text_copied', metadata);

export const trackBstExportShared = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_export_shared', metadata);

export const trackBstCardLimitHit = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_card_limit_hit', metadata);

export const trackBstSecondDraftBlocked = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'bst_second_draft_blocked', metadata);

export const trackSecondPhotoLimitHit = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'second_photo_limit_hit', metadata);

export const trackProPaywallViewed = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'pro_paywall_viewed', metadata);

export const trackProPurchaseStarted = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'pro_purchase_started', metadata);

export const trackProPurchaseCompleted = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'pro_purchase_completed', metadata);

export const trackProPurchaseRestored = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'pro_purchase_restored', metadata);

export const trackProPurchaseFailed = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'pro_purchase_failed', metadata);

export const trackItemPhotoAdded = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'item_photo_added', metadata);

export const trackItemPhotoRemoved = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'item_photo_removed', metadata);

export const trackItemPhotoReordered = (logEvent: AnalyticsLogger, metadata: BstAnalyticsMetadata) =>
  safeTrack(logEvent, 'item_photo_reordered', metadata);
