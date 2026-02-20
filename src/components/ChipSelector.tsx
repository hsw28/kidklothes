import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ChipSelectorProps<T extends string> {
  label: string;
  options: T[];
  value?: T;
  onChange: (value: T) => void;
}

export const ChipSelector = <T extends string>({ label, options, value, onChange }: ChipSelectorProps<T>) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const active = value === option;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              style={[styles.chip, active && styles.activeChip]}
            >
              <Text style={[styles.text, active && styles.activeText]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d3d3d6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  activeChip: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  text: {
    color: '#333',
    fontSize: 13,
  },
  activeText: {
    color: '#fff',
  },
});
