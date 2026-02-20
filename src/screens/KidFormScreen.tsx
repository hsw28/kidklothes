import React, { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { KidsStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<KidsStackParamList, 'KidForm'>;

export const KidFormScreen: React.FC<Props> = ({ route, navigation }) => {
  const { children, addChild, updateChild, deleteChild } = useData();
  const editingId = route.params?.childId;
  const existing = useMemo(() => children.find((child) => child.id === editingId), [children, editingId]);

  const [name, setName] = useState(existing?.name ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name.');
      return;
    }

    const payload = {
      name,
      notes: notes || undefined,
    };

    if (existing) {
      await updateChild(existing.id, payload);
    } else {
      await addChild(payload);
    }

    navigation.goBack();
  };

  return (
    <Screen>
      <FormInput label="Name" value={name} onChangeText={setName} placeholder="Ava" />
      <FormInput label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Optional" />

      <PrimaryButton label={existing ? 'Save Changes' : 'Add Kid'} onPress={save} />
      {existing ? (
        <PrimaryButton
          label="Delete Kid"
          variant="danger"
          onPress={async () => {
            await deleteChild(existing.id);
            navigation.goBack();
          }}
        />
      ) : null}
    </Screen>
  );
};
