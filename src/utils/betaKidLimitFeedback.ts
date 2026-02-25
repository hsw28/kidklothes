import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

const FEEDBACK_EMAIL = 'hello@layetteout.com';

export const openKidLimitFeedbackEmail = async (currentCount: number) => {
  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const subject = 'Layette Out beta: request for 3+ kids';
  const body = [
    'Hi! I’m using Layette Out beta and would love support for 3+ kids.',
    '',
    `Current number of kids in my account: ${currentCount}`,
    `App version: ${appVersion}`,
    `Device: ${Platform.OS}`,
  ].join('\n');
  const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await Linking.openURL(mailto);
};
