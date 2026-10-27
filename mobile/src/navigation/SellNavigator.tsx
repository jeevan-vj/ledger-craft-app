import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SellScreen from '@/screens/sales/SellScreen';
import type { SellStackParamList } from './types';
import { createListHeaderOptions } from '@/theme/navigation';
import { useTheme } from '@/theme';

const SellStack = createNativeStackNavigator<SellStackParamList>();

export function SellNavigator() {
  const { colors } = useTheme();
  return (
    <SellStack.Navigator screenOptions={createListHeaderOptions(colors)}>
      <SellStack.Screen name="SellHome" component={SellScreen} options={{ title: 'Sell' }} />
    </SellStack.Navigator>
  );
}
