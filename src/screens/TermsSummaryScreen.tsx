import React from 'react';
import { Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SettingsStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<SettingsStackParamList, 'TermsSummary'>;

type SectionProps = {
  title: string;
  body: string;
};

const SectionBlock: React.FC<SectionProps> = ({ title, body }) => {
  const theme = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>{body}</Text>
    </View>
  );
};

export const TermsSummaryScreen: React.FC<Props> = ({ navigation }) => {
  const theme = useAppTheme();
  return (
    <Screen>
      <Card style={{ gap: 16 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.serif,
            fontSize: 26,
            fontWeight: '600',
          }}
        >
          Terms of Use (Summary)
        </Text>

        <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
          Layette Out is independently developed and provided “as is.”
        </Text>

        <SectionBlock
          title="Personal Use"
          body="The app is intended for personal, non-commercial use to organize children’s clothing and related information."
        />
        <SectionBlock
          title="Your Data"
          body="Your data is stored locally on your device. You are responsible for maintaining backups if you choose."
        />
        <SectionBlock
          title="No Warranty"
          body="The app is provided without warranties of any kind. We do not guarantee uninterrupted or error-free operation."
        />
        <SectionBlock
          title="Limitation of Liability"
          body="To the maximum extent permitted by law, we are not liable for data loss, financial loss, resale pricing decisions, or other damages resulting from use of the app."
        />
        <SectionBlock
          title="Purchases (If Enabled)"
          body="Subscriptions and purchases are processed by Apple and subject to Apple’s terms."
        />
        <SectionBlock title="Changes" body="Features may change, be added, or be removed at any time." />

        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          For full legal terms, please review the complete Terms of Service.
        </Text>

        <PrimaryButton label="View Full Terms of Service" onPress={() => navigation.navigate('TermsOfService')} />
      </Card>
    </Screen>
  );
};

