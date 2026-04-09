import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme } from '@/theme';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onSubmit: (input: { name: string; icon?: string }) => Promise<void> | void;
};

const getInitials = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const CustomCategoryModal: React.FC<Props> = ({ visible, onDismiss, onSubmit }) => {
  const theme = useAppTheme();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [saving, setSaving] = useState(false);
  const previewText = useMemo(() => icon.trim() || getInitials(name) || '+', [icon, name]);

  useEffect(() => {
    if (!visible) {
      setName('');
      setIcon('');
      setSaving(false);
    }
  }, [visible]);

  const styles = StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(18,18,18,0.24)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      borderRadius: 24,
      backgroundColor: theme.colors.background,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    previewBadge: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    previewBadgeText: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    previewLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    previewMeta: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    actions: {
      gap: 10,
    },
    cancel: {
      alignSelf: 'center',
      padding: 6,
    },
    cancelText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Create Category</Text>
          <Text style={styles.body}>Add a custom category to your closet. You can use an emoji or leave it blank and we’ll use initials.</Text>
          <View style={styles.previewRow}>
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>{previewText}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.previewLabel}>{name.trim() || 'New Category'}</Text>
              <Text style={styles.previewMeta}>This will show in your closet grid and category picker.</Text>
            </View>
          </View>
          <FormInput label="Category name" value={name} onChangeText={setName} placeholder="e.g. Uniforms" autoCapitalize="words" />
          <FormInput label="Icon or emoji (optional)" value={icon} onChangeText={setIcon} placeholder="e.g. 🩱" autoCapitalize="none" maxLength={4} />
          <View style={styles.actions}>
            <PrimaryButton
              label={saving ? 'Creating...' : 'Create Category'}
              disabled={!name.trim() || saving}
              onPress={async () => {
                if (!name.trim() || saving) return;
                setSaving(true);
                try {
                  await onSubmit({ name: name.trim(), icon: icon.trim() || undefined });
                } finally {
                  setSaving(false);
                }
              }}
            />
            <Pressable style={styles.cancel} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Cancel creating category">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};
