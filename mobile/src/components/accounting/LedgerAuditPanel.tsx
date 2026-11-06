import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { LedgerAuditResponse } from '@ledgercraft/contracts';
import { accountingApi } from '@/features/accounting/accountingApi';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { useTheme, space } from '@/theme';

export function LedgerAuditPanel() {
  const theme = useTheme();
  const [audit, setAudit] = useState<LedgerAuditResponse>();
  const [selected, setSelected] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  async function load() { setBusy(true); setError(''); setSuccess(''); setSelected([]); setReceipts([]); setReviewed(false); try { setAudit(await accountingApi.audit()); } catch (caught) { setAudit(undefined); setError(caught instanceof Error ? caught.message : 'Ledger audit unavailable.'); } finally { setBusy(false); } }
  async function apply() {
    if (!audit || !reviewed || !reason.trim() || !selected.length || audit.findings.some((finding) => selected.includes(finding.key) && finding.requiresReceiptConfirmation && !receipts.includes(finding.key))) return;
    setBusy(true); setError('');
    try {
      const result = await accountingApi.apply({ date, reason, reviewed: true, findings: audit.findings.filter((finding) => selected.includes(finding.key)).map((finding) => ({ key: finding.key, fingerprint: finding.fingerprint, ...(receipts.includes(finding.key) ? { receiptGstConfirmed: true } : {}) })) });
      setSuccess(`Ledger corrections recorded: ${result.corrections.length}`); setAudit(undefined); setSelected([]); setReviewed(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Ledger correction unavailable. Refresh the audit and review again.'); }
    finally { setBusy(false); }
  }
  const requiresReceipts = audit?.findings.some((finding) => selected.includes(finding.key) && finding.requiresReceiptConfirmation && !receipts.includes(finding.key));
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Historical ledger audit</Text>
    <Text style={theme.type.subhead}>Scan known legacy posting defects. Proposed corrections preserve original entries. This scan covers supported defects only, not a full audit of every transaction.</Text>
    <ModernButton variant="secondary" loading={busy} disabled={busy} onPress={() => void load()}>Scan ledger</ModernButton>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    {audit ? <>
      {!audit.findings.length ? <Text style={theme.type.body}>No supported ledger discrepancies found</Text> : null}
      {audit.warnings.map((warning) => <Text key={warning} style={theme.type.caption}>{warning}</Text>)}
      {audit.findings.map((finding) => <View key={finding.key} style={{ gap: space.sm }}>
        <Text style={theme.type.body}>{finding.description}</Text>
        <Text style={theme.type.caption}>Actual: {Object.entries(finding.actual).map(([key, value]) => `${key} ${value}`).join(' · ')}</Text>
        <Text style={theme.type.caption}>Expected: {Object.entries(finding.expected).map(([key, value]) => `${key} ${value}`).join(' · ')}</Text>
        <Switch accessibilityLabel={`Select correction ${finding.key}`} value={selected.includes(finding.key)} onValueChange={(value) => { setSelected(value ? [...selected, finding.key] : selected.filter((key) => key !== finding.key)); setReviewed(false); }} />
        {finding.requiresReceiptConfirmation ? <><Text style={theme.type.subhead}>Confirm stored GST is the raw GST on the original receipt before applying this proposal.</Text><Switch accessibilityLabel={`Confirm original receipt GST ${finding.key}`} value={receipts.includes(finding.key)} onValueChange={(value) => setReceipts(value ? [...receipts, finding.key] : receipts.filter((key) => key !== finding.key))} /></> : null}
      </View>)}
      {audit.findings.length ? <>
        <ModernInput label="Correction posting date" value={date} onChangeText={setDate} editable={!busy} />
        <ModernInput label="Ledger correction reason" value={reason} onChangeText={setReason} editable={!busy} />
        <Text style={theme.type.body}>I have reviewed selected corrections against source records</Text>
        <Switch accessibilityLabel="Confirm ledger corrections reviewed" value={reviewed} onValueChange={setReviewed} disabled={busy} />
        <ModernButton disabled={busy || !reviewed || !selected.length || !reason.trim() || requiresReceipts} onPress={() => void apply()}>Apply selected ledger corrections</ModernButton>
      </> : null}
    </> : null}
    {success ? <Text style={theme.type.body}>{success}</Text> : null}
  </View>;
}
