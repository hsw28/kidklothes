import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

interface FormInputProps extends TextInputProps {
  label: string;
}

export const FormInput: React.FC<FormInputProps> = ({ label, style, ...props }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor="#999"
        {...props}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: '#444',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
});
