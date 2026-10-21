import React from 'react';
import { Platform, type ImageSourcePropType } from 'react-native';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { AppleIcon } from 'react-native-bottom-tabs';
import type { CustomerStackParamList, HomeStackParamList, InvoiceStackParamList, MainTabParamList, MoreStackParamList } from './types';
import { createDetailHeaderOptions, createFormHeaderOptions, createListHeaderOptions } from '@/theme/navigation';
import { useTheme } from '@/theme';
import DashboardScreen from '@/screens/main/DashboardScreen';
import InvoiceListScreen from '@/screens/invoices/InvoiceListScreen';
import InvoiceCreateScreen from '@/screens/invoices/InvoiceCreateScreen';
import InvoiceDetailScreen from '@/screens/invoices/InvoiceDetailScreen';
import CustomerListScreen from '@/screens/customers/CustomerListScreen';
import CustomerDetailScreen from '@/screens/customers/CustomerDetailScreen';
import CustomerFormScreen from '@/screens/customers/CustomerFormScreen';
import ExpenseListScreen from '@/screens/expenses/ExpenseListScreen';
import ExpenseCreateScreen from '@/screens/expenses/ExpenseCreateScreen';
import ExpenseEditScreen from '@/screens/expenses/ExpenseEditScreen';
import PurchaseListScreen from '@/screens/purchases/PurchaseListScreen';
import BillDetailScreen from '@/screens/purchases/BillDetailScreen';
import BillFormScreen from '@/screens/purchases/BillFormScreen';
import SettingsScreen from '@/screens/settings/SettingsScreen';
import BusinessSettingsScreen from '@/screens/settings/BusinessSettingsScreen';
import ItemListScreen from '@/screens/items/ItemListScreen';
import ItemFormScreen from '@/screens/items/ItemFormScreen';
import ItemDetailScreen from '@/screens/items/ItemDetailScreen';
import BankAccountListScreen from '@/screens/banking/BankAccountListScreen';
import BankAccountFormScreen from '@/screens/banking/BankAccountFormScreen';
import BankAccountDetailScreen from '@/screens/banking/BankAccountDetailScreen';
import QuoteListScreen from '@/screens/quotes/QuoteListScreen';
import QuoteFormScreen from '@/screens/quotes/QuoteFormScreen';
import QuoteDetailScreen from '@/screens/quotes/QuoteDetailScreen';

const Tab = createNativeBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const InvoiceStack = createNativeStackNavigator<InvoiceStackParamList>();
const CustomerStack = createNativeStackNavigator<CustomerStackParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

function tabIcon(sfSymbol: SFSymbol, androidAsset: ImageSourcePropType) {
  return (): ImageSourcePropType | AppleIcon => Platform.OS === 'ios' ? { sfSymbol } : androidAsset;
}

