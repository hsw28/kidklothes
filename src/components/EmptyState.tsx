import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme } from '@/theme';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  secondaryActionLabel?: string;
  onSecondaryActionPress?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  secondaryActionLabel,
  onSecondaryActionPress,
}) => {
  const theme = useAppTheme();
  const styles = StyleSheet.create({
    wrap: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.card,
      padding: theme.spacing.cardPadding,
      gap: 8,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    actions: {
      gap: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {(actionLabel && onActionPress) || (secondaryActionLabel && onSecondaryActionPress) ? (
        <View style={styles.actions}>
          {actionLabel && onActionPress ? <PrimaryButton label={actionLabel} onPress={onActionPress} /> : null}
          {secondaryActionLabel && onSecondaryActionPress ? (
            <PrimaryButton label={secondaryActionLabel} variant="secondary" onPress={onSecondaryActionPress} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
};
