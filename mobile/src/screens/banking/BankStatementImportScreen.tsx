import React, { useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, FilterPills, GroupedSection, ListRow, ModernButton } from '@/components/ui';
import { bankingApi, type BankTransactionDto } from '@/features/banking/api/bankingApi';
import { previewMappedStatement, statementCsvColumns, type StatementMapping } from '@/features/banking/model/statementMapping';
import type { MoreStackParamList } from '@/navigation/types';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { useTheme } from '@/theme';
import { radius, space } from '@/theme/tokens';

type Navigation = NativeStackNavigationProp<MoreStackParamList, 'BankStatementImport'>;
type Route = RouteProp<MoreStackParamList, 'BankStatementImport'>;
const emptyMapping: StatementMapping = { date: '', description: '', amount: '', debit: '', credit: '', reference: '', dateFormat: 'YYYY-MM-DD' };
function suggestedMapping(headers: string[]): StatementMapping {
  const find = (names: string[]) => headers.find(h => names.includes(h.toLowerCase().replace(/[\s_-]/g, ''))) ?? '';
  return { ...emptyMapping, date: find(['date', 'transactiondate']), description: find(['description', 'details', 'narrative']), amount: find(['amount']), debit: find(['debit', 'withdrawal']), credit: find(['credit', 'deposit']), reference: find(['reference', 'ref']) };
}
export default function BankStatementImportScreen() {
  const { bottomPadding } = useTabScreenInsets();
  const theme = useTheme(); const navigation = useNavigation<Navigation>(); const client = useQueryClient(); const { bankAccountId } = useRoute<Route>().params;
  const [fileName, setFileName] = useState<string | null>(null); const [csv, setCsv] = useState(''); const [mapping, setMapping] = useState(emptyMapping); const [error, setError] = useState(''); const [page, setPage] = useState(1);
  const key = useRef(`mobile-import-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const existing = useQuery({ queryKey: ['banking', 'import-existing', bankAccountId, fileName], enabled: !!fileName, queryFn: async () => {
    const all: BankTransactionDto[] = []; let p = 1; let complete = true;
    do { const result = await bankingApi.listReconciliationTransactions({ bankAccountId, page: p, pageSize: 100 }); all.push(...result.transactions); if (p >= (result.pagination?.totalPages ?? 1)) break; if (p >= 50) { complete = false; break; } p++; } while (p <= 50);
    return { transactions: all, complete };
  } });
  const headers = useMemo(() => csv ? statementCsvColumns(csv) : [], [csv]);
  const preview = useMemo(() => { try { return csv ? { ...previewMappedStatement(csv, mapping, existing.data?.transactions), mappingError: '' } : undefined; } catch (caught) { return { valid: [], errors: [], duplicates: [], mappingError: caught instanceof Error ? caught.message : 'Review the mapping.' }; } }, [csv, mapping, existing.data]);
  async function choose() {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/csv'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0]; if ((asset.size ?? 0) > 1_048_576) throw new Error('Choose a CSV smaller than 1 MiB. Split larger statements before importing.');
      const content = Platform.OS === 'web' ? await (await fetch(asset.uri)).text() : await new File(asset.uri).text();
      const columns = statementCsvColumns(content); if (columns.length < 2) throw new Error('Choose a comma-separated file with a header and transaction rows.');
      setCsv(content); setMapping(suggestedMapping(columns)); setFileName(asset.name); setPage(1); key.current = `mobile-import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'This statement could not be read.'); }
  }
  const apply = useMutation({ networkMode: 'always', mutationFn: () => {
    if (!preview?.valid.length || preview.errors.length || preview.mappingError) throw new Error('Resolve all row errors before importing.');
    return bankingApi.importTransactions({ bankAccountId, fileName: fileName!, fileType: 'csv', skipDuplicates: true, transactions: preview.valid }, key.current);
  }, onSuccess: async result => { await client.invalidateQueries({ queryKey: ['banking'] }); Alert.alert('Statement imported', `${result.importedCount} added; ${result.duplicatesSkipped} duplicates skipped.`, [{ text: 'Done', onPress: () => navigation.goBack() }]); } });
  const field = (label: string, name: keyof Omit<StatementMapping, 'dateFormat'>) => <View key={name} style={{ gap: space.sm }}><Text style={theme.type.callout}>{label}</Text><FilterPills options={['', ...headers]} value={mapping[name] ?? ''} labels={{ '': 'Not mapped' }} onChange={value => { setMapping(current => ({ ...current, [name]: value })); setPage(1); }} /></View>;
  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}>
    <Text style={theme.type.title}>Import a bank statement</Text><Text style={theme.type.subhead}>Choose a CSV, map its columns and review each error or duplicate before applying. Nothing posts until you confirm.</Text>
    <ModernButton fullWidth variant="secondary" icon={<Feather name="file-text" size={18} color={theme.colors.text} />} disabled={apply.isPending} onPress={() => void choose()}>{fileName ? 'Choose another CSV' : 'Choose CSV file'}</ModernButton>
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>}
    {fileName && preview ? <>
      <GroupedSection title="Statement"><ListRow label={fileName} subtitle={`Account ${bankAccountId}`} value={`${preview.valid.length} valid rows`} showChevron={false} /></GroupedSection>
      <Text style={theme.type.headline}>Column mapping</Text>
      {field('Map date', 'date')}{field('Map description', 'description')}{field('Map amount', 'amount')}{!mapping.amount && <>{field('Map debit', 'debit')}{field('Map credit', 'credit')}</>}{field('Map reference (optional)', 'reference')}
      <FilterPills options={['YYYY-MM-DD', 'DD/MM/YYYY']} value={mapping.dateFormat} onChange={v => setMapping(current => ({ ...current, dateFormat: v as StatementMapping['dateFormat'] }))} />
      {preview.mappingError && <Text accessibilityRole="alert" style={{ color: theme.colors.warning }}>{preview.mappingError}</Text>}
      {preview.errors.length > 0 && <GroupedSection title={`${preview.errors.length} row errors`}>{preview.errors.slice(0,20).map(e => <ListRow key={e.row} label={`Row ${e.row}`} subtitle={e.message} showChevron={false} />)}<Text style={theme.type.footnote}>Correct the source file or mapping. Import is blocked while any row is invalid.</Text></GroupedSection>}
      <Text style={theme.type.footnote}>{existing.isLoading ? 'Checking existing rows…' : `${preview.duplicates.length} duplicate rows detected. Exact duplicates are skipped by the server when applying.`}{existing.data?.complete === false ? ' Local preview is limited to 5,000 existing rows; the server still checks every imported row.' : ''}</Text>
      {existing.error && <><Text style={{ color: theme.colors.danger }}>Could not check existing rows: {existing.error.message}</Text><ModernButton variant="secondary" onPress={() => void existing.refetch()}>Retry duplicate check</ModernButton></>}
      <GroupedSection title={`Preview · page ${page}`}>{preview.valid.slice((page - 1) * 20, page * 20).map((t,i) => <ListRow key={i} label={t.description} subtitle={t.transactionDate} value={`${t.type === 'debit' ? '−' : '+'}${t.amount}`} showChevron={false} />)}</GroupedSection>
      {preview.valid.length > 20 && <View style={styles.pager}><ModernButton size="sm" variant="secondary" disabled={page === 1} onPress={() => setPage(p => p - 1)}>Previous</ModernButton><Text style={theme.type.footnote}>{page} / {Math.ceil(preview.valid.length / 20)}</Text><ModernButton size="sm" variant="secondary" disabled={page * 20 >= preview.valid.length} onPress={() => setPage(p => p + 1)}>Next</ModernButton></View>}
      {apply.error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{apply.error.message}</Text>}
      <ModernButton fullWidth loading={apply.isPending} disabled={!preview.valid.length || !!preview.mappingError || !!preview.errors.length || existing.isLoading || !!existing.error} onPress={() => apply.mutate()}>Import {preview.valid.length} transaction{preview.valid.length === 1 ? '' : 's'}</ModernButton>
    </> : <EmptyState title="No statement selected" description="Your CSV stays on this device until you confirm the import." />}
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: space.screen, paddingBottom: space.section, gap: space.lg, flexGrow: 1 }, pager: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, message: { borderRadius: radius.md, padding: space.md } });
