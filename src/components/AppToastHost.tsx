import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppToastEntry, getCurrentAppToast, subscribeAppToast } from '@/utils/appToast';

export const AppToastHost: React.FC = () => {
  const [entry, setEntry] = useState<AppToastEntry | null>(getCurrentAppToast());

  useEffect(() => subscribeAppToast(setEntry), []);

  const visible = useMemo(() => {
    if (!entry) return false;
    return entry.expiresAt > Date.now();
  }, [entry]);

  if (!visible || !entry) return null;

  const toneStyle = entry.tone === 'error' ? styles.errorToast : styles.successToast;

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={[styles.toast, toneStyle]} accessibilityRole="alert">
        <Text style={styles.label}>{entry.message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 82,
    alignItems: 'center',
    zIndex: 1100,
    elevation: 22,
  },
  toast: {
    width: '90%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  successToast: {
    backgroundColor: '#1F7A4C',
  },
  errorToast: {
    backgroundColor: '#9B1C1C',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
