import React from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme } from '@/theme';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

const OnboardingCard: React.FC<{ title: string; body: string }> = ({ title, body }) => {
  const theme = useAppTheme();
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 14,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary }}>{title}</Text>
      <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>{body}</Text>
    </View>
  );
};

export const FirstRunOnboardingModal: React.FC<Props> = ({ visible, onDismiss }) => {
  const theme = useAppTheme();
  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onDismiss}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerWrap}>
            <Text style={[styles.title, { color: theme.colors.textPrimary, fontFamily: theme.fonts.serif }]}>
              How Layette Out works
            </Text>
          </View>

          <View style={styles.cardsWrap}>
            <OnboardingCard title={'🧺 Track what you own'} body="Add items and organize by size." />
            <OnboardingCard title={'🔗 Paste a product link'} body="Paste a store link and details fill automatically." />
            <OnboardingCard title={'🛍 Save items for later'} body="Keep wishlist items so you can check before buying." />
          </View>

          <Text style={[styles.tip, { color: theme.colors.textSecondary }]}>
            Tip: You can also add items directly from your browser using the Share → Layette Out option.
          </Text>
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton label="Got it" onPress={onDismiss} />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 14,
  },
  headerWrap: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  cardsWrap: {
    gap: 10,
  },
  tip: {
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
});
