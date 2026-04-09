import { useCallback } from 'react';
import { showAppToast } from '@/utils/appToast';

export const useAppToast = () => {
  const showToast = useCallback((message: string, tone: 'success' | 'error') => {
    showAppToast({ message, tone });
  }, []);

  return { showToast };
};
