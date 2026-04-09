export type AppToastTone = 'success' | 'error';

export type AppToastEntry = {
  id: string;
  message: string;
  tone: AppToastTone;
  expiresAt: number;
};

type Listener = (entry: AppToastEntry | null) => void;

let currentToast: AppToastEntry | null = null;
const listeners = new Set<Listener>();

const emit = () => {
  for (const listener of listeners) {
    listener(currentToast);
  }
};

export const showAppToast = (input: { message: string; tone: AppToastTone; durationMs?: number }): AppToastEntry => {
  const entry: AppToastEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message: input.message,
    tone: input.tone,
    expiresAt: Date.now() + (input.durationMs ?? 3200),
  };
  currentToast = entry;
  emit();
  setTimeout(() => {
    if (currentToast?.id === entry.id) {
      currentToast = null;
      emit();
    }
  }, (input.durationMs ?? 3200) + 50);
  return entry;
};

export const clearAppToast = (id?: string) => {
  if (id && currentToast?.id !== id) return;
  currentToast = null;
  emit();
};

export const getCurrentAppToast = () => currentToast;

export const subscribeAppToast = (listener: Listener) => {
  listeners.add(listener);
  listener(currentToast);
  return () => {
    listeners.delete(listener);
  };
};
