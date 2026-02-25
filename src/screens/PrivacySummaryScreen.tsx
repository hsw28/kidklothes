import React from 'react';
import { Linking, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { PRIVACY_POLICY_URL } from '@/constants/legal';
import { useAppTheme } from '@/theme';

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

const PrivacySection: React.FC<SectionProps> = ({ title, children }) => {
  const theme = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: theme.colors.text,
          fontSize: 18,
          fontWeight: '700',
        }}
      >
        {title}
      </Text>
      <View style={{ gap: 6 }}>{children}</View>
    </View>
  );
};

const Bullet: React.FC<{ text: string }> = ({ text }) => {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 15, lineHeight: 22 }}>{'\u2022'}</Text>
      <Text style={{ flex: 1, color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>{text}</Text>
    </View>
  );
};

export const PrivacySummaryScreen: React.FC = () => {
  const theme = useAppTheme();

  const openPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      // Keep failure handling simple and local; Settings also exposes the link.
    }
  };

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
          {'\ud83d\udd10 Privacy Summary'}
        </Text>
        <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
          Layette Out is local-first.
          {'\n'}
          Your data stays on your device unless you choose to share it.
        </Text>

        <PrivacySection title="What We Store">
          <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
            The app stores the information you enter, including:
          </Text>
          <Bullet text="Kids’ names, sizes, and optional photos" />
          <Bullet text="Clothing items, wishlist items, and resale details" />
          <Bullet text="Storage locations, tags, outfits, and notes" />
          <Bullet text="Reminder preferences" />
          <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
            All of this is saved locally on your device.
          </Text>
        </PrivacySection>

        <PrivacySection title="Photos & Camera">
          <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
            If you choose to add photos, they are stored on your device.
            {'\n'}
            We do not upload your images to external servers.
          </Text>
        </PrivacySection>

        <PrivacySection title="Product Links">
          <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
            If you paste a product link, the app may send that URL to a metadata service to fetch the product title and image.
            {'\n'}
            That metadata is saved locally if you keep the item.
          </Text>
        </PrivacySection>

        <PrivacySection title="Sharing & Backups">
          <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
            You can export your data as a backup file at any time.
            {'\n'}
            Data only leaves your device if you choose to export or share it.
          </Text>
        </PrivacySection>

        <PrivacySection title="Purchases (if enabled)">
          <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
            Subscriptions are processed securely by Apple.
            {'\n'}
            We do not sell your data or use advertising trackers.
          </Text>
        </PrivacySection>

        <PrimaryButton label="View Full Privacy Policy" variant="secondary" onPress={() => void openPrivacyPolicy()} />
      </Card>
    </Screen>
  );
};
