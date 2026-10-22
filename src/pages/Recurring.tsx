import React, { useEffect, useState } from 'react';
import type { RecurringKind, RecurringRunDto, RecurringTemplateDto } from '@ledgercraft/contracts';
import { CalendarClock, Pause, Play, Plus, Square } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { recurringApi } from '@/features/recurring/api';

export default function Recurring() {
  const [templates, setTemplates] = useState<RecurringTemplateDto[]>([]); const [runs, setRuns] = useState<RecurringRunDto[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: 'Monthly operating expense', kind: 'expense' as RecurringKind, frequency: 'monthly', interval: '1', startDate: new Date().toISOString().slice(0, 10), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', referenceId: '', description: 'Monthly subscription', amount: '99.00' });
  const load = async () => { const [templateData, runData] = await Promise.all([recurringApi.list(), recurringApi.runs()]); setTemplates(templateData.templates); setRuns(runData.runs); };
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : 'Unable to load schedules')); }, []);
  const create = async () => { setBusy(true); setError(''); try {
    const date = form.startDate; const base = { name: form.name, schedule: { frequency: form.frequency as any, interval: Number(form.interval), startDate: date, timezone: form.timezone, localTime: '09:00' } };
    const payload = form.kind === 'invoice' ? { kind: 'invoice' as const, input: { customerId: form.referenceId, date, dueDate: date, items: [{ description: form.description, quantity: '1', rate: form.amount }] } } : form.kind === 'bill' ? { kind: 'bill' as const, input: { vendorId: form.referenceId, billNumber: `REC-${date}`, issueDate: date, dueDate: date, lines: [{ description: form.description, quantity: '1', unitPrice: form.amount, taxRate: '0' }] } } : form.kind === 'income' ? { kind: 'income' as const, input: { bankAccountId: form.referenceId, transactionDate: date, description: form.description, amount: form.amount, type: 'credit' as const } } : { kind: 'expense' as const, input: { description: form.description, amount: form.amount, expenseDate: date } };
    await recurringApi.create({ ...base, payload } as any); await load();
  } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create schedule'); } finally { setBusy(false); } };
  const action = async (id: string, value: 'pause' | 'resume' | 'end') => { await recurringApi.action(id, value); await load(); };
  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <PageHeader title="Recurring schedules" description="Generate invoices, bills, income and expenses automatically with retry-safe occurrence history." />
    {error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />New schedule</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Input aria-label="Schedule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind: kind as RecurringKind })}><SelectTrigger aria-label="Document type"><SelectValue /></SelectTrigger><SelectContent>{['invoice','bill','income','expense'].map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}</SelectContent></Select>
      <Select value={form.frequency} onValueChange={(frequency) => setForm({ ...form, frequency })}><SelectTrigger aria-label="Frequency"><SelectValue /></SelectTrigger><SelectContent>{['daily','weekly','monthly','annual'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
      <Input aria-label="Start date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
      <Input aria-label="Customer vendor or bank account ID" placeholder={form.kind === 'expense' ? 'No linked record needed' : 'Customer, vendor or bank account ID'} value={form.referenceId} onChange={(e) => setForm({ ...form, referenceId: e.target.value })} disabled={form.kind === 'expense'} />
      <Input aria-label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <Input aria-label="Amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      <Button disabled={busy} onClick={() => void create()}>{busy ? 'Saving…' : 'Create schedule'}</Button>
    </CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2">{templates.length ? templates.map((template) => <Card key={template.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{template.name}</h2><p className="mt-1 text-sm text-muted-foreground capitalize">{template.kind} · {template.schedule.frequency} · {template.schedule.timezone}</p></div><Badge variant="outline" className="capitalize">{template.status}</Badge></div><p className="mt-4 text-sm">Next: {template.nextRunAt ? new Date(template.nextRunAt).toLocaleString() : 'No future runs'}</p><p className="text-sm text-muted-foreground">Created {template.occurrencesCreated} occurrence{template.occurrencesCreated === 1 ? '' : 's'}</p><div className="mt-4 flex flex-wrap gap-2">{template.status === 'active' ? <Button variant="outline" onClick={() => void action(template.id, 'pause')}><Pause className="mr-2 h-4 w-4" />Pause</Button> : template.status === 'paused' ? <Button variant="outline" onClick={() => void action(template.id, 'resume')}><Play className="mr-2 h-4 w-4" />Resume</Button> : null}<Button variant="ghost" disabled={template.status === 'ended'} onClick={() => void action(template.id, 'end')}><Square className="mr-2 h-4 w-4" />End</Button></div></CardContent></Card>) : <Card><CardContent className="flex min-h-48 flex-col items-center justify-center text-center"><CalendarClock className="h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No recurring schedules</h2><p className="mt-1 text-sm text-muted-foreground">Create one above to automate regular work.</p></CardContent></Card>}</div>
    <Card><CardHeader><CardTitle>Recent runs</CardTitle></CardHeader><CardContent>{runs.length ? <div className="divide-y divide-border">{runs.slice(0, 12).map((run) => <div key={run.id} className="flex flex-col justify-between gap-1 py-3 sm:flex-row sm:items-center"><div><span className="font-medium capitalize">{run.generatedType}</span><span className="ml-2 text-sm text-muted-foreground">{new Date(run.scheduledFor).toLocaleString()}</span></div><div className="text-sm"><Badge variant="outline" className="capitalize">{run.status}</Badge>{run.failureReason ? <span className="ml-2 text-destructive">{run.failureReason}</span> : run.generatedId ? <span className="ml-2 text-muted-foreground">Created successfully</span> : null}</div></div>)}</div> : <p className="text-sm text-muted-foreground">No scheduler runs yet.</p>}</CardContent></Card>
  </div>;
}
