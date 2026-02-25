import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme';

type Props = {
  onPress: () => void;
  onLongPress?: () => void;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  style?: ViewStyle;
};

export const FloatingActionButton: React.FC<Props> = ({
  onPress,
  onLongPress,
  icon,
  accessibilityLabel = 'Add',
  testID,
  style,
}) => {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
    fab: {
      position: 'absolute',
      right: 20,
      bottom: Math.max(insets.bottom, 12) + 16,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.accentPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.14,
      shadowRadius: 10,
      elevation: 4,
      borderWidth: 1,
      borderColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(31,26,23,0.06)',
    },
    plusWrap: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plusHorizontal: {
      position: 'absolute',
      width: 18,
      height: 2.5,
      borderRadius: 2,
      backgroundColor: '#FFFFFF',
    },
    plusVertical: {
      position: 'absolute',
      width: 2.5,
      height: 18,
      borderRadius: 2,
      backgroundColor: '#FFFFFF',
    },
      }),
    [insets.bottom, theme.colors.accentPrimary, theme.colors.shadow, theme.isDark],
  );

  if (keyboardVisible) return null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      style={[styles.fab, style]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {icon ?? (
        <View style={styles.plusWrap}>
          <View style={styles.plusHorizontal} />
          <View style={styles.plusVertical} />
        </View>
      )}
    </Pressable>
  );
};
