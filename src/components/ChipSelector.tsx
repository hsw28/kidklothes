import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AccentName, getAccentColors, useAppTheme } from '@/theme';

interface ChipSelectorProps<T extends string> {
  label?: string;
  options: T[];
  value?: T;
  selectedValues?: T[];
  onChange: (value: T) => void;
  onOptionLongPress?: (value: T) => void;
  accent?: AccentName;
  optionLabels?: Partial<Record<T, string>>;
}

export const ChipSelector = <T extends string>({
  label,
  options,
  value,
  selectedValues,
  onChange,
  onOptionLongPress,
  accent = 'coral',
  optionLabels,
}: ChipSelectorProps<T>) => {
  const theme = useAppTheme();
  const styles = StyleSheet.create({
    container: {
      gap: 8,
    },
    label: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: theme.spacing.chipPadX,
      paddingVertical: theme.spacing.chipPadY + 1,
      minHeight: 38,
      borderRadius: theme.radius.chip,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'center',
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.03,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    text: {
      fontSize: 13,
      fontWeight: '600',
    },
  });

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {options.map((option) => {
          const active = value === option || Boolean(selectedValues?.includes(option));
          const colors = getAccentColors(theme, accent, active);
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              onLongPress={onOptionLongPress ? () => onOptionLongPress(option) : undefined}
              style={[
                styles.chip,
                {
                  backgroundColor: colors.bg,
                  borderColor: active ? (accent === 'coral' ? theme.colors.accentCoralSoft : accent === 'sage' ? theme.colors.accentSageSoft : theme.colors.accentPeriwinkleSoft) : theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.text, { color: colors.text }]}>{optionLabels?.[option] ?? option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
