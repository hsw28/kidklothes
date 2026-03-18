import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { BETA_MAX_KIDS } from '@/config/betaLimits';
import { useAppTheme } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSendFeedback: () => void;
};

export const BetaKidLimitModal: React.FC<Props> = ({ visible, onClose, onSendFeedback }) => {
  const theme = useAppTheme();
  const nextRequestThreshold = BETA_MAX_KIDS + 1;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => {}}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Beta limit: {BETA_MAX_KIDS} kids</Text>
          <Text style={[styles.body, { color: theme.colors.textMuted }]}>For now, this beta supports up to {BETA_MAX_KIDS} children per account. Need {nextRequestThreshold}+? Tap ‘Send feedback’ — it really helps me prioritize what to build next.</Text>
          <View style={styles.actions}>
            <PrimaryButton label="OK" onPress={onClose} />
            <PrimaryButton label="Send feedback" variant="secondary" onPress={onSendFeedback} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 10,
  },
});
