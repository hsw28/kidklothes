import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onUnlock?: () => void;
  onFeedback?: () => void;
  title?: string;
  bodyLines?: string[];
  bulletLines?: string[];
  sectionTitle?: string;
  buttonLabel?: string;
};

export const ProComingSoonModal: React.FC<Props> = ({
  visible,
  onClose,
  onUnlock,
  onFeedback,
  title,
  bodyLines,
  bulletLines,
  sectionTitle,
  buttonLabel,
}) => {
  const theme = useAppTheme();
  const resolvedTitle = title ?? 'Get more out of your closet';
  const resolvedBodyLines = bodyLines ?? [
    'Create your own categories, sell items faster, and see what matches across your kids.',
  ];
  const resolvedBulletLines = bulletLines ?? [
    'Turn your closet into ready-to-post BST listings',
    'Create categories that fit your family',
    'See matching prints across kids',
    'Add multiple photos to each item',
  ];
  const resolvedSectionTitle = sectionTitle ?? 'With Pro you can:';
  const resolvedButtonLabel = buttonLabel ?? 'Unlock Pro';
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
    secondaryButton: {
      alignSelf: 'center',
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    secondaryText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>{resolvedTitle}</Text>
          {resolvedBodyLines.map((line, index) => (
            <Text key={`body-${index}`} style={styles.body}>
              {line}
            </Text>
          ))}

          {resolvedBulletLines.length ? <Text style={styles.sectionTitle}>{resolvedSectionTitle}</Text> : null}
          {resolvedBulletLines.map((line, index) => (
            <Text key={`bullet-${index}`} style={styles.bullet}>• {line}</Text>
          ))}

          <PrimaryButton label={resolvedButtonLabel} onPress={onUnlock ?? onClose} />
          <Pressable style={styles.secondaryButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
