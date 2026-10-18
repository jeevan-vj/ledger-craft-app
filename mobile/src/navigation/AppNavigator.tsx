import React from 'react';
import { Platform, type ImageSourcePropType } from 'react-native';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { AppleIcon } from 'react-native-bottom-tabs';
import {
  HomeStackParamList,
  InvoiceStackParamList,
  ExpenseStackParamList,
  PurchaseStackParamList,
  SettingsStackParamList,
  MainTabParamList,
} from './types';
import {
  COLORS,
  listHeaderOptions,
  formHeaderOptions,
  detailHeaderOptions,
} from '@/theme/navigation';

import DashboardScreen from '@/screens/main/DashboardScreen';
import InvoiceListScreen from '@/screens/invoices/InvoiceListScreen';
import InvoiceCreateScreen from '@/screens/invoices/InvoiceCreateScreen';
import InvoiceDetailScreen from '@/screens/invoices/InvoiceDetailScreen';
import ExpenseListScreen from '@/screens/expenses/ExpenseListScreen';
import ExpenseCreateScreen from '@/screens/expenses/ExpenseCreateScreen';
import ExpenseEditScreen from '@/screens/expenses/ExpenseEditScreen';
import PurchaseListScreen from '@/screens/purchases/PurchaseListScreen';
import BillDetailScreen from '@/screens/purchases/BillDetailScreen';
import BillFormScreen from '@/screens/purchases/BillFormScreen';
import SettingsScreen from '@/screens/settings/SettingsScreen';
import BusinessSettingsScreen from '@/screens/settings/BusinessSettingsScreen';

const Tab = createNativeBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const InvoiceStack = createNativeStackNavigator<InvoiceStackParamList>();
const ExpenseStack = createNativeStackNavigator<ExpenseStackParamList>();
const PurchaseStack = createNativeStackNavigator<PurchaseStackParamList>();
const SettingsStackNav = createNativeStackNavigator<SettingsStackParamList>();

function tabIcon(sfSymbol: SFSymbol, androidAsset: ImageSourcePropType) {
  return (): ImageSourcePropType | AppleIcon =>
    Platform.OS === 'ios' ? { sfSymbol } : androidAsset;
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={listHeaderOptions}>
      <HomeStack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={{ title: 'Home' }}
      />
    </HomeStack.Navigator>
  );
}

function InvoiceNavigator() {
  return (
    <InvoiceStack.Navigator screenOptions={listHeaderOptions}>
      <InvoiceStack.Screen
        name="InvoiceList"
        component={InvoiceListScreen}
        options={{ title: 'Invoices' }}
      />
      <InvoiceStack.Screen
        name="InvoiceCreate"
        component={InvoiceCreateScreen}
        options={{
          ...formHeaderOptions,
          title: 'New invoice',
        }}
      />
      <InvoiceStack.Screen
        name="InvoiceEdit"
        component={InvoiceCreateScreen}
        options={{
          ...formHeaderOptions,
          title: 'Edit invoice',
        }}
      />
      <InvoiceStack.Screen
        name="InvoiceDetail"
        component={InvoiceDetailScreen}
        options={{
          ...detailHeaderOptions,
          title: 'Invoice',
        }}
      />
    </InvoiceStack.Navigator>
  );
}

function ExpenseNavigator() {
  return (
    <ExpenseStack.Navigator screenOptions={listHeaderOptions}>
      <ExpenseStack.Screen
        name="ExpenseList"
        component={ExpenseListScreen}
        options={{ title: 'Expenses' }}
      />
      <ExpenseStack.Screen
        name="ExpenseCreate"
        component={ExpenseCreateScreen}
        options={{
          ...formHeaderOptions,
          title: 'New expense',
        }}
      />
      <ExpenseStack.Screen
        name="ExpenseEdit"
        component={ExpenseEditScreen}
        options={{
          ...formHeaderOptions,
          title: 'Edit expense',
        }}
      />
    </ExpenseStack.Navigator>
  );
}

function PurchaseNavigator() {
  return (
    <PurchaseStack.Navigator screenOptions={listHeaderOptions}>
      <PurchaseStack.Screen name="PurchaseList" component={PurchaseListScreen} options={{ title: 'Purchases' }} />
      <PurchaseStack.Screen name="BillCreate" component={BillFormScreen} options={{ ...formHeaderOptions, title: 'New bill' }} />
      <PurchaseStack.Screen name="BillEdit" component={BillFormScreen} options={{ ...formHeaderOptions, title: 'Edit bill' }} />
      <PurchaseStack.Screen name="BillDetail" component={BillDetailScreen} options={{ ...detailHeaderOptions, title: 'Bill' }} />
    </PurchaseStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStackNav.Navigator screenOptions={listHeaderOptions}>
      <SettingsStackNav.Screen
        name="SettingsList"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <SettingsStackNav.Screen
        name="BusinessSettings"
        component={BusinessSettingsScreen}
        options={{
          ...detailHeaderOptions,
          title: 'Business',
        }}
      />
    </SettingsStackNav.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      labeled
      hapticFeedbackEnabled
      tabBarActiveTintColor={COLORS.accentForeground}
      tabBarInactiveTintColor={COLORS.textSecondary}
    >
      <Tab.Screen
        name="Dashboard"
        component={HomeNavigator}
        options={{
          title: 'Home',
          tabBarIcon: tabIcon('house.fill', require('../../assets/tabs/home.png')),
        }}
      />
      <Tab.Screen
        name="Invoices"
        component={InvoiceNavigator}
        options={{
          title: 'Invoices',
          tabBarIcon: tabIcon('doc.text.fill', require('../../assets/tabs/invoices.png')),
        }}
      />
      <Tab.Screen
        name="Expenses"
        component={ExpenseNavigator}
        options={{
          title: 'Expenses',
          tabBarIcon: tabIcon('dollarsign.circle.fill', require('../../assets/tabs/expenses.png')),
        }}
      />
      <Tab.Screen
        name="Purchases"
        component={PurchaseNavigator}
        options={{
          title: 'Purchases',
          tabBarIcon: tabIcon('cart.fill', require('../../assets/tabs/purchases.png')),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsNavigator}
        options={{
          title: 'Settings',
          tabBarIcon: tabIcon('gearshape.fill', require('../../assets/tabs/settings.png')),
        }}
      />
    </Tab.Navigator>
  );
}
