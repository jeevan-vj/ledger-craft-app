import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatedSwitch, AppPressable, EmptyState, FilterPills, GroupedSection, ModernButton, ModernInput } from '@/components/ui';
import { bankingApi, type BankMatchingRuleDto, type BankMatchingRuleWriteRequest } from '@/features/banking/api/bankingApi';
import { useTheme } from '@/theme';
import { radius, space } from '@/theme/tokens';

const emptyRule = (): BankMatchingRuleWriteRequest => ({ descriptionContains: '', amountMin: null, amountMax: null, direction: 'any', targetAccountId: '', enabled: true });

export default function BankMatchingRulesScreen() {
  const theme = useTheme(); const queryClient = useQueryClient();
  const [draft, setDraft] = useState(emptyRule); const [editingId, setEditingId] = useState<string | null>(null);
  const rules = useQuery({ queryKey: ['banking', 'matching-rules'], queryFn: bankingApi.listMatchingRules });
  const accounts = useQuery({ queryKey: ['banking', 'ledger-accounts'], queryFn: bankingApi.listLedgerAccounts });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['banking', 'matching-rules'] });
  const save = useMutation({ mutationFn: () => editingId ? bankingApi.updateMatchingRule(editingId, draft) : bankingApi.createMatchingRule(draft), onSuccess: async () => { await refresh(); setEditingId(null); setDraft(emptyRule()); } });
  const toggle = useMutation({ mutationFn: ({ rule, enabled }: { rule: BankMatchingRuleDto; enabled: boolean }) => bankingApi.updateMatchingRule(rule.id, { enabled }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: bankingApi.removeMatchingRule, onSuccess: refresh });
  const edit = (rule: BankMatchingRuleDto) => { setEditingId(rule.id); setDraft({ descriptionContains: rule.descriptionContains, amountMin: rule.amountMin, amountMax: rule.amountMax, direction: rule.direction, targetAccountId: rule.targetAccountId, contactId: rule.contactId, enabled: rule.enabled }); };
  const error = save.error ?? toggle.error ?? remove.error;

  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={theme.type.subhead}>Rules rank server suggestions for recurring descriptions. They never post or reconcile a transaction automatically.</Text>
    <GroupedSection title={editingId ? 'Edit matching rule' : 'New matching rule'}>
      <View style={styles.form}>
        <ModernInput label="Description contains" placeholder="e.g. monthly software" value={draft.descriptionContains} onChangeText={(descriptionContains) => setDraft((value) => ({ ...value, descriptionContains }))} />
        <Text style={theme.type.caption}>DIRECTION</Text><FilterPills options={['any', 'credit', 'debit'] as const} value={draft.direction ?? 'any'} labels={{ any: 'In & out', credit: 'Money in', debit: 'Money out' }} onChange={(direction) => setDraft((value) => ({ ...value, direction }))} />
        <View style={styles.amounts}><View style={styles.grow}><ModernInput label="Minimum (optional)" value={draft.amountMin ?? ''} keyboardType="decimal-pad" onChangeText={(amountMin) => setDraft((value) => ({ ...value, amountMin: amountMin || null }))} /></View><View style={styles.grow}><ModernInput label="Maximum (optional)" value={draft.amountMax ?? ''} keyboardType="decimal-pad" onChangeText={(amountMax) => setDraft((value) => ({ ...value, amountMax: amountMax || null }))} /></View></View>
        <Text style={theme.type.caption}>SUGGEST ACCOUNT</Text><View style={styles.accountList}>{(accounts.data ?? []).map((account) => <AppPressable key={account.id} accessibilityRole="radio" accessibilityState={{ selected: draft.targetAccountId === account.id }} onPress={() => setDraft((value) => ({ ...value, targetAccountId: account.id }))} style={[styles.account, { backgroundColor: draft.targetAccountId === account.id ? theme.colors.accentFill : theme.colors.fillMuted }]}><Text style={theme.type.callout}>{account.name}</Text>{draft.targetAccountId === account.id ? <Feather name="check" size={18} color={theme.colors.accentText} /> : null}</AppPressable>)}</View>
        <View style={styles.enabled}><View style={styles.grow}><Text style={theme.type.callout}>Rule enabled</Text><Text style={theme.type.footnote}>Disabled rules stop creating suggestions.</Text></View><AnimatedSwitch value={draft.enabled ?? true} onValueChange={(enabled) => setDraft((value) => ({ ...value, enabled }))} activeColor={theme.colors.accent} inactiveColor={theme.colors.fill} accessibilityLabel="Rule enabled" /></View>
        {save.error ? <Text accessibilityLiveRegion="polite" style={[theme.type.footnote, { color: theme.colors.danger }]}>{save.error.message}</Text> : null}
        <View style={styles.buttons}><View style={styles.grow}><ModernButton fullWidth onPress={() => save.mutate()} loading={save.isPending} disabled={!draft.descriptionContains.trim() || !draft.targetAccountId}>{editingId ? 'Save changes' : 'Create rule'}</ModernButton></View>{editingId ? <ModernButton variant="outline" onPress={() => { setEditingId(null); setDraft(emptyRule()); }}>Cancel</ModernButton> : null}</View>
      </View>
    </GroupedSection>
    <GroupedSection title="Matching rules" footer={`${rules.data?.length ?? 0} ${rules.data?.length === 1 ? 'rule' : 'rules'} · suggestions only`}>
      {rules.isLoading ? <ActivityIndicator style={styles.loading} color={theme.colors.accentText} /> : rules.error ? <EmptyState icon="alert-circle" title="Could not load rules" description={rules.error.message} actionLabel="Try again" onAction={() => rules.refetch()} /> : rules.data?.length ? rules.data.map((rule) => <View key={rule.id} style={styles.rule}><AppPressable accessibilityRole="button" accessibilityHint="Loads this rule into the edit form" onPress={() => edit(rule)} style={styles.ruleCopy}><Text style={theme.type.callout}>Contains “{rule.descriptionContains}”</Text><Text style={theme.type.footnote}>{rule.direction === 'any' ? 'Money in or out' : rule.direction === 'credit' ? 'Money in' : 'Money out'} · {accounts.data?.find((account) => account.id === rule.targetAccountId)?.name ?? 'Ledger account'}{rule.amountMin || rule.amountMax ? ` · ${rule.amountMin ?? '0'} to ${rule.amountMax ?? 'any'}` : ''}</Text></AppPressable><AnimatedSwitch size="sm" value={rule.enabled} onValueChange={(enabled) => toggle.mutate({ rule, enabled })} activeColor={theme.colors.accent} inactiveColor={theme.colors.fill} accessibilityLabel={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.descriptionContains}`} /><AppPressable accessibilityRole="button" accessibilityLabel={`Delete ${rule.descriptionContains}`} onPress={() => Alert.alert('Delete matching rule?', `“${rule.descriptionContains}” will stop creating suggestions.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(rule.id) }])} style={styles.delete}><Feather name="trash-2" size={18} color={theme.colors.danger} /></AppPressable></View>) : <EmptyState icon="sliders" title="No matching rules yet" description="Create a rule for recurring descriptions such as fees or subscriptions." />}
    </GroupedSection>
    {error && error !== save.error ? <Text accessibilityLiveRegion="polite" style={[theme.type.footnote, { color: theme.colors.danger }]}>{error.message}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({ content: { padding: space.screen, paddingBottom: 64, gap: space.lg }, form: { padding: space.lg }, amounts: { flexDirection: 'row', gap: space.md }, grow: { flex: 1 }, accountList: { gap: space.sm, paddingVertical: space.md }, account: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, enabled: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md }, buttons: { flexDirection: 'row', alignItems: 'center', gap: space.sm }, loading: { padding: 48 }, rule: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: space.sm, gap: space.sm }, ruleCopy: { flex: 1, paddingVertical: space.md }, delete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
