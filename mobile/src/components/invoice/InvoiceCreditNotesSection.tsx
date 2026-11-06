import React, { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { createCreditNoteRequestSchema, refundCreditNoteRequestSchema, reverseCreditNoteRequestSchema, type CreditNoteDto } from '@ledgercraft/contracts';
import type { BankAccountDto } from '@/features/purchases/api/purchasesApi';
import { creditNotesApi } from '@/features/invoices/api/creditNotesApi';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { SettlementRatePicker } from '@/components/currency/SettlementRatePicker';
import { AuthApiError } from '@/features/auth/api/http';
import { pendingCreditOperation, type CreditOperation } from '@/features/invoices/pendingCreditOperation';
import type { PendingMutation } from '@/features/accounting/pendingMutation';
import { formatMoney } from '@/utils/money';
import type { Invoice } from '@/types/invoice';
import { useTheme, space } from '@/theme';

export function InvoiceCreditNotesSection({ invoice, ownerId, canWrite, onChanged }: { invoice: Invoice; ownerId: string; canWrite: boolean; onChanged: () => void }) {
  const canIssue = canWrite && ['sent', 'paid', 'overdue'].includes(invoice.status);
  const theme = useTheme(); const actionInFlight = useRef(false);
  const [pendingOperation, setPendingOperation] = useState<PendingMutation<CreditOperation> | null>(null);
  const [open, setOpen] = useState(false); const [credits, setCredits] = useState<CreditNoteDto[]>([]); const [banks, setBanks] = useState<BankAccountDto[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [reason, setReason] = useState(''); const [description, setDescription] = useState(''); const [amount, setAmount] = useState('0.00'); const [taxRate, setTaxRate] = useState('15');
  const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [refundId, setRefundId] = useState<string>(); const [refundAmount, setRefundAmount] = useState('0.00'); const [bankId, setBankId] = useState(''); const [exchangeRateId, setExchangeRateId] = useState<string>();
  const activeInvoice = useRef(`${ownerId}:${invoice.id}`); activeInvoice.current = `${ownerId}:${invoice.id}`;
  useEffect(() => { setOpen(false); setCredits([]); setLoaded(false); setConfirmed(false); setReason(''); setDescription(''); setAmount('0.00'); setRefundId(undefined); setError(''); setSuccess(''); setPendingOperation(null); setBankId(''); setRefundAmount('0.00'); setExchangeRateId(undefined); }, [ownerId, invoice.id]);
  async function load() { const invoiceId = `${ownerId}:${invoice.id}`; setOpen(true); setBusy(true); setError(''); try { const [rows, accounts, pending] = await Promise.all([creditNotesApi.list(invoice.id), canWrite ? creditNotesApi.banks() : Promise.resolve([]), ownerId ? pendingCreditOperation.load(ownerId, invoice.id) : Promise.resolve(null)]); if (activeInvoice.current !== invoiceId) return; if (pending) await pendingCreditOperation.fail(ownerId, invoice.id, 0); setPendingOperation(pending ? { ...pending, uncertain: true } : null); setCredits(rows); setBanks(accounts.filter((account) => account.isActive)); setLoaded(true); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Credit notes unavailable.'); } finally { setBusy(false); } }
  async function run(action: () => Promise<CreditNoteDto>, message: (result: CreditNoteDto) => string) {
    if (!canIssue || !confirmed || busy || actionInFlight.current || pendingOperation) return;
    actionInFlight.current = true;
    setBusy(true); setError(''); setSuccess('');
    try { const result = await action(); setSuccess(message(result)); setCredits((rows) => [...rows.filter((row) => row.id !== result.id), result]); setConfirmed(false); setRefundId(undefined); onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Credit note action unavailable.'); }
    finally { actionInFlight.current = false; setBusy(false); }
  }
  async function durable(operation: CreditOperation): Promise<CreditNoteDto> {
    const pending = await pendingCreditOperation.claim(ownerId, invoice.id, operation); setPendingOperation(pending);
    try { const result = pending.input.kind === 'issue' ? await creditNotesApi.create(pending.input.payload, pending.key) : await creditNotesApi.refund(pending.input.creditNoteId, pending.input.payload, pending.key); await pendingCreditOperation.clear(ownerId, invoice.id); setPendingOperation(null); return result; }
    catch (caught) { if (caught instanceof AuthApiError && caught.code === 'IDEMPOTENCY_CONFLICT') await pendingCreditOperation.fail(ownerId, invoice.id, 0); await pendingCreditOperation.fail(ownerId, invoice.id, caught instanceof AuthApiError ? caught.status : 0); setPendingOperation(await pendingCreditOperation.load(ownerId, invoice.id)); throw caught; }
  }
  async function resume() {
    if (!pendingOperation || busy || actionInFlight.current || !canIssue) return; actionInFlight.current = true; setBusy(true); setError('');
    try { const result = await durable(pendingOperation.input); setCredits((rows) => [...rows.filter((row) => row.id !== result.id), result]); setSuccess(`Saved credit operation confirmed: ${result.creditNoteNumber}`); setConfirmed(false); onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Saved credit operation unavailable. Retry the same operation after checking the source record.'); }
    finally { actionInFlight.current = false; setBusy(false); }
  }
  const issue = () => {
    const parsed = createCreditNoteRequestSchema.safeParse({ invoiceId: invoice.id, issueDate: date, reason, taxInclusive: false, taxRate, items: [{ description, quantity: '1', rate: amount }] });
    if (!parsed.success) { setError('Enter the credit date, description, positive net amount, GST rate and reason of at least eight characters.'); return; }
    void run(() => durable({ kind: 'issue', payload: parsed.data }), (result) => `Credit note recorded: ${result.creditNoteNumber}`);
  };
  const reverse = (credit: CreditNoteDto) => {
    const parsed = reverseCreditNoteRequestSchema.safeParse({ date, reason }); if (!parsed.success) { setError('Enter a valid reversal date and reason of at least eight characters.'); return; }
    void run(() => creditNotesApi.reverse(credit.id, parsed.data), (result) => `Credit note reversed: ${result.creditNoteNumber}`);
  };
  const refund = (credit: CreditNoteDto) => {
    const parsed = refundCreditNoteRequestSchema.safeParse({ amount: refundAmount, refundDate: date, bankAccountId: bankId, ...(exchangeRateId ? { exchangeRateId } : {}) });
    if (!parsed.success || (invoice.currency !== 'NZD' && !exchangeRateId)) { setError('Choose the refund bank, positive amount, date and a reviewed exchange rate for foreign currency.'); return; }
    void run(() => durable({ kind: 'refund', creditNoteId: credit.id, payload: parsed.data }), (result) => `Credit note refund recorded: ${result.creditNoteNumber}`);
  };
  const reverseRefund = (credit: CreditNoteDto, id: string) => {
    const parsed = reverseCreditNoteRequestSchema.safeParse({ date, reason }); if (!parsed.success) { setError('Enter a valid reversal date and reason of at least eight characters.'); return; }
    void run(() => creditNotesApi.reverseRefund(credit.id, id, parsed.data), (result) => `Refund reversed: ${result.creditNoteNumber}`);
  };
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Credit notes and refunds</Text>
    <ModernButton variant="secondary" disabled={busy} loading={busy} onPress={() => { if (open) setOpen(false); else void load(); }}>{open ? 'Hide credit notes' : 'Show credit notes'}</ModernButton>
    {open ? <>
      <Text style={theme.type.subhead}>Credit notes reverse the source invoice revenue and GST. Cash receipts remain receipts; credit on a paid invoice becomes a customer liability until refunded. Do not repeat a posted credit as a manual GST adjustment.</Text>
      {loaded && !credits.length ? <Text style={theme.type.body}>No credit notes for this invoice</Text> : null}
      {error && !loaded ? <ModernButton variant="secondary" disabled={busy} onPress={() => void load()}>Retry credit notes</ModernButton> : null}
      {canWrite && !canIssue ? <Text style={theme.type.subhead}>Issue the invoice before creating a credit note. Draft and cancelled invoices cannot be credited.</Text> : null}
      {pendingOperation ? <>
        <Text style={theme.type.body}>A saved {pendingOperation.input.kind === 'issue' ? 'credit issue' : 'customer refund'} is awaiting confirmation. Resume its original details before starting another operation.</Text>
        <Text style={theme.type.caption}>{pendingOperation.input.kind === 'issue' ? `${pendingOperation.input.payload.issueDate} · ${pendingOperation.input.payload.items.map((item) => item.description).join(', ')}` : `${pendingOperation.input.payload.refundDate} · refund ${pendingOperation.input.payload.amount} ${invoice.currency}`}</Text>
        <ModernButton disabled={busy} onPress={() => void resume()}>Resume saved credit operation</ModernButton>
      </> : null}
      {canIssue && !pendingOperation ? <>
        <ModernInput label="Credit note date" value={date} editable={!busy} onChangeText={(value) => { setDate(value); setConfirmed(false); setExchangeRateId(undefined); }} />
        <ModernInput label="Credit note description" value={description} editable={!busy} onChangeText={(value) => { setDescription(value); setConfirmed(false); }} />
        <ModernInput label="Credit note net amount" value={amount} editable={!busy} keyboardType="decimal-pad" onChangeText={(value) => { setAmount(value); setConfirmed(false); }} />
        <ModernInput label="Credit note GST rate" value={taxRate} editable={!busy} keyboardType="decimal-pad" onChangeText={(value) => { setTaxRate(value); setConfirmed(false); }} />
        <ModernInput label="Credit note reason" value={reason} editable={!busy} onChangeText={(value) => { setReason(value); setConfirmed(false); }} />
        <Text style={theme.type.body}>I have reviewed the source invoice and this credit/refund or reversal</Text>
        <Switch accessibilityLabel="Confirm credit note review" value={confirmed} disabled={busy} onValueChange={setConfirmed} />
        <ModernButton disabled={busy || !confirmed} onPress={issue}>Issue credit note</ModernButton>
      </> : null}
      {credits.map((credit) => <View key={credit.id} style={{ gap: space.sm }}>
        <Text style={theme.type.headline}>{credit.creditNoteNumber} · {credit.status}</Text>
        <Text style={theme.type.body}>Credit total: {formatMoney(credit.total, credit.currency)} · GST: {formatMoney(credit.taxAmount, credit.currency)}</Text>
        <Text style={theme.type.body}>Receivable reduced: {formatMoney(credit.receivableAmount, credit.currency)} · Customer credit: {formatMoney(credit.customerCreditAmount, credit.currency)}</Text>
        <Text style={theme.type.body}>Available to refund: {formatMoney(credit.refundAvailable, credit.currency)}</Text>
        {canIssue && !pendingOperation && credit.status === 'issued' ? <>
          <ModernButton variant="secondary" disabled={busy || !confirmed} onPress={() => reverse(credit)}>Reverse {credit.creditNoteNumber}</ModernButton>
          {/[1-9]/.test(credit.refundAvailable) ? <ModernButton variant="secondary" disabled={busy} onPress={() => { setRefundId(credit.id); setRefundAmount(credit.refundAvailable); setConfirmed(false); }}>Refund {credit.creditNoteNumber}</ModernButton> : null}
        </> : null}
        {refundId === credit.id && !pendingOperation ? <>
          <ModernInput label="Credit refund amount" value={refundAmount} editable={!busy} onChangeText={(value) => { setRefundAmount(value); setConfirmed(false); }} keyboardType="decimal-pad" />
          {banks.filter((bank) => invoice.currency === 'NZD' || bank.currency === 'NZD').map((bank) => <ModernButton key={bank.id} variant={bankId === bank.id ? 'primary' : 'secondary'} disabled={busy} onPress={() => { setBankId(bank.id); setConfirmed(false); }}>{bank.accountName}</ModernButton>)}
          <SettlementRatePicker currency={invoice.currency} paymentDate={date} value={exchangeRateId} onChange={setExchangeRateId} disabled={busy} />
          <ModernButton disabled={busy || !confirmed} onPress={() => refund(credit)}>Record credit refund</ModernButton>
        </> : null}
        {credit.refunds.map((row, index) => <View key={row.id}><Text style={theme.type.body}>Refund {formatMoney(row.amount, credit.currency)} · {row.status}</Text>{canIssue && !pendingOperation && row.status === 'completed' ? <ModernButton variant="secondary" disabled={busy || !confirmed} onPress={() => reverseRefund(credit, row.id)}>Reverse refund {index + 1}</ModernButton> : null}</View>)}
      </View>)}
    </> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    {success ? <Text style={theme.type.body}>{success}</Text> : null}
  </View>;
}
