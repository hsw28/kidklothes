import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme';

type Props = {
  title: string;
};

export const BrandedHeaderTitle: React.FC<Props> = ({ title }) => {
  const theme = useAppTheme();
  const styles = StyleSheet.create({
    wrap: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      paddingVertical: 1,
    },
    productLabel: {
      fontSize: 10,
      lineHeight: 12,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    pageTitle: {
      fontSize: 20,
      lineHeight: 22,
      fontWeight: '500',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.productLabel}>Layette Out</Text>
      <Text style={styles.pageTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
};

