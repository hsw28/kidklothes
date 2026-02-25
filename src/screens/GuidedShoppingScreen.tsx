import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChipSelector } from '@/components/ChipSelector';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClothingType } from '@/models';
import { ClosetStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<ClosetStackParamList, 'GuidedShopping'>;

const shoppingTypes: ClothingType[] = ['bottom', 'top', 'sleeper', 'romper', 'dress', 'outerwear', 'shoes', 'accessory'];

export const GuidedShoppingScreen: React.FC<Props> = ({ navigation }) => {
  const { addChild } = useData();
  const [childName, setChildName] = useState('');
  const [currentSize, setCurrentSize] = useState('');
  const [clothingType, setClothingType] = useState<ClothingType>('bottom');

  const continueFlow = async () => {
    if (!childName.trim() || !currentSize.trim()) {
      Alert.alert('Missing fields', 'Add child name and current size.');
      return;
    }
    const child = await addChild({ name: childName.trim(), notes: `Current size: ${currentSize.trim()}` });
    if (!child) return;
    navigation.replace('GuidedSnapshot', {
      childId: child.id,
      currentSize: currentSize.trim(),
      clothingType,
    });
  };

  return (
    <Screen>
      <Text style={styles.title}>Who are you shopping for?</Text>
      <FormInput label="Child name" value={childName} onChangeText={setChildName} placeholder="Ava" />
      <FormInput label="Current size" value={currentSize} onChangeText={setCurrentSize} placeholder="2T" />
      <ChipSelector label="Thinking about buying" options={shoppingTypes} value={clothingType} onChange={setClothingType} />
      <PrimaryButton label="Continue" onPress={continueFlow} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
});
