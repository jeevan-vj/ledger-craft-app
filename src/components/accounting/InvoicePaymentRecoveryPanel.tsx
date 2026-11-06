import { useCallback, useEffect, useRef, useState } from 'react';
import { readPendingInvoicePayment, resumePendingInvoicePayment, discardPendingInvoicePayment } from '@/features/accounting-completion/invoicePaymentRecovery';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { paymentsApi, paymentsApiEnabled } from '@/features/payments/api/paymentsApi';
import { Button } from '@/components/ui/button';
import { PreparationCheck } from './PreparationFields';

type Pending = NonNullable<Awaited<ReturnType<typeof readPendingInvoicePayment>>>;
export interface InvoiceRecoveryState { pending?: Pending; loading: boolean; blocked: boolean }
export function InvoicePaymentRecoveryPanel({ invoiceId, onResolved, onStateChange, refreshVersion = 0, recoveryOnly = false }: { invoiceId: string; onResolved?: () => void | Promise<void>; onStateChange?: (state: InvoiceRecoveryState) => void; refreshVersion?: number; recoveryOnly?: boolean }) {
  const [pending, setPending] = useState<Pending>();
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<{ balance: string; payments: Array<{ id: string; date: string; amount: string; status: string }> }>();
  const [reviewed, setReviewed] = useState(false);
  const notify = useRef(onStateChange); notify.current = onStateChange;
  const load = useCallback(async () => {
    setLoading(true); setError(''); setBlocked(false);
    try { setPending(paymentsApiEnabled() ? await readPendingInvoicePayment(invoiceId) : undefined); }
    catch (caught) { setBlocked(true); setError(caught instanceof Error ? caught.message : 'Pending payment could not be verified.'); }
    finally { setLoading(false); }
  }, [invoiceId]);
  useEffect(() => { void load(); }, [load, refreshVersion]);
  useEffect(() => { notify.current?.({ pending, loading, blocked }); }, [pending, loading, blocked]);
  async function resume() {
    setBusy(true); setError('');
    try { await resumePendingInvoicePayment(invoiceId); setPending(undefined); setMessage('Original payment recovered'); await onResolved?.(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The original payment could not be recovered. Retry after checking your connection.'); }
    finally { setBusy(false); }
  }
  async function checkHistory() {
    setBusy(true); setError(''); setReviewed(false);
    try {
      const [invoice, payments] = await Promise.all([invoicesApi.get(invoiceId), paymentsApi.list(invoiceId)]);
      if (!invoice) throw new Error('Current invoice history is unavailable.');
      setHistory({ balance: invoice.balanceDue === undefined ? 'Unavailable' : invoice.balanceDue.toFixed(2), payments: payments.map((payment) => ({ id: payment.id, date: payment.paymentDate, amount: payment.amount.toFixed(2), status: payment.status })) });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Current payment history could not be loaded.'); }
    finally { setBusy(false); }
  }
  async function discard() {
    if (!history || !reviewed) return;
    setBusy(true); setError('');
    try { await discardPendingInvoicePayment(invoiceId, { reviewed: true }); setPending(undefined); setMessage('Pending request discarded after review'); await onResolved?.(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The pending request could not be discarded.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Invoice payment recovery" className="space-y-3">
    {loading && <p role="status" className="text-sm text-muted-foreground">Checking pending invoice payments…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {blocked && <Button type="button" variant="outline" onClick={() => void load()}>Retry payment recovery check</Button>}
    {pending && <div className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">Recover the original invoice payment</h3><p className="text-sm tabular-nums">Original amount: {pending.body.amount} · Date {pending.body.paymentDate} · Method {pending.body.paymentMethod}</p><p className="text-sm text-muted-foreground">The original request is saved for this company and user. Retrying preserves its amount, exchange rate and receipt choice, even if the invoice is now fully paid. Changing the intent requires checking the current records first.</p>{pending.acceptedPayment && <p className="text-sm">The payment was accepted; receipt recovery is still pending.</p>}<div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void resume()}>Resume original invoice payment</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void checkHistory()}>Check current invoice and payment history</Button></div>{history && <div className="space-y-3"><p className="text-sm tabular-nums">Current invoice balance: {history.balance}</p>{history.payments.map((payment) => <p key={payment.id} className="text-sm tabular-nums">Payment {payment.date}: {payment.amount} · {payment.status}</p>)}<PreparationCheck checked={reviewed} disabled={busy} onChange={setReviewed}>I checked the invoice, receipts and bank history and confirmed this pending payment was not recorded</PreparationCheck><Button type="button" variant="outline" disabled={busy || !reviewed} onClick={() => void discard()}>Discard pending invoice payment after review</Button></div>}</div>}
    {recoveryOnly && !loading && !blocked && !pending && !message && <p role="status" className="text-sm text-muted-foreground">No unresolved payment request is saved for this invoice and user.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
