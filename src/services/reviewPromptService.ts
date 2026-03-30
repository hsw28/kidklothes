import {
  REVIEW_PROMPT_COOLDOWNS,
  ReviewPromptActionCategory,
  REVIEW_PROMPT_MAX_ACTIVE_DAYS,
  REVIEW_PROMPT_MS_PER_DAY,
  REVIEW_PROMPT_STATE_ID,
  REVIEW_PROMPT_THRESHOLDS,
  ReviewPromptActionType,
  ReviewPromptOutcome,
} from '@/constants/reviewPrompt';
import { getDb, initDatabase } from '@/db/sqlite';

type ReviewPromptState = {
  firstUsedAt?: number;
  totalSessions: number;
  activeDayKeys: string[];
  meaningfulActionCount: number;
  currentSessionId: number;
  currentSessionStartedAt?: number;
  currentSessionMeaningfulActions: number;
  currentSessionCountedActionCategories: ReviewPromptActionCategory[];
  lastMeaningfulActionAt?: number;
  lastMeaningfulActionType?: ReviewPromptActionType;
  lastPromptShownAt?: number;
  lastPromptSource?: string;
  lastPromptSessionId?: number;
  promptShownCount: number;
  cooldownUntil?: number;
  lastOutcome?: ReviewPromptOutcome;
  reviewRequestedAt?: number;
  neverAskAgainAt?: number;
  updatedAt: number;
};

type ReviewPromptRow = {
  id: number;
  payloadJson: string;
  updatedAt: number;
};

export type ReviewPromptEligibility = {
  eligible: boolean;
  reason?: string;
  state: ReviewPromptState;
};

const defaultState = (): ReviewPromptState => ({
  totalSessions: 0,
  activeDayKeys: [],
  meaningfulActionCount: 0,
  currentSessionId: 0,
  currentSessionMeaningfulActions: 0,
  currentSessionCountedActionCategories: [],
  promptShownCount: 0,
  updatedAt: Date.now(),
});

const toMeaningfulActionCategory = (actionType: ReviewPromptActionType): ReviewPromptActionCategory => {
  if (actionType === 'item_saved' || actionType === 'item_updated' || actionType === 'quick_save' || actionType === 'wishlist_item_purchased' || actionType === 'resale_target_saved') {
    return 'item_management';
  }
  if (actionType === 'batch_add_saved' || actionType === 'drawer_scan_saved') {
    return 'batch_management';
  }
  if (actionType === 'bulk_status_updated' || actionType === 'bulk_tag_applied' || actionType === 'bulk_child_assigned' || actionType === 'items_archived') {
    return 'closet_organizing';
  }
  if (actionType === 'item_marked_worn') {
    return 'closet_care';
  }
  return 'shopping_task';
};

const getLocalDayKey = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const sanitizeState = (value?: Partial<ReviewPromptState> | null): ReviewPromptState => {
  const base = defaultState();
  const activeDayKeys = Array.isArray(value?.activeDayKeys)
    ? value?.activeDayKeys.filter((entry): entry is string => typeof entry === 'string').slice(-REVIEW_PROMPT_MAX_ACTIVE_DAYS)
    : [];
  const currentSessionCountedActionCategories = Array.isArray(value?.currentSessionCountedActionCategories)
    ? value.currentSessionCountedActionCategories.filter((entry): entry is ReviewPromptActionCategory => typeof entry === 'string')
    : [];
  return {
    ...base,
    ...value,
    activeDayKeys,
    currentSessionCountedActionCategories,
    firstUsedAt: Number(value?.firstUsedAt ?? 0) || undefined,
    totalSessions: Number(value?.totalSessions ?? 0) || 0,
    meaningfulActionCount: Number(value?.meaningfulActionCount ?? 0) || 0,
    currentSessionId: Number(value?.currentSessionId ?? 0) || 0,
    currentSessionMeaningfulActions: Number(value?.currentSessionMeaningfulActions ?? 0) || 0,
    lastPromptSessionId: Number(value?.lastPromptSessionId ?? 0) || undefined,
    promptShownCount: Number(value?.promptShownCount ?? 0) || 0,
    reviewRequestedAt: Number(value?.reviewRequestedAt ?? 0) || undefined,
    updatedAt: Number(value?.updatedAt ?? Date.now()) || Date.now(),
  };
};

const loadState = async (): Promise<ReviewPromptState> => {
  await initDatabase();
  const db = await getDb();
  const row = await db.getFirstAsync<ReviewPromptRow>('SELECT * FROM review_prompt_state WHERE id = ?;', REVIEW_PROMPT_STATE_ID);
  if (!row?.payloadJson) return defaultState();
  try {
    return sanitizeState(JSON.parse(row.payloadJson) as Partial<ReviewPromptState>);
  } catch {
    // Malformed persisted state should never break startup or prompt checks.
    return defaultState();
  }
};

const saveState = async (state: ReviewPromptState) => {
  await initDatabase();
  const db = await getDb();
  const next = sanitizeState(state);
  await db.runAsync(
    `INSERT INTO review_prompt_state (id, payloadJson, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payloadJson = excluded.payloadJson, updatedAt = excluded.updatedAt;`,
    REVIEW_PROMPT_STATE_ID,
    JSON.stringify(next),
    next.updatedAt,
  );
  return next;
};

const withUpdate = async (updater: (state: ReviewPromptState) => ReviewPromptState | Promise<ReviewPromptState>) => {
  const current = await loadState();
  const next = await updater(current);
  return saveState(next);
};

