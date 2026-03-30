import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';
import { ReviewPromptModal } from '@/components/ReviewPromptModal';
import { ReviewPromptActionType } from '@/constants/reviewPrompt';
import { reviewPromptService } from '@/services/reviewPromptService';

type ReviewPromptContextValue = {
  recordMeaningfulActionAndMaybePrompt: (actionType: ReviewPromptActionType, source: string) => Promise<boolean>;
};

const ReviewPromptContext = createContext<ReviewPromptContextValue | undefined>(undefined);

export const ReviewPromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const pendingRef = useRef(false);
  const didRecordSessionRef = useRef(false);

  useEffect(() => {
    if (didRecordSessionRef.current) return;
    didRecordSessionRef.current = true;
    void (async () => {
      try {
        await reviewPromptService.recordAppLaunchSession();
        await reviewPromptService.recordActiveDay();
      } catch {
        // Review tracking is best-effort and should never interfere with startup.
      }
    })();
  }, []);

  const closeModal = () => {
    pendingRef.current = false;
    setVisible(false);
  };

  const recordMeaningfulActionAndMaybePrompt = async (actionType: ReviewPromptActionType, source: string) => {
    try {
      // We only evaluate after successful, positive actions. Never on startup.
      await reviewPromptService.recordMeaningfulAction(actionType);
      if (pendingRef.current) return false;
      const canReview = await StoreReview.hasAction().catch(() => false);
      if (!canReview) return false;
      const eligibility = await reviewPromptService.checkEligibility();
      if (!eligibility.eligible) return false;
      pendingRef.current = true;
      await reviewPromptService.markPromptShown(source);
      setVisible(true);
      return true;
    } catch {
      // Prompt failures must not affect the action that just succeeded.
      return false;
    }
  };

  return (
    <ReviewPromptContext.Provider value={{ recordMeaningfulActionAndMaybePrompt }}>
      {children}
      <ReviewPromptModal
        visible={visible}
        onRequestReview={async () => {
          try {
            const hasReviewAction = await StoreReview.hasAction().catch(() => false);
            if (!hasReviewAction) {
              await reviewPromptService.markDismissed();
              closeModal();
              return;
            }
            const canRequestNatively = await StoreReview.isAvailableAsync().catch(() => false);
            // "Review requested" is deliberately more accurate than "accepted":
            // native APIs do not confirm whether the user actually submitted a review.
            await reviewPromptService.markReviewRequested();
            closeModal();
            if (canRequestNatively) {
              await StoreReview.requestReview();
              return;
            }

            // Explicit fallback: if native review is unavailable, open the configured
            // App Store / Play Store URL when present. Configure these in app config:
            // `ios.appStoreUrl` and `android.playStoreUrl`.
            const storeUrl = StoreReview.storeUrl();
            if (!storeUrl) return;
            const canOpen = await Linking.canOpenURL(storeUrl).catch(() => false);
            if (!canOpen) return;
            await Linking.openURL(storeUrl);
          } catch {
            closeModal();
          }
        }}
        onDefer={async () => {
          await reviewPromptService.markDeferred().catch(() => undefined);
          closeModal();
        }}
        onDismiss={async () => {
          await reviewPromptService.markDismissed().catch(() => undefined);
          closeModal();
        }}
        onNeverAskAgain={async () => {
          await reviewPromptService.markNeverAskAgain().catch(() => undefined);
          closeModal();
        }}
      />
    </ReviewPromptContext.Provider>
  );
};

export const useReviewPrompt = () => {
  const context = useContext(ReviewPromptContext);
  if (!context) throw new Error('useReviewPrompt must be used within ReviewPromptProvider');
  return context;
};
