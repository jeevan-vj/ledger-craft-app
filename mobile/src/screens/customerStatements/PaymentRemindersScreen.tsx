import React from 'react';
import {ScrollView} from 'react-native';
import {useTabScreenInsets} from '@/hooks/useTabScreenInsets';
import {space,useTheme} from '@/theme';
import {PaymentRemindersWorkspace} from '@/features/customer-statements/PaymentRemindersWorkspace';
export default function PaymentRemindersScreen(){const theme=useTheme(),{bottomPadding}=useTabScreenInsets();return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{backgroundColor:theme.colors.background}} contentContainerStyle={{padding:space.screen,paddingBottom:bottomPadding}}><PaymentRemindersWorkspace/></ScrollView>;}
