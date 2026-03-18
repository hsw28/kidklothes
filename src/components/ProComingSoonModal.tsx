import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onFeedback?: () => void;
};

export const ProComingSoonModal: React.FC<Props> = ({ visible, onClose, onFeedback }) => {
  const theme = useAppTheme();
  const styles = StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(17,24,39,0.4)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      borderRadius: 18,
      padding: 16,
      gap: 10,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    body: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    sectionTitle: {
      marginTop: 4,
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    bullet: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    footer: {
      marginTop: 4,
      fontSize: 12,
      color: theme.colors.textMuted,
      lineHeight: 18,
    },
    feedbackButton: {
      marginTop: 2,
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingHorizontal: 2,
    },
    feedbackText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.accentPeriwinkle,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>Layette Out Pro is coming soon</Text>
          <Text style={styles.body}>
            We&apos;re working on optional premium features for families who want more advanced closet organization tools.
          </Text>
          <Text style={styles.body}>
            Thanks for being an early user — you&apos;ll receive special perks when Pro launches.
          </Text>

          <Text style={styles.sectionTitle}>Planned Pro features may include:</Text>
          <Text style={styles.bullet}>• BST listings with photo grids</Text>
          <Text style={styles.bullet}>• Multiple photos per item</Text>
          <Text style={styles.bullet}>• Sibling print matching</Text>
          <Text style={styles.bullet}>• Custom categories and advanced tags</Text>

          <Text style={styles.footer}>
            Early feedback from users like you helps shape what features come next.
          </Text>

          {onFeedback ? (
            <Pressable style={styles.feedbackButton} onPress={onFeedback} accessibilityRole="button">
              <Text style={styles.feedbackText}>Send Feedback</Text>
            </Pressable>
          ) : null}
          <PrimaryButton label="Got it" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
};

