import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

export const Card: React.FC<ViewProps> = ({ style, ...props }) => {
  return <View style={[styles.card, style]} {...props} />;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8ea',
    padding: 12,
    gap: 8,
  },
});
