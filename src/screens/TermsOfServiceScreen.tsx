import React from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SUPPORT_EMAIL, TERMS_EFFECTIVE_DATE } from '@/constants/legal';
import { useAppTheme } from '@/theme';

const Paragraph: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted = false }) => {
  const theme = useAppTheme();
  return (
    <Text
      selectable
      style={{
        color: muted ? theme.colors.textMuted : theme.colors.text,
        fontSize: 15,
        lineHeight: 22,
      }}
    >
      {children}
    </Text>
  );
};

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useAppTheme();
  return (
    <Text selectable style={{ color: theme.colors.text, fontSize: 17, fontWeight: '700' }}>
      {children}
    </Text>
  );
};

const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Text selectable style={{ color: theme.colors.textMuted, fontSize: 15, lineHeight: 22 }}>
        {'\u2022'}
      </Text>
      <Text selectable style={{ flex: 1, color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
        {children}
      </Text>
    </View>
  );
};

export const TermsOfServiceScreen: React.FC = () => {
  const theme = useAppTheme();
  return (
    <Screen>
      <Card style={{ gap: 14 }}>
        <Text
          selectable
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.serif,
            fontSize: 26,
            fontWeight: '600',
          }}
        >
          Terms of Service
          {'\n'}
          Layette Out
        </Text>
        <Paragraph muted>{`Effective Date: ${TERMS_EFFECTIVE_DATE}`}</Paragraph>

        <Paragraph>
          These Terms of Service (“Terms”) govern your use of the Layette Out mobile application (the “App”). By using the App,
          you agree to these Terms.
        </Paragraph>
        <Paragraph>If you do not agree, please do not use the App.</Paragraph>

        <Heading>1. Operator</Heading>
        <Paragraph>Layette Out is independently developed and operated by its creator (“we,” “us,” or “our”).</Paragraph>

        <Heading>2. Eligibility</Heading>
        <Paragraph>
          The App is intended for use by adults, including parents and caregivers organizing children’s clothing information.
          {'\n'}
          You represent that you are legally capable of entering into this agreement.
        </Paragraph>

        <Heading>3. License to Use the App</Heading>
        <Paragraph>
          We grant you a limited, non-exclusive, non-transferable, revocable license to use the App for personal, non-commercial
          purposes.
          {'\n'}
          You may not:
        </Paragraph>
        <Bullet>Reverse engineer the App</Bullet>
        <Bullet>Resell or redistribute the App</Bullet>
        <Bullet>Use the App for unlawful purposes</Bullet>

        <Heading>4. User-Entered Content</Heading>
        <Paragraph>
          The App allows you to enter and store:
        </Paragraph>
        <Bullet>Children’s names and optional photos</Bullet>
        <Bullet>Clothing item information</Bullet>
        <Bullet>Pricing and resale details</Bullet>
        <Bullet>Notes and organizational data</Bullet>
        <Paragraph>
          All content you enter remains your responsibility.
          {'\n'}
          You agree not to enter unlawful, harmful, or infringing content.
        </Paragraph>

        <Heading>5. Local Storage & Data Responsibility</Heading>
        <Paragraph>
          Layette Out is a local-first application.
          {'\n'}
          Data is stored on your device unless you export or share it.
          {'\n'}
          You are responsible for:
        </Paragraph>
        <Bullet>Maintaining device backups</Bullet>
        <Bullet>Protecting access to your device</Bullet>
        <Paragraph>
          We are not responsible for data loss due to device failure, deletion, or user error.
        </Paragraph>

        <Heading>6. Link Previews</Heading>
        <Paragraph>
          When you paste a product URL, the App may retrieve metadata (such as title or image) from that webpage.
          {'\n'}
          We are not responsible for the accuracy, legality, or availability of third-party content.
        </Paragraph>

        <Heading>7. Purchases & Subscriptions (If Enabled)</Heading>
        <Paragraph>If subscriptions or one-time purchases are offered:</Paragraph>
        <Bullet>Payments are processed through Apple’s App Store</Bullet>
        <Bullet>Google Play billing terms apply on Android, if Android purchases are enabled later</Bullet>
        <Bullet>Subscriptions renew automatically unless canceled</Bullet>
        <Bullet>Refunds are governed by the policies of the store where you purchased</Bullet>
        <Paragraph>We do not process payments directly.</Paragraph>

        <Heading>8. No Professional or Financial Advice</Heading>
        <Paragraph>
          Any pricing, resale tracking, or organization features are informational tools only.
          {'\n'}
          We do not provide financial, legal, or resale advice.
          {'\n'}
          You are solely responsible for pricing or resale decisions.
        </Paragraph>

        <Heading>9. Disclaimer of Warranties</Heading>
        <Paragraph>
          The App is provided “as is” and “as available.”
          {'\n'}
          To the fullest extent permitted by law, we disclaim all warranties, express or implied, including:
        </Paragraph>
        <Bullet>Merchantability</Bullet>
        <Bullet>Fitness for a particular purpose</Bullet>
        <Bullet>Non-infringement</Bullet>
        <Paragraph>We do not guarantee the App will be uninterrupted, secure, or error-free.</Paragraph>

        <Heading>10. Limitation of Liability</Heading>
        <Paragraph>To the maximum extent permitted by law, we shall not be liable for:</Paragraph>
        <Bullet>Data loss</Bullet>
        <Bullet>Device damage</Bullet>
        <Bullet>Financial losses</Bullet>
        <Bullet>Lost profits</Bullet>
        <Bullet>Indirect or consequential damages</Bullet>
        <Paragraph>Your use of the App is at your own risk.</Paragraph>

        <Heading>11. Intellectual Property</Heading>
        <Paragraph>
          The App, including its design, branding, and software, is owned by its developer and protected by intellectual property
          laws.
          {'\n'}
          You may not copy or reproduce the App without permission.
        </Paragraph>

        <Heading>12. Changes to the App</Heading>
        <Paragraph>We may update, modify, or discontinue features at any time without liability.</Paragraph>

        <Heading>13. Termination</Heading>
        <Paragraph>
          You may stop using the App at any time by deleting it from your device.
          {'\n'}
          We reserve the right to suspend access if the App is used unlawfully.
        </Paragraph>

        <Heading>14. Governing Law</Heading>
        <Paragraph>
          These Terms are governed by the laws of the United States and the State of Illinois, without regard to conflict of law
          principles.
        </Paragraph>

        <Heading>15. Changes to These Terms</Heading>
        <Paragraph>
          We may update these Terms from time to time. Continued use of the App after updates constitutes acceptance of the revised
          Terms.
        </Paragraph>

        <Heading>16. Contact</Heading>
        <Paragraph>
          For questions about these Terms, contact:
          {'\n'}
          {SUPPORT_EMAIL}
        </Paragraph>
      </Card>
    </Screen>
  );
};
