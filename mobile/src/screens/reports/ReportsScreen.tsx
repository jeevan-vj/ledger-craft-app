import React from 'react';
import {ScrollView,Text} from 'react-native';
import {useTabScreenInsets} from '@/hooks/useTabScreenInsets';
import {space,useTheme} from '@/theme';
import {FinancialReportWorkspace} from '@/components/reports/FinancialReportWorkspace';
import {GstWorkspacePanel} from '@/components/reports/GstWorkspacePanel';
import {CompanyTaxPanel} from '@/components/reports/CompanyTaxPanel';
export default function ReportsScreen(){const theme=useTheme();const {bottomPadding}=useTabScreenInsets();return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{backgroundColor:theme.colors.background}} contentContainerStyle={{padding:space.screen,paddingBottom:bottomPadding,gap:space.lg}}><Text style={theme.type.title}>Financial reports</Text><Text style={theme.type.subhead}>Server-calculated from posted journals</Text><FinancialReportWorkspace/><GstWorkspacePanel/><CompanyTaxPanel/></ScrollView>;}
