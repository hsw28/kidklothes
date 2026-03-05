import { Alert, Platform } from 'react-native';

export const copyTextToClipboard = (text: string): boolean => {
  try {
    const rn = require('react-native');
    const clipboard = rn?.Clipboard;
    if (clipboard && typeof clipboard.setString === 'function') {
      clipboard.setString(text);
      return true;
    }
  } catch {
    // no-op
  }
  return false;
};

export const showCopyPostOptions = (onChoose: (includeAppCredit: boolean) => void) => {
  if (Platform.OS !== 'ios') {
    onChoose(false);
    return;
  }
  try {
    const rn = require('react-native');
    const actionSheet = rn?.ActionSheetIOS;
    if (actionSheet && typeof actionSheet.showActionSheetWithOptions === 'function') {
      actionSheet.showActionSheetWithOptions(
        {
          title: 'Copy Post',
          options: ['Copy Post', 'Copy Post + App Credit', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (index: number) => {
          if (index === 0) onChoose(false);
          if (index === 1) onChoose(true);
        },
      );
      return;
    }
  } catch {
    // no-op
  }

  Alert.alert('Copy Post', 'Include app credit?', [
    { text: 'Copy Post', onPress: () => onChoose(false) },
    { text: 'Copy + App Credit', onPress: () => onChoose(true) },
    { text: 'Cancel', style: 'cancel' },
  ]);
};
