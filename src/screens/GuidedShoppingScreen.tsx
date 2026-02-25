import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BetaKidLimitModal } from '@/components/BetaKidLimitModal';
import { ChipSelector } from '@/components/ChipSelector';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { ClothingType } from '@/models';
import { ClosetStackParamList } from '@/navigation/types';
import { openKidLimitFeedbackEmail } from '@/utils/betaKidLimitFeedback';

type Props = NativeStackScreenProps<ClosetStackParamList, 'GuidedShopping'>;

const shoppingTypes: ClothingType[] = ['bottom', 'top', 'sleeper', 'romper', 'dress', 'outerwear', 'shoes', 'accessory'];

export const GuidedShoppingScreen: React.FC<Props> = ({ navigation }) => {
  const { addChild, canCreateAnotherKid, children } = useData();
  const [childName, setChildName] = useState('');
  const [currentSize, setCurrentSize] = useState('');
  const [clothingType, setClothingType] = useState<ClothingType>('bottom');
  const [showKidLimitModal, setShowKidLimitModal] = useState(false);
  const [kidLimitCurrentCount, setKidLimitCurrentCount] = useState(children.length);

  const continueFlow = async () => {
    if (!childName.trim() || !currentSize.trim()) {
      Alert.alert('Missing fields', 'Add child name and current size.');
      return;
    }
    const canCreate = await canCreateAnotherKid();
    if (!canCreate.ok) {
      setKidLimitCurrentCount(canCreate.current);
      setShowKidLimitModal(true);
      return;
    }
    let child;
    try {
      child = await addChild({ name: childName.trim(), notes: `Current size: ${currentSize.trim()}` });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'KID_LIMIT_REACHED' || (error instanceof Error && error.message === 'KID_LIMIT_REACHED')) {
        setKidLimitCurrentCount(canCreate.current);
        setShowKidLimitModal(true);
        return;
      }
      throw error;
    }
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
      <BetaKidLimitModal
        visible={showKidLimitModal}
        onClose={() => setShowKidLimitModal(false)}
        onSendFeedback={() => { void openKidLimitFeedbackEmail(kidLimitCurrentCount); }}
      />
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
