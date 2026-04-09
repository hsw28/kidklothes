import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAppTheme } from '@/theme';

type Props = {
  visible: boolean;
  title?: string;
  initialName?: string;
  submitLabel?: string;
  deleteLabel?: string;
  onDismiss: () => void;
  onSubmit: (input: { name: string }) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
};

export const CustomTagModal: React.FC<Props> = ({
  visible,
  title = 'Create custom tag',
  initialName = '',
  submitLabel = 'Save tag',
  deleteLabel = 'Delete tag',
  onDismiss,
  onSubmit,
  onDelete,
}) => {
  const theme = useAppTheme();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setName(initialName);
  }, [initialName, visible]);

  const styles = useMemo(() => StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(17,24,39,0.26)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      borderRadius: 24,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      gap: 14,
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
    actions: {
      gap: 10,
    },
  }), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>Create a reusable tag for your family’s real-life routines and special moments.</Text>
          <FormInput label="Tag name" value={name} onChangeText={setName} placeholder="e.g. Grandma's house" autoCapitalize="words" />
          <View style={styles.actions}>
            <PrimaryButton
              label={saving ? 'Saving...' : submitLabel}
              disabled={!name.trim() || saving}
              onPress={async () => {
                if (!name.trim() || saving) return;
                setSaving(true);
                try {
                  await onSubmit({ name: name.trim() });
                } finally {
                  setSaving(false);
                }
              }}
            />
            {onDelete ? <PrimaryButton label={deleteLabel} variant="dangerSecondary" onPress={() => void onDelete()} /> : null}
            <PrimaryButton label="Cancel" variant="secondary" onPress={onDismiss} />
          </View>
        </View>
      </View>
    </Modal>
  );
};
