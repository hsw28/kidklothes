import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ label, onPress, variant = 'primary', style }) => {
  return (
    <Pressable onPress={onPress} style={[styles.button, styles[variant], style]}>
      <Text style={[styles.text, variant !== 'secondary' && styles.lightText]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
  },
  primary: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  secondary: {
    backgroundColor: '#fff',
    borderColor: '#ddd',
  },
  danger: {
    backgroundColor: '#b91c1c',
    borderColor: '#b91c1c',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  lightText: {
    color: '#fff',
  },
});
