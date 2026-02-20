import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, ViewStyle } from 'react-native';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}

export const Screen: React.FC<ScreenProps> = ({ children, scroll = true, style }) => {
  if (scroll) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={[styles.content, style]}>{children}</ScrollView>
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={[styles.safe, styles.content, style]}>{children}</SafeAreaView>;
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7f7f8',
  },
  content: {
    padding: 16,
    gap: 12,
  },
});
