import { useCallback } from 'react';
import { clearUndo, pushUndo } from '@/utils/undoManager';

type ShowUndoToastInput = {
  label: string;
  doUndo: () => Promise<void>;
  durationMs?: number;
};

export const useUndoToast = () => {
  const showToast = useCallback(({ label, doUndo, durationMs = 10000 }: ShowUndoToastInput) => {
    const entry = pushUndo({
      label,
      doUndo,
      expiresAt: Date.now() + durationMs,
    });
    setTimeout(() => {
      clearUndo(entry.id);
    }, durationMs + 50);
  }, []);

  return { showToast };
};

