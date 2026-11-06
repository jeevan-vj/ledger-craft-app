import { useState } from 'react';
import type { LedgerAuditResponse } from '@ledgercraft/contracts';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { accountingCompletionApi } from '@/features/accounting-completion/api';
import type { RecoveryAccount } from './OpeningBalancesPanel';
import { PreparationCheck, PreparationField, today } from './PreparationFields';

export function LedgerAuditPanel({ accounts, onPosted }: { accounts: RecoveryAccount[]; onPosted?: () => void }) {
  const [audit, setAudit] = useState<LedgerAuditResponse>();
  const [selected, setSelected] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<string[]>([]);
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState<string[]>([]);
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const chosen = audit?.findings.filter((finding) => selected.includes(finding.key)) ?? [];
  const receiptsConfirmed = chosen.every((finding) => !finding.requiresReceiptConfirmation || receipts.includes(finding.key));
  async function load() {
    setBusy(true); setError(''); setAudit(undefined); setSelected([]); setReceipts([]); setPosted([]); setReviewed(false);
    try { setAudit(await accountingCompletionApi.audit()); } catch (caught) { setError(caught instanceof Error ? caught.message : 'The ledger audit could not be loaded.'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!reviewed || !receiptsConfirmed || chosen.length === 0 || !reason.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await accountingCompletionApi.applyAudit({ date, reason, reviewed: true, findings: chosen.map((finding) => ({ key: finding.key, fingerprint: finding.fingerprint, ...(finding.requiresReceiptConfirmation ? { receiptGstConfirmed: true as const } : {}) })) });
      setPosted(result.corrections.map((correction) => correction.journalEntryId)); onPosted?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Corrections could not be posted. Reload the audit before trying again.'); }
    finally { setBusy(false); }
  }
  return <ContentPanel><section aria-label="Historical ledger audit" className="space-y-5"><div><h2 className="text-xl font-semibold">Historical ledger audit</h2><p className="mt-1 max-w-prose text-sm text-muted-foreground">Preview known posting defects before choosing any correction. Original entries remain immutable; selected fixes create separate balanced journals with your reason and review record.</p></div>
    <Button disabled={busy} variant="outline" onClick={() => void load()}>{busy ? 'Working…' : 'Audit historical ledger'}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {audit?.warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
    {audit && audit.findings.length === 0 && <p role="status">No supported historical defects found</p>}
    {audit?.findings.map((finding) => <article key={finding.key} className="space-y-4 rounded-xl border border-border p-4"><h3 className="font-semibold">{finding.description}</h3><p className="break-words text-xs text-muted-foreground">Source journal {finding.sourceJournalId} · {finding.sourceDate}</p><div className="grid gap-4 sm:grid-cols-2"><div><h4 className="text-sm font-medium">Actual posting</h4>{Object.entries(finding.actual).map(([key, value]) => <p key={key} className="break-words text-sm tabular-nums">{key}: {value}</p>)}</div><div><h4 className="text-sm font-medium">Expected posting</h4>{Object.entries(finding.expected).map(([key, value]) => <p key={key} className="break-words text-sm tabular-nums">{key}: {value}</p>)}</div></div>
      <div className="space-y-2"><h4 className="text-sm font-medium">Proposed corrective journal</h4>{finding.correctionLines.map((line, index) => <p key={index} className="break-words text-sm tabular-nums">{names.get(line.accountId) ?? (line.accountId.startsWith('bank:') ? finding.expected.bankName ?? line.accountId : line.accountId)} · debit {line.debit} · credit {line.credit}</p>)}</div>
      <PreparationCheck checked={selected.includes(finding.key)} disabled={busy || posted.length > 0} onChange={(value) => { setSelected((keys) => value ? [...keys, finding.key] : keys.filter((key) => key !== finding.key)); setReviewed(false); }}>Select correction for {finding.description}</PreparationCheck>
      {finding.requiresReceiptConfirmation && selected.includes(finding.key) && <PreparationCheck checked={receipts.includes(finding.key)} disabled={busy || posted.length > 0} onChange={(value) => setReceipts((keys) => value ? [...keys, finding.key] : keys.filter((key) => key !== finding.key))}>I confirm the original receipt shows the stored raw GST for {finding.description}</PreparationCheck>}
    </article>)}
    {audit && audit.findings.length > 0 && <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><PreparationField label="Correction posting date" type="date" value={date} disabled={busy || posted.length > 0} onChange={(value) => { setDate(value); setReviewed(false); }} /><PreparationField label="Correction reason" value={reason} disabled={busy || posted.length > 0} onChange={(value) => { setReason(value); setReviewed(false); }} /></div><PreparationCheck checked={reviewed} disabled={busy || posted.length > 0} onChange={setReviewed}>I have reviewed the selected corrective journal lines</PreparationCheck><Button disabled={busy || posted.length > 0 || !reviewed || !receiptsConfirmed || chosen.length === 0 || !reason.trim()} onClick={() => void apply()}>Post selected corrections</Button></div>}
    {posted.length > 0 && <p role="status" className="break-words">Corrective journals posted: {posted.join(', ')}</p>}
    <p className="text-xs text-muted-foreground">This audit checks known posting patterns, not every accounting or tax error. Ambiguous records require accountant review. No production data is changed until a reviewed correction is posted.</p>
  </section></ContentPanel>;
}
