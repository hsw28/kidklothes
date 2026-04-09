import { useEffect, useState } from 'react';
import { useData } from '@/db/DataContext';

export const useBstEntryOnboarding = (enabled = true) => {
  const { settings, saleDrafts, updateSettings } = useData();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const totalBstDrafts = saleDrafts.length;

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    if (totalBstDrafts > 0) {
      setVisible(false);
      return;
    }
    if (dismissed) {
      setVisible(false);
      return;
    }
    if (settings.hasSeenBstEntryOnboarding && !settings.developerActLikeFirstTimeUser) return;
    setVisible(true);
    if (!settings.developerActLikeFirstTimeUser) {
      void updateSettings({ hasSeenBstEntryOnboarding: true });
    }
  }, [dismissed, enabled, settings.developerActLikeFirstTimeUser, settings.hasSeenBstEntryOnboarding, totalBstDrafts, updateSettings]);

  return {
    visible,
    dismiss: () => {
      setDismissed(true);
      setVisible(false);
      if (!settings.developerActLikeFirstTimeUser && !settings.hasSeenBstEntryOnboarding) {
        void updateSettings({ hasSeenBstEntryOnboarding: true });
      }
    },
  };
};
