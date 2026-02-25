export type UndoEntry = {
  id: string;
  label: string;
  expiresAt: number;
  doUndo: () => Promise<void>;
};

type Listener = (entry: UndoEntry | null) => void;

let currentUndo: UndoEntry | null = null;
const listeners = new Set<Listener>();

const emit = () => {
  for (const listener of listeners) listener(currentUndo);
};

export const subscribeUndo = (listener: Listener) => {
  listeners.add(listener);
  listener(currentUndo);
  return () => listeners.delete(listener);
};

export const pushUndo = (entry: Omit<UndoEntry, 'id'>) => {
  currentUndo = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  emit();
  return currentUndo;
};

export const getCurrentUndo = () => currentUndo;

export const clearUndo = (id?: string) => {
  if (id && currentUndo && currentUndo.id !== id) return;
  currentUndo = null;
  emit();
};

