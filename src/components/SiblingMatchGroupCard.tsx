import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RemoteImage } from '@/components/RemoteImage';
import { useAppTheme } from '@/theme';
import { SiblingMatchGroup } from '@/utils/siblingMatches';

type Props = {
  group: SiblingMatchGroup;
  locked?: boolean;
  onPress?: () => void;
  onUnlock?: () => void;
  onAddMissingToWishlist?: (childId: string) => void;
  onOpenItem?: (itemId: string) => void;
  showActions?: boolean;
};

export const SiblingMatchGroupCard: React.FC<Props> = ({
  group,
  locked = false,
  onPress,
  onUnlock,
  onAddMissingToWishlist,
  onOpenItem,
  showActions = true,
}) => {
  const theme = useAppTheme();
  const styles = StyleSheet.create({
    pressable: {
      position: 'relative',
    },
    card: {
      gap: 14,
      overflow: 'hidden',
    },
    topRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    image: {
      width: 76,
      height: 76,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceMuted,
    },
    header: {
      flex: 1,
      gap: 4,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    meta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    missingMeta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    completeBadge: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: theme.colors.accentSageSoft,
    },
    completeBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    rows: {
      gap: 8,
    },
    childRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 8,
    },
    childRowPressed: {
      opacity: 0.9,
    },
    childName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    childSize: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontWeight: '600',
    },
    missingWrap: {
      gap: 10,
      paddingTop: 2,
    },
    missingRow: {
      gap: 8,
      padding: 12,
      borderRadius: 14,
      backgroundColor: theme.colors.accentCoralSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    missingText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.isDark ? 'rgba(17,24,39,0.82)' : 'rgba(255,255,255,0.96)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
      gap: 8,
    },
    overlayTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      textAlign: 'center',
    },
    overlayBody: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    lockedSkeleton: {
      gap: 10,
    },
    lockedLine: {
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
  });

  const maskedContent = (
    <Card style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.image} />
        <View style={styles.header}>
          <View style={[styles.lockedLine, { width: '72%', height: 18 }]} />
          <View style={[styles.lockedLine, { width: '48%', height: 14 }]} />
        </View>
      </View>
      <View style={styles.lockedSkeleton}>
        <View style={[styles.lockedLine, { width: '100%', height: 40 }]} />
        <View style={[styles.lockedLine, { width: '100%', height: 40 }]} />
        <View style={[styles.lockedLine, { width: '84%', height: 46 }]} />
      </View>
    </Card>
  );

  const content = (
    <Card style={styles.card}>
      <View style={styles.topRow}>
        <RemoteImage uri={group.representativeImage} style={styles.image} fallbackLabel={group.label} />
        <View style={styles.header}>
          <Text style={styles.title}>{group.label}</Text>
          <Text style={styles.meta}>
            {group.childrenPresent.length} of {group.totalChildren} kids matched
          </Text>
          {group.missingChildren.length === 0 ? (
            <View style={styles.completeBadge}>
              <Text style={styles.completeBadgeText}>Complete match</Text>
            </View>
          ) : (
            <Text style={styles.missingMeta}>
              Missing: {group.missingChildren.map((child) => child.childName).join(', ')}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.rows}>
        {group.items.map((item) => (
          <Pressable
            key={`${item.itemId}-${item.childId}`}
            onPress={onOpenItem ? () => onOpenItem(item.itemId) : undefined}
            disabled={!onOpenItem}
            style={({ pressed }) => [styles.childRow, pressed && onOpenItem ? styles.childRowPressed : null]}
            accessibilityRole={onOpenItem ? 'button' : undefined}
            accessibilityLabel={onOpenItem ? `Open ${item.childName} ${group.label}` : undefined}
          >
            <Text style={styles.childName}>{item.childName}</Text>
            <Text style={styles.childSize}>{item.size}</Text>
          </Pressable>
        ))}
      </View>

      {group.missingChildren.length > 0 ? (
        <View style={styles.missingWrap}>
          {group.missingChildren.map((child) => (
            <View key={child.childId} style={styles.missingRow}>
              <Text style={styles.missingText}>Missing: {child.childName}</Text>
              {showActions && onAddMissingToWishlist ? (
                <PrimaryButton label="Add to wishlist" variant="secondary" onPress={() => onAddMissingToWishlist(child.childId)} />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );

  if (!locked) {
    if (!onPress) return content;
    return <Pressable style={styles.pressable} onPress={onPress}>{content}</Pressable>;
  }

  return (
    <Pressable style={styles.pressable} onPress={onUnlock} accessibilityRole="button" accessibilityLabel="Unlock sibling matching">
      <View pointerEvents="none">{maskedContent}</View>
      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>Sibling matching is a Pro feature</Text>
        <Text style={styles.overlayBody}>Unlock to see shared prints and styles across your kids.</Text>
        {onUnlock ? <PrimaryButton label="Unlock Pro" onPress={onUnlock} /> : null}
      </View>
    </Pressable>
  );
};
