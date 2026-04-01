import React, { createContext, useContext } from 'react';
import { ReviewPromptActionType } from '@/constants/reviewPrompt';

type ReviewPromptContextValue = {
  recordMeaningfulActionAndMaybePrompt: (actionType: ReviewPromptActionType, source: string) => Promise<boolean>;
};

const noopContextValue: ReviewPromptContextValue = {
  recordMeaningfulActionAndMaybePrompt: async () => false,
};

const ReviewPromptContext = createContext<ReviewPromptContextValue>(noopContextValue);

export const ReviewPromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  return <ReviewPromptContext.Provider value={noopContextValue}>{children}</ReviewPromptContext.Provider>;
};

export const useReviewPrompt = () => {
  return useContext(ReviewPromptContext);
};