export const reviewPromptService = {
  async getState(): Promise<ReviewPromptState> {
    return loadState();
  },

  async recordAppLaunchSession(timestamp = Date.now()): Promise<ReviewPromptState> {
    // We track first use so the prompt can only appear after the app has had time
    // to prove value, even for highly active users.
    return withUpdate((state) => ({
      ...state,
      firstUsedAt: state.firstUsedAt ?? timestamp,
      totalSessions: state.totalSessions + 1,
      currentSessionId: state.currentSessionId + 1,
      currentSessionStartedAt: timestamp,
      currentSessionMeaningfulActions: 0,
      currentSessionCountedActionCategories: [],
      updatedAt: timestamp,
    }));
  },

  async recordActiveDay(timestamp = Date.now()): Promise<ReviewPromptState> {
    const dayKey = getLocalDayKey(timestamp);
    return withUpdate((state) => ({
      ...state,
      activeDayKeys: state.activeDayKeys.includes(dayKey)
        ? state.activeDayKeys
        : [...state.activeDayKeys, dayKey].slice(-REVIEW_PROMPT_MAX_ACTIVE_DAYS),
      updatedAt: timestamp,
    }));
  },

  async recordMeaningfulAction(actionType: ReviewPromptActionType, timestamp = Date.now()): Promise<ReviewPromptState> {
    // Count distinct action categories once per session so repeated saves/edits
    // inside one workflow do not inflate engagement too quickly.
    const category = toMeaningfulActionCategory(actionType);
    return withUpdate((state) => ({
      ...state,
      meaningfulActionCount: state.currentSessionCountedActionCategories.includes(category)
        ? state.meaningfulActionCount
        : state.meaningfulActionCount + 1,
      currentSessionMeaningfulActions: state.currentSessionCountedActionCategories.includes(category)
        ? state.currentSessionMeaningfulActions
        : state.currentSessionMeaningfulActions + 1,
      currentSessionCountedActionCategories: state.currentSessionCountedActionCategories.includes(category)
        ? state.currentSessionCountedActionCategories
        : [...state.currentSessionCountedActionCategories, category],
      lastMeaningfulActionAt: timestamp,
      lastMeaningfulActionType: actionType,
      updatedAt: timestamp,
    }));
  },

  async checkEligibility(timestamp = Date.now()): Promise<ReviewPromptEligibility> {
    const state = await loadState();
    if (state.reviewRequestedAt) return { eligible: false, reason: 'review_requested', state };
    if (state.neverAskAgainAt) return { eligible: false, reason: 'never_ask_again', state };
    if (state.cooldownUntil && state.cooldownUntil > timestamp) return { eligible: false, reason: 'cooldown', state };
    // Explicit once-per-session guard: if the prompt was already shown in this
    // app session, do not show it again regardless of later actions.
    if (state.lastPromptSessionId === state.currentSessionId) return { eligible: false, reason: 'already_prompted_this_session', state };
    if (!state.firstUsedAt) return { eligible: false, reason: 'first_use_missing', state };
    const daysSinceFirstUse = Math.floor((timestamp - state.firstUsedAt) / REVIEW_PROMPT_MS_PER_DAY);
    if (daysSinceFirstUse < REVIEW_PROMPT_THRESHOLDS.minDaysSinceFirstUse) return { eligible: false, reason: 'maturity_gate', state };
    if (state.totalSessions < REVIEW_PROMPT_THRESHOLDS.minSessions) return { eligible: false, reason: 'sessions', state };
    if (state.activeDayKeys.length < REVIEW_PROMPT_THRESHOLDS.minActiveDays) return { eligible: false, reason: 'active_days', state };
    if (state.meaningfulActionCount < REVIEW_PROMPT_THRESHOLDS.minMeaningfulActions) return { eligible: false, reason: 'meaningful_actions', state };
    if (state.currentSessionMeaningfulActions < 1) return { eligible: false, reason: 'current_session_action', state };
    return { eligible: true, state };
  },

  async markPromptShown(source: string, timestamp = Date.now()): Promise<ReviewPromptState> {
    return withUpdate((state) => ({
      ...state,
      lastPromptShownAt: timestamp,
      lastPromptSource: source,
      lastPromptSessionId: state.currentSessionId,
      promptShownCount: state.promptShownCount + 1,
      lastOutcome: 'shown',
      updatedAt: timestamp,
    }));
  },

  async markReviewRequested(timestamp = Date.now()): Promise<ReviewPromptState> {
    return withUpdate((state) => ({
      ...state,
      reviewRequestedAt: timestamp,
      cooldownUntil: undefined,
      lastOutcome: 'review_requested',
      updatedAt: timestamp,
    }));
  },

  async markDeferred(timestamp = Date.now()): Promise<ReviewPromptState> {
    return withUpdate((state) => ({
      ...state,
      cooldownUntil: timestamp + REVIEW_PROMPT_COOLDOWNS.deferredMs,
      lastOutcome: 'deferred',
      updatedAt: timestamp,
    }));
  },

  async markDismissed(timestamp = Date.now()): Promise<ReviewPromptState> {
    return withUpdate((state) => ({
      ...state,
      cooldownUntil: timestamp + REVIEW_PROMPT_COOLDOWNS.dismissedMs,
      lastOutcome: 'dismissed',
      updatedAt: timestamp,
    }));
  },

  async markNeverAskAgain(timestamp = Date.now()): Promise<ReviewPromptState> {
    return withUpdate((state) => ({
      ...state,
      neverAskAgainAt: timestamp,
      cooldownUntil: undefined,
      lastOutcome: 'never',
      updatedAt: timestamp,
    }));
  },
};
