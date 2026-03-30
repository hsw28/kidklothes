// Centralized review thresholds so prompt timing can be tuned without touching
// service logic. The 7-day gate prevents prompting brand-new users too early.
export const REVIEW_PROMPT_THRESHOLDS = {
  minSessions: 5,
  minActiveDays: 3,
  minMeaningfulActions: 5,
  minDaysSinceFirstUse: 7,
} as const;

// Cooldowns are intentionally long to keep the UX respectful and avoid fatigue.
export const REVIEW_PROMPT_COOLDOWNS = {
  deferredMs: 30 * 24 * 60 * 60 * 1000,
  dismissedMs: 90 * 24 * 60 * 60 * 1000,
} as const;

export const REVIEW_PROMPT_STATE_ID = 1;
export const REVIEW_PROMPT_MAX_ACTIVE_DAYS = 365;
export const REVIEW_PROMPT_MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ReviewPromptActionType =
  | 'item_saved'
  | 'item_updated'
  | 'quick_save'
  | 'batch_add_saved'
  | 'drawer_scan_saved'
  | 'bulk_status_updated'
  | 'bulk_tag_applied'
  | 'bulk_child_assigned'
  | 'items_archived'
  | 'item_marked_worn'
  | 'wishlist_item_purchased'
  | 'resale_target_saved'
  | 'shopping_check_completed';

export type ReviewPromptActionCategory =
  | 'item_management'
  | 'batch_management'
  | 'closet_organizing'
  | 'closet_care'
  | 'shopping_task';

export type ReviewPromptOutcome = 'shown' | 'review_requested' | 'deferred' | 'dismissed' | 'never';
