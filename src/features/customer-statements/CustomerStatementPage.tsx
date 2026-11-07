import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { CustomerStatementQuery } from '@ledgercraft/contracts';
import { useAuth } from '@/context/StableAuthContext';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { customersApi } from '@/features/customers/api/customersApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { PageHeader } from '@/components/layout/PageHeader';
import { statementApi } from './statementApi';
import { statementPdf } from './statementPdf';
import { StatementDocument } from './StatementDocument';
export default function CustomerStatementPage() {
  const { me } = useAuth(); const canWrite = me?.permissions.includes('banking.write') === true;
  const [search] = useSearchParams(); const [customerId, setCustomerId] = useState(search.get('customerId') ?? '');
  const [query, setQuery] = useState<CustomerStatementQuery>({ type: 'open_items', from: `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric' }).format(new Date())}-01-01`, to: new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date()) });
  const [applied, setApplied] = useState<{ id: string; query: CustomerStatementQuery }>();
  const [selected, setSelected] = useState<string[]>([]); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [shareUrl, setShareUrl] = useState('');
  const capabilities = useQuery({ queryKey: ['server-capabilities'], queryFn: getServerCapabilities });
  const emailAvailable = capabilities.data?.email === 'available';
  const customers = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const statement = useQuery({ queryKey: ['customer-statement', applied], queryFn: () => statementApi.get(applied!.id, applied!.query), enabled: !!applied });
  const optOut = useQuery({ queryKey: ['reminder-opt-out', customerId], queryFn: () => statementApi.optOut('customers', customerId), enabled: !!customerId });
  async function deliver(kind: 'single' | 'bulk') {
    const payload = kind === 'single' ? { id: applied!.id, query: applied!.query } : { customerIds: selected, query };
    const scope = `statement-delivery:${me?.organisation.id}:${kind}:${JSON.stringify(payload)}`;
    let key = sessionStorage.getItem(scope);
    if (!key) { key = crypto.randomUUID(); sessionStorage.setItem(scope, key); }
    const result = kind === 'single' ? await statementApi.send(applied!.id, applied!.query, key) : await statementApi.bulk(selected, query, key);
    sessionStorage.removeItem(scope);
    return result;
  }
  async function action(fn: () => Promise<unknown>, text: string) { setBusy(true); setMessage(''); try { const result = await fn(); setMessage(`${text}${result && typeof result === 'object' && 'sent' in result ? `: ${JSON.stringify(result)}` : ''}`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Try again.'); } finally { setBusy(false); } }
  return <div className="space-y-6"><PageHeader title="Customer statements" description="Review open items or activity, share a retained statement and follow up outstanding balances" /><Link className="text-primary underline" to="/payment-reminders">Payment reminder settings</Link>
    <ContentPanel><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2">Customer<select aria-label="Statement customer" className="h-11 w-full rounded-xl border border-input bg-background px-3" value={customerId} onChange={event => { setCustomerId(event.target.value); setShareUrl(''); }}><option value="">Choose a customer</option>{customers.data?.map(customer => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label><label className="space-y-2">Statement type<select aria-label="Statement type" className="h-11 w-full rounded-xl border border-input bg-background px-3" value={query.type} onChange={event => setQuery({ ...query, type: event.target.value as CustomerStatementQuery['type'] })}><option value="open_items">Open items</option><option value="activity">Activity</option></select></label><label>From<Input type="date" aria-label="Statement from" value={query.from} onChange={event => setQuery({ ...query, from: event.target.value })} /></label><label>To<Input type="date" aria-label="Statement to" value={query.to} onChange={event => setQuery({ ...query, to: event.target.value })} /></label></div><Button className="mt-4" disabled={!customerId || query.from > query.to || statement.isFetching} onClick={() => { setApplied({ id: customerId, query }); setShareUrl(''); }}>Preview statement</Button>
    {customerId && optOut.data && <label className="mt-4 flex gap-3"><input type="checkbox" disabled={!me?.permissions.includes('banking.write') || busy} checked={optOut.data.optOut} onChange={event => void action(async () => { await statementApi.saveOptOut('customers', customerId, event.target.checked); await optOut.refetch(); }, 'Customer reminder preference saved')} />Exclude this customer from automatic reminders</label>}
    {customers.isError && <p role="alert">Customers could not load. <Button variant="outline" onClick={() => void customers.refetch()}>Retry customers</Button></p>}</ContentPanel>
    {statement.isFetching && <p role="status">Loading statement…</p>}{statement.error && <p role="alert">{statement.error.message}</p>}
    {statement.data && <ContentPanel><StatementDocument value={statement.data} /><div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => statementPdf(statement.data!)}>Download statement PDF</Button><Button variant="outline" disabled={!canWrite || busy} onClick={() => void action(async () => { const value = await statementApi.share(applied!.id, applied!.query); setShareUrl(value.url); }, 'Share link created')}>Create statement share link</Button>{emailAvailable && <Button variant="outline" disabled={!canWrite || busy} onClick={() => void action(() => deliver('single'), 'Statement email accepted')}>Email statement</Button>}</div>{!emailAvailable && <p className="mt-4 text-sm text-muted-foreground">Email is unavailable. Download the PDF or create a secure share link.</p>}{shareUrl && <a className="mt-4 block break-all text-primary underline" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>}</ContentPanel>}
    {canWrite && <ContentPanel><h2 className="text-lg font-semibold">Send statements in bulk</h2><p className="mt-2 text-sm text-muted-foreground">Select customers. Customers with no balance are skipped; unavailable email and delivery failures are reported.</p><div className="my-4 space-y-3">{customers.data?.map(customer => <label className="flex gap-3" key={customer.id}><input type="checkbox" checked={selected.includes(customer.id)} onChange={event => setSelected(event.target.checked ? [...selected, customer.id] : selected.filter(id => id !== customer.id))} />{customer.name}</label>)}</div><Button disabled={busy || !selected.length || !emailAvailable} onClick={() => void action(() => deliver('bulk'), 'Bulk statement results')}>Send selected statements</Button></ContentPanel>}
    {message && <p role="status" className="break-words">{message}</p>}
  </div>;
}
