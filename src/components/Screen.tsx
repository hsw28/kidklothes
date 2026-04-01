import React from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, ScrollViewProps, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useData } from '@/db/DataContext';
import { useAppTheme } from '@/theme';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  scrollEnabled?: boolean;
  style?: ViewStyle;
  disableDataStateGate?: boolean;
  overlay?: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
  scrollViewProps?: ScrollViewProps;
}

export const Screen: React.FC<ScreenProps> = ({ children, scroll = true, scrollEnabled = true, style, disableDataStateGate = false, overlay, scrollRef, scrollViewProps }) => {
  const theme = useAppTheme();
  const data = useData();
  const styles = StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    root: {
      flex: 1,
    },
    content: {
      paddingHorizontal: theme.spacing.screen,
      paddingVertical: theme.spacing.section,
      gap: theme.spacing.section,
    },
    centerWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.screen,
      gap: 12,
    },
    statusCard: {
      width: '100%',
      maxWidth: 520,
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.card,
      padding: theme.spacing.cardPadding,
      gap: 10,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    statusTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    statusBody: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
  });

  if (!disableDataStateGate && data.loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <View style={styles.statusCard}>
            <ActivityIndicator color={theme.colors.accentPrimary} />
            <Text style={styles.statusTitle}>Loading…</Text>
            <Text style={styles.statusBody}>Getting your closet data ready.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!disableDataStateGate && data.errorMessage) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Couldn’t Load Data</Text>
            <Text style={styles.statusBody}>{data.errorMessage}</Text>
            <PrimaryButton label="Try Again" onPress={() => void data.refresh()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (scroll) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.root}>
          <ScrollView ref={scrollRef} scrollEnabled={scrollEnabled} contentContainerStyle={[styles.content, style]} {...scrollViewProps}>{children}</ScrollView>
          {overlay}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.root, styles.content, style]}>
        {children}
        {overlay}
      </View>
    </SafeAreaView>
  );
};