function HomeNavigator() {
  const { colors } = useTheme();
  return <HomeStack.Navigator screenOptions={createListHeaderOptions(colors)}><HomeStack.Screen name="DashboardHome" component={DashboardScreen} options={{ headerShown: false }} /></HomeStack.Navigator>;
}
function InvoiceNavigator() {
  const { colors } = useTheme(); const list = createListHeaderOptions(colors); const form = createFormHeaderOptions(colors); const detail = createDetailHeaderOptions(colors);
  return <InvoiceStack.Navigator screenOptions={list}>
    <InvoiceStack.Screen name="InvoiceList" component={InvoiceListScreen} options={{ title: 'Invoices' }} />
    <InvoiceStack.Screen name="InvoiceCreate" component={InvoiceCreateScreen} options={{ ...form, title: 'New invoice' }} />
    <InvoiceStack.Screen name="InvoiceEdit" component={InvoiceCreateScreen} options={{ ...form, title: 'Edit invoice' }} />
    <InvoiceStack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ ...detail, title: 'Invoice' }} />
    <InvoiceStack.Screen name="QuoteList" component={QuoteListScreen} options={{ title: 'Quotes' }} />
    <InvoiceStack.Screen name="QuoteCreate" component={QuoteFormScreen} options={{ ...form, title: 'New quote' }} />
    <InvoiceStack.Screen name="QuoteEdit" component={QuoteFormScreen} options={{ ...form, title: 'Edit quote' }} />
    <InvoiceStack.Screen name="QuoteDetail" component={QuoteDetailScreen} options={{ ...detail, title: 'Quote' }} />
    <InvoiceStack.Screen name="BusinessSettings" component={BusinessSettingsScreen} options={{ ...detail, title: 'Business' }} />
  </InvoiceStack.Navigator>;
}
function CustomerNavigator() {
  const { colors } = useTheme(); const list = createListHeaderOptions(colors); const form = createFormHeaderOptions(colors); const detail = createDetailHeaderOptions(colors);
  return <CustomerStack.Navigator screenOptions={list}>
    <CustomerStack.Screen name="CustomerList" component={CustomerListScreen} options={{ title: 'Customers' }} />
    <CustomerStack.Screen name="CustomerCreate" component={CustomerFormScreen} options={{ ...form, title: 'New customer' }} />
    <CustomerStack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ ...detail, title: 'Customer' }} />
    <CustomerStack.Screen name="CustomerEdit" component={CustomerFormScreen} options={{ ...form, title: 'Edit customer' }} />
  </CustomerStack.Navigator>;
}
function MoreNavigator() {
  const { colors } = useTheme(); const list = createListHeaderOptions(colors); const form = createFormHeaderOptions(colors); const detail = createDetailHeaderOptions(colors);
  return <MoreStack.Navigator screenOptions={list}>
    <MoreStack.Screen name="SettingsList" component={SettingsScreen} options={{ title: 'More', headerShown: false }} />
    <MoreStack.Screen name="BusinessSettings" component={BusinessSettingsScreen} options={{ ...detail, title: 'Business' }} />
    <MoreStack.Screen name="ItemList" component={ItemListScreen} options={{ title: 'Items' }} />
    <MoreStack.Screen name="ItemCreate" component={ItemFormScreen} options={{ ...form, title: 'New item' }} />
    <MoreStack.Screen name="ItemEdit" component={ItemFormScreen} options={{ ...form, title: 'Edit item' }} />
    <MoreStack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ ...detail, title: 'Item' }} />
    <MoreStack.Screen name="BankAccountList" component={BankAccountListScreen} options={{ title: 'Bank accounts' }} />
    <MoreStack.Screen name="BankAccountCreate" component={BankAccountFormScreen} options={{ ...form, title: 'New bank account' }} />
    <MoreStack.Screen name="BankAccountEdit" component={BankAccountFormScreen} options={{ ...form, title: 'Edit bank account' }} />
    <MoreStack.Screen name="BankAccountDetail" component={BankAccountDetailScreen} options={{ ...detail, title: 'Bank account' }} />
    <MoreStack.Screen name="ExpenseList" component={ExpenseListScreen} options={{ title: 'Expenses' }} />
    <MoreStack.Screen name="ExpenseCreate" component={ExpenseCreateScreen} options={{ ...form, title: 'New expense' }} />
    <MoreStack.Screen name="ExpenseEdit" component={ExpenseEditScreen} options={{ ...form, title: 'Edit expense' }} />
    <MoreStack.Screen name="PurchaseList" component={PurchaseListScreen} options={{ title: 'Purchases' }} />
    <MoreStack.Screen name="BillCreate" component={BillFormScreen} options={{ ...form, title: 'New bill' }} />
    <MoreStack.Screen name="BillEdit" component={BillFormScreen} options={{ ...form, title: 'Edit bill' }} />
    <MoreStack.Screen name="BillDetail" component={BillDetailScreen} options={{ ...detail, title: 'Bill' }} />
  </MoreStack.Navigator>;
}

export default function AppNavigator() {
  const theme = useTheme();
  return <Tab.Navigator
    labeled hapticFeedbackEnabled
    tabBarActiveTintColor={theme.colors.accent}
    tabBarInactiveTintColor={theme.colors.textSecondary}
    activeIndicatorColor={theme.colors.accentFill}
  >
    <Tab.Screen name="Dashboard" component={HomeNavigator} options={{ title: 'Home', tabBarIcon: tabIcon('house.fill', require('../../assets/tabs/home.png')) }} />
    <Tab.Screen name="Invoices" component={InvoiceNavigator} options={{ title: 'Invoices', tabBarIcon: tabIcon('doc.text.fill', require('../../assets/tabs/invoices.png')) }} />
    <Tab.Screen name="Customers" component={CustomerNavigator} options={{ title: 'Customers', tabBarIcon: tabIcon('person.2.fill', require('../../assets/tabs/customers.png')) }} />
    <Tab.Screen name="More" component={MoreNavigator} options={{ title: 'More', tabBarIcon: tabIcon('ellipsis.circle.fill', require('../../assets/tabs/settings.png')) }} />
  </Tab.Navigator>;
}
