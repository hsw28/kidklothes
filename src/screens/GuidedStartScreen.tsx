import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClosetStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<ClosetStackParamList, 'GuidedStart'>;

export const GuidedStartScreen: React.FC<Props> = ({ navigation }) => {
  const theme = useAppTheme();
  const { children } = useData();
  const childCount = useMemo(() => children.length, [children.length]);
  const firstChildId = children[0]?.id;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          justifyContent: 'space-between',
          paddingBottom: 20,
        },
        content: {
          gap: 14,
        },
        title: {
          fontSize: 28,
          fontWeight: '600',
          color: theme.colors.textPrimary,
          fontFamily: theme.fonts.serif,
          textAlign: 'center',
        },
        cardRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        iconWrap: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surfaceMuted,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        icon: {
          fontSize: 20,
        },
        cardTitle: {
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.textPrimary,
        },
        cardSubtitle: {
          fontSize: 14,
          color: theme.colors.textSecondary,
        },
        cardBody: {
          flex: 1,
          gap: 2,
        },
        tappableCardWrap: {
          borderRadius: theme.radius.card,
          transform: [{ scale: 1 }],
        },
      }),
    [theme.colors.border, theme.colors.surfaceMuted, theme.colors.textPrimary, theme.colors.textSecondary, theme.fonts.serif],
  );

  const goCloset = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ClosetHome');
  };

  const goWishlist = () => {
    navigation.getParent()?.navigate('Wishlist' as never);
  };

  const goDropPrep = () => {
    if (childCount > 0) {
      navigation.navigate('DropPrep', firstChildId ? { childId: firstChildId } : undefined);
      return;
    }
    Alert.alert('Add a kid first', 'Add a kid first to use Drop Prep.');
    goCloset();
  };

  const renderInfoCard = (
    icon: string,
    title: string,
    subtitle: string,
    onPress: () => void,
    accessibilityLabel: string,
  ) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.tappableCardWrap,
        pressed ? { opacity: 0.96, transform: [{ scale: 0.985 }] } : null,
      ]}
    >
      <Card>
        <View style={styles.cardRow}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>{icon}</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSubtitle}>{subtitle}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );

  return (
    <Screen scroll={false} style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Organize by What Fits</Text>

        {renderInfoCard('🧺', 'Closet', 'Track what fits now and next.', goCloset, 'Open Closet')}
        {renderInfoCard('🛍️', 'Wishlist', 'Save links from any store.', goWishlist, 'Open Wishlist')}
        {renderInfoCard('📦', 'Drop Prep', 'Check size-ups and duplicates before buying.', goDropPrep, 'Explore Drop Prep')}
      </View>

      <Card>
        <PrimaryButton label="Back to Closet" variant="secondary" onPress={() => navigation.navigate('ClosetHome')} />
      </Card>
    </Screen>
  );
};
