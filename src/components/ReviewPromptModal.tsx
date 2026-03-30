import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme } from '@/theme';

type Props = {
  visible: boolean;
  onRequestReview: () => void | Promise<void>;
  onDefer: () => void | Promise<void>;
  onDismiss: () => void | Promise<void>;
  onNeverAskAgain: () => void | Promise<void>;
};

export const ReviewPromptModal: React.FC<Props> = ({
  visible,
  onRequestReview,
  onDefer,
  onDismiss,
  onNeverAskAgain,
}) => {
  const theme = useAppTheme();
  const styles = StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(17,24,39,0.32)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      gap: 12,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    title: {
      flex: 1,
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    closeText: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    textButton: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    textButtonLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    neverButtonLabel: {
      color: theme.colors.textMuted,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable onPress={() => undefined}>
          <Card style={styles.card}>
            <View style={styles.topRow}>
              <Text style={styles.title}>Enjoying Layette Out?</Text>
              <Pressable style={styles.closeButton} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss review prompt">
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.body}>
              If Layette Out is helping you keep up with sizes, closet bins, and shopping decisions, a quick review helps other parents find it.
            </Text>
            <PrimaryButton label="Rate Layette Out" onPress={onRequestReview} />
            <PrimaryButton label="Not now" variant="secondary" onPress={onDefer} />
            <View style={styles.footerRow}>
              <Pressable style={styles.textButton} onPress={onNeverAskAgain} accessibilityRole="button">
                <Text style={[styles.textButtonLabel, styles.neverButtonLabel]}>Don&apos;t ask again</Text>
              </Pressable>
            </View>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
