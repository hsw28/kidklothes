import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, subtitle }) => {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 16,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
});
