import React from 'react';
import {ScrollView} from 'react-native';
import {useTabScreenInsets} from '@/hooks/useTabScreenInsets';
import {space,useTheme} from '@/theme';
import {CustomerStatementWorkspace} from '@/features/customer-statements/CustomerStatementWorkspace';
export default function CustomerStatementsScreen({route}:{route?:{params?:{customerId?:string}}}){const theme=useTheme(),{bottomPadding}=useTabScreenInsets();return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{backgroundColor:theme.colors.background}} contentContainerStyle={{padding:space.screen,paddingBottom:bottomPadding}}><CustomerStatementWorkspace initialCustomerId={route?.params?.customerId}/></ScrollView>;}
