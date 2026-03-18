import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { BETA_MAX_KIDS } from '@/config/betaLimits';

const FEEDBACK_EMAIL = 'hello@layetteout.com';

export const openKidLimitFeedbackEmail = async (currentCount: number) => {
  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const nextRequestThreshold = BETA_MAX_KIDS + 1;
  const subject = `Layette Out beta: request for ${nextRequestThreshold}+ kids`;
  const body = [
    `Hi! I’m using Layette Out beta and would love support for ${nextRequestThreshold}+ kids.`,
    '',
    `Current number of kids in my account: ${currentCount}`,
    `App version: ${appVersion}`,
    `Device: ${Platform.OS}`,
  ].join('\n');
  const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await Linking.openURL(mailto);
};
