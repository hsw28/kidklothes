import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type ActionSheetAction = {
  label: string;
  onPress: () => void;
};

type ShowActionMenuInput = {
  title: string;
  message?: string;
  actions: ActionSheetAction[];
};

export const showActionMenu = ({ title, message, actions }: ShowActionMenuInput) => {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: ['Cancel', ...actions.map((action) => action.label)],
        cancelButtonIndex: 0,
      },
      (buttonIndex) => {
        if (!buttonIndex) return;
        actions[buttonIndex - 1]?.onPress();
      },
    );
    return;
  }

  Alert.alert(
    title,
    message ?? 'Choose an option',
    [
      { text: 'Cancel', style: 'cancel' },
      ...actions.map((action) => ({ text: action.label, onPress: action.onPress })),
    ],
  );
};

