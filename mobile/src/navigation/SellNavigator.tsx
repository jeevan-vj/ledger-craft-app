import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SellScreen from '@/screens/sales/SellScreen';
import SalesSummaryScreen from '@/screens/sales/SalesSummaryScreen';
import { NativeHeaderButton } from '@/components/ui/NativeHeaderButton';
import type { SellStackParamList } from './types';
import { createListHeaderOptions } from '@/theme/navigation';
import { useTheme } from '@/theme';

const SellStack = createNativeStackNavigator<SellStackParamList>();

export function SellNavigator() {
  const { colors } = useTheme();
  return (
    <SellStack.Navigator screenOptions={createListHeaderOptions(colors)}>
      <SellStack.Screen name="SellHome" component={SellScreen} options={({ navigation }) => ({ title: 'Sell', headerRight: () => <NativeHeaderButton label="Day summary" onPress={() => navigation.navigate('SalesSummary')} /> })} />
      <SellStack.Screen name="SalesSummary" component={SalesSummaryScreen} options={{ title: 'Day summary' }} />
    </SellStack.Navigator>
  );
}
