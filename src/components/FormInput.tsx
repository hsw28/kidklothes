import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useAppTheme } from '@/theme';

interface FormInputProps extends TextInputProps {
  label: string;
  clearable?: boolean;
}

export const FormInput: React.FC<FormInputProps> = ({ label, style, clearable = false, value, onChangeText, ...props }) => {
  const theme = useAppTheme();
  const showClear = clearable && typeof value === 'string' && value.length > 0 && typeof onChangeText === 'function';
  const styles = StyleSheet.create({
    container: {
      gap: 8,
    },
    label: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    input: {
      flex: 1,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.colors.textPrimary,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.03,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    clearButton: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    clearText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={theme.colors.textSecondary}
          value={value}
          onChangeText={onChangeText}
          {...props}
        />
        {showClear ? (
          <Pressable style={styles.clearButton} onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};
