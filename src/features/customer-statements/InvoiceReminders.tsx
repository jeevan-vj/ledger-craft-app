import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/StableAuthContext';
import { Button } from '@/components/ui/button';
import { statementApi } from './statementApi';
export function InvoiceReminders({ invoiceId }: { invoiceId: string }) {
  const { me } = useAuth(); const canWrite = me?.permissions.includes('banking.write') === true;
  const preference = useQuery({ queryKey: ['invoice-reminder-opt-out', invoiceId], queryFn: () => statementApi.optOut('invoices', invoiceId) });
  const logs = useQuery({ queryKey: ['invoice-reminder-log', invoiceId], queryFn: () => statementApi.logs(invoiceId) });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function change(optOut: boolean) { setBusy(true); setError(''); try { await statementApi.saveOptOut('invoices', invoiceId, optOut); await preference.refetch(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Preference could not be saved.'); } finally { setBusy(false); } }
  return <section aria-label="Invoice reminders" className="mb-6 space-y-4 rounded-2xl bg-card p-5 shadow-surface"><h2 className="font-semibold">Automatic reminders</h2>{preference.data && <label className="flex gap-3"><input type="checkbox" disabled={!canWrite || busy} checked={preference.data.optOut} onChange={event => void change(event.target.checked)} />Exclude this invoice from automatic reminders</label>}{(preference.isError || logs.isError || error) && <p role="alert">{error || 'Reminder details could not load.'}<Button variant="outline" onClick={() => { void preference.refetch(); void logs.refetch(); }}>Retry reminders</Button></p>}{logs.isPending && <p role="status">Loading reminder history…</p>}{logs.data?.logs.length === 0 && <p className="text-sm text-muted-foreground">No automatic reminders have been processed.</p>}<ul className="space-y-2 text-sm">{logs.data?.logs.map(log => <li className="break-words" key={log.id}>{log.stepId} · {log.scheduledDate} · {log.status}{log.sentAt && ` · ${log.sentAt}`}{log.reason && ` · ${log.reason}`}</li>)}</ul></section>;
}
