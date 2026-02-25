import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { useAppTheme } from '@/theme';

export const Card: React.FC<ViewProps> = ({ style, ...props }) => {
  const theme = useAppTheme();
  const styles = StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.card,
      padding: theme.spacing.cardPadding,
      gap: 8,
      borderWidth: theme.isDark ? 1 : 0.5,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
  });
  return <View style={[styles.card, style]} {...props} />;
};
