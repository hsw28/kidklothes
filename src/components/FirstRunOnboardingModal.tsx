import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme } from '@/theme';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onAddFirstItem?: () => void;
};

const pages = [
  {
    title: 'See what you have — and what you need',
    body: 'Track sizes, prints, and what fits now vs next.',
  },
  {
    title: 'Add items in seconds',
    body: 'Paste a link or snap a photo—items are saved instantly.',
  },
  {
    title: 'Stop guessing when you shop',
    body: 'See sizes, prints, and what you already own before you buy.',
  },
];

export const FirstRunOnboardingModal: React.FC<Props> = ({ visible, onDismiss, onAddFirstItem }) => {
  const theme = useAppTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const styles = useMemo(() => StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    shell: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 12,
      gap: 20,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    skipText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.accentPeriwinkle,
    },
    title: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
      maxWidth: '82%',
    },
    pager: {
      flexGrow: 1,
    },
    page: {
      justifyContent: 'center',
      paddingRight: 20,
    },
    card: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 22,
      minHeight: 240,
      justifyContent: 'center',
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    cardCount: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.colors.textSecondary,
      marginBottom: 14,
    },
    cardTitle: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    cardBody: {
      marginTop: 12,
      fontSize: 16,
      lineHeight: 24,
      color: theme.colors.textSecondary,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
    },
    progressText: {
      fontSize: 13,
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    dot: {
      width: 9,
      height: 9,
      borderRadius: 999,
      backgroundColor: theme.colors.border,
    },
    dotActive: {
      width: 24,
      backgroundColor: theme.colors.accentPrimary,
    },
    footer: {
      gap: 10,
    },
    subcopy: {
      fontSize: 13,
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
  }), [theme]);

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [visible]);

  const goNext = () => {
    if (activeIndex >= pages.length - 1) {
      (onAddFirstItem ?? onDismiss)();
      return;
    }
    const nextIndex = activeIndex + 1;
    setActiveIndex(nextIndex);
    if (pageWidth > 0) {
      scrollRef.current?.scrollTo({ x: nextIndex * pageWidth, animated: true });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onDismiss}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.shell}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>See what you have — and what you need</Text>
            <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Skip onboarding">
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.pager}
            onLayout={(event) => {
              const width = Math.round(event.nativeEvent.layout.width);
              if (width > 0 && width !== pageWidth) setPageWidth(width);
            }}
            onMomentumScrollEnd={(event) => {
              if (!pageWidth) return;
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
              setActiveIndex(Math.max(0, Math.min(pages.length - 1, nextIndex)));
            }}
          >
            {pages.map((page, index) => (
              <View key={page.title} style={[styles.page, { width: pageWidth || undefined }]}>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{page.title}</Text>
                  <Text style={styles.cardBody}>{page.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Text style={styles.progressText}>{`${activeIndex + 1} of ${pages.length}`}</Text>
          <View style={styles.dots}>
            {pages.map((page, index) => (
              <View key={page.title} style={[styles.dot, index === activeIndex ? styles.dotActive : null]} />
            ))}
          </View>

          <View style={styles.footer}>
            <PrimaryButton label={activeIndex === pages.length - 1 ? 'Add your first item' : 'Next'} onPress={goNext} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};
