import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ label, onPress, variant = 'primary', style }) => {
  const theme = useAppTheme();
  const styles = StyleSheet.create({
    button: {
      borderRadius: theme.radius.chip,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primary: {
      backgroundColor: theme.colors.accentPrimary,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    secondary: {
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    danger: {
      backgroundColor: theme.isDark ? '#7A3A3A' : '#E3B1AA',
    },
    text: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    lightText: {
      color: theme.isDark ? '#1E1E1E' : '#1E1E1E',
    },
  });

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => {
        try {
          const result = onPress();
          if (result && typeof (result as Promise<void>).catch === 'function') {
            void (result as Promise<void>).catch((error) => {
              console.error('PrimaryButton onPress failed', error);
            });
          }
        } catch (error) {
          console.error('PrimaryButton onPress failed', error);
        }
      }}
      style={[styles.button, styles[variant], style]}
    >
      <Text style={[styles.text, variant !== 'secondary' && styles.lightText]}>{label}</Text>
    </TouchableOpacity>
  );
};
