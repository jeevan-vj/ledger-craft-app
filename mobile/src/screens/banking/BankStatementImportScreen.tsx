import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EmptyState, GroupedSection, ListRow, ModernButton } from '@/components/ui';
import { bankingApi } from '@/features/banking/api/bankingApi';
import { parseBankStatementCsv, type StatementTransactionInput } from '@/features/banking/model/statementImport';
import type { MoreStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { radius, space } from '@/theme/tokens';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankStatementImport'>;
type Route = RouteProp<MoreStackParamList, 'BankStatementImport'>;

export default function BankStatementImportScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();
  const { bankAccountId } = useRoute<Route>().params;
  const [fileName, setFileName] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<StatementTransactionInput[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const chooseStatement = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    try {
      const asset = result.assets[0];
      const content = await new File(asset.uri).text();
      const parsed = parseBankStatementCsv(content);
      setFileName(asset.name);
      setTransactions(parsed);
      setParseError(null);
    } catch (error) {
      setFileName(null);
      setTransactions([]);
      setParseError(error instanceof Error ? error.message : 'This statement could not be read.');
    }
  };

  const importStatement = useMutation({
    mutationFn: () => bankingApi.importTransactions({ bankAccountId, fileName: fileName!, fileType: 'csv', skipDuplicates: true, transactions }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['banking', 'transactions', bankAccountId] });
      await queryClient.invalidateQueries({ queryKey: ['banking', 'account', bankAccountId] });
      Alert.alert('Statement imported', `${result.importedCount} transaction${result.importedCount === 1 ? '' : 's'} added${result.duplicatesSkipped ? ` · ${result.duplicatesSkipped} duplicate${result.duplicatesSkipped === 1 ? '' : 's'} skipped` : ''}.`, [{ text: 'Done', onPress: () => navigation.goBack() }]);
    },
  });

  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <View style={[styles.introIcon, { backgroundColor: theme.colors.accentFill }]}><Feather name="upload" size={26} color={theme.colors.accentText} /></View>
    <Text style={[theme.type.title, styles.centerText]}>Import a bank statement</Text>
    <Text style={[theme.type.subhead, styles.description]}>Choose a CSV with Date, Description and Amount columns. Debit/Credit columns are also supported.</Text>

    <ModernButton fullWidth variant="secondary" icon={<Feather name="file-text" size={18} color={theme.colors.text} />} onPress={() => void chooseStatement()}>{fileName ? 'Choose another CSV' : 'Choose CSV file'}</ModernButton>
    {parseError ? <View style={[styles.message, { backgroundColor: theme.colors.dangerFill }]}><Text style={[theme.type.footnote, { color: theme.colors.danger }]}>{parseError}</Text></View> : null}

    {fileName ? <>
      <GroupedSection title="Statement"><ListRow label={fileName} value={`${transactions.length} row${transactions.length === 1 ? '' : 's'}`} showChevron={false} /></GroupedSection>
      <GroupedSection title="Preview">{transactions.slice(0, 5).map((transaction, index) => <ListRow key={`${transaction.transactionDate}-${index}`} label={transaction.description} subtitle={transaction.transactionDate} value={`${transaction.type === 'debit' ? '−' : '+'}${transaction.amount}`} showChevron={false} />)}</GroupedSection>
      {transactions.length > 5 ? <Text style={[theme.type.footnote, styles.more, { color: theme.colors.textSecondary }]}>And {transactions.length - 5} more transactions</Text> : null}
      {importStatement.error ? <View style={[styles.message, { backgroundColor: theme.colors.dangerFill }]}><Text style={[theme.type.footnote, { color: theme.colors.danger }]}>{importStatement.error.message}</Text></View> : null}
      <ModernButton fullWidth loading={importStatement.isPending} disabled={!transactions.length} onPress={() => importStatement.mutate()}>Import {transactions.length} transaction{transactions.length === 1 ? '' : 's'}</ModernButton>
      <Text style={[theme.type.footnote, styles.duplicateNote]}>Exact duplicate rows already in this account will be skipped.</Text>
    </> : !parseError ? <EmptyState title="No statement selected" description="Your CSV stays on this device until you confirm the import." /> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: space.screen, paddingBottom: 48, flexGrow: 1 }, introIcon: { width: 60, height: 60, borderRadius: radius.pill, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginTop: space.sm, marginBottom: space.md },
  centerText: { textAlign: 'center' }, description: { textAlign: 'center', marginTop: space.sm, marginBottom: space.xxl, lineHeight: 21 },
  message: { borderRadius: radius.md, padding: space.md, marginTop: space.md }, more: { textAlign: 'center', marginTop: -space.sm, marginBottom: space.xl }, duplicateNote: { textAlign: 'center', marginTop: space.sm },
});
