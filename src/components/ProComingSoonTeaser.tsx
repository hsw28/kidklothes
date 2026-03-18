import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme';

type Props = {
  variant: 'card' | 'banner';
  onPress: () => void;
  onDismiss?: () => void;
};

export const ProComingSoonTeaser: React.FC<Props> = ({ variant, onPress, onDismiss }) => {
  const theme = useAppTheme();
  const isBanner = variant === 'banner';

  const styles = StyleSheet.create({
    shell: {
      borderRadius: isBanner ? 14 : 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: isBanner ? theme.colors.surface : theme.colors.accentPeriwinkleSoft,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 5,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.accentPeriwinkle,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    body: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 19,
    },
    dismissButton: {
      minWidth: 24,
      minHeight: 24,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted,
    },
    dismissText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      lineHeight: 16,
    },
  });

  return (
    <Pressable style={styles.shell} onPress={onPress} accessibilityRole="button" accessibilityLabel="Layette Out Pro coming soon">
      <View style={styles.headerRow}>
        <Text style={styles.title}>✨ Layette Out Pro</Text>
        {onDismiss ? (
          <Pressable
            style={styles.dismissButton}
            onPress={(event) => {
              event.stopPropagation();
              onDismiss();
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Dismiss Pro teaser"
          >
            <Text style={styles.dismissText}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.subtitle}>Coming soon</Text>
      <Text style={styles.body}>
        Thanks for being an early user — you&apos;ll receive special perks when Pro launches.
      </Text>
    </Pressable>
  );
};

