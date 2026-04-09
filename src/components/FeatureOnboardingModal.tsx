import React, { useMemo } from 'react';
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme } from '@/theme';

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  bullets: string[];
  primaryLabel: string;
  secondaryLabel?: string;
  note?: string;
  onPrimaryPress: () => void;
  onSecondaryPress: () => void;
};

export const FeatureOnboardingModal: React.FC<Props> = ({
  visible,
  title,
  body,
  bullets,
  primaryLabel,
  secondaryLabel = 'Skip',
  note,
  onPrimaryPress,
  onSecondaryPress,
}) => {
  const theme = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: 'rgba(17,24,39,0.38)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      borderRadius: 24,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 20,
      gap: 14,
    },
    title: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    bullet: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textPrimary,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary,
    },
    note: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    actions: {
      gap: 10,
      marginTop: 4,
    },
  }), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSecondaryPress}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onSecondaryPress} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          {bullets.map((bullet) => (
            <Text key={bullet} style={styles.bullet}>• {bullet}</Text>
          ))}
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <View style={styles.actions}>
            <PrimaryButton label={primaryLabel} onPress={onPrimaryPress} />
            <PrimaryButton label={secondaryLabel} variant="secondary" onPress={onSecondaryPress} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};
