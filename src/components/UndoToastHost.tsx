import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { clearUndo, getCurrentUndo, subscribeUndo, UndoEntry } from '@/utils/undoManager';

export const UndoToastHost: React.FC = () => {
  const [entry, setEntry] = useState<UndoEntry | null>(getCurrentUndo());
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeUndo(setEntry);
    return () => {
      unsubscribe();
    };
  }, []);

  const visible = useMemo(() => {
    if (!entry) return false;
    return entry.expiresAt > Date.now();
  }, [entry]);

  if (!visible || !entry) return null;

  const onUndo = async () => {
    if (working) return;
    setWorking(true);
    try {
      await entry.doUndo();
      clearUndo(entry.id);
    } finally {
      setWorking(false);
    }
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View style={styles.toast} accessibilityRole="alert">
        <Text numberOfLines={2} style={styles.label}>{entry.label}</Text>
        <Pressable onPress={() => void onUndo()} style={styles.undoBtn} accessibilityRole="button" accessibilityLabel="Undo last action">
          {working ? <ActivityIndicator size="small" color="#1f2937" /> : <Text style={styles.undoText}>Undo</Text>}
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 20,
  },
  toast: {
    width: '92%',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  undoBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
});
