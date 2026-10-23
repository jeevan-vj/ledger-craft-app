import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import type { FinancialReportQuery, FinancialReportResponse } from '@ledgercraft/contracts';
import { reportsApi } from '@/features/reports/api/reportsApi';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const today = new Date();
const initialFrom = `${today.getFullYear()}-01-01`;
const initialTo = today.toISOString().slice(0, 10);
const formatMoney = (value: string) => new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(Number(value));

function Metric({ label, value, quiet }: { label: string; value: string; quiet?: string }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{formatMoney(value)}</p>{quiet && <p className="mt-1 text-xs text-muted-foreground">{quiet}</p>}</CardContent></Card>;
}

type AccountRows = FinancialReportResponse['profitLoss']['rows'];
function AccountTable({ rows, empty = 'No posted movements in this period.' }: { rows: AccountRows; empty?: string }) {
  if (!rows.length) return <div className="rounded-2xl bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">{empty}</div>;
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Class</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.accountId}><TableCell className="font-medium">{row.accountNumber ? `${row.accountNumber} · ` : ''}{row.accountName}</TableCell><TableCell className="capitalize text-muted-foreground">{row.accountClass}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(row.debit)}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(row.credit)}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatMoney(row.balance)}</TableCell></TableRow>)}</TableBody></Table></div>;
}

function AgingTable({ report, noun }: { report: FinancialReportResponse['receivablesAging']; noun: string }) {
  if (!report.items.length) return <div className="rounded-2xl bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">No outstanding {noun} at the report date.</div>;
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Party</TableHead><TableHead>Due</TableHead><TableHead>Age</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader><TableBody>{report.items.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.number}</TableCell><TableCell>{item.partyName}</TableCell><TableCell>{item.dueDate}</TableCell><TableCell>{item.bucket}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(item.balanceDue)}</TableCell></TableRow>)}</TableBody></Table></div>;
}

function downloadCsv(report: FinancialReportResponse) {
  const rows = [['Account', 'Class', 'Debit', 'Credit', 'Balance'], ...report.trialBalance.rows.map((row) => [row.accountName, row.accountClass, row.debit, row.credit, row.balance])];
  const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `LedgerCraft-report-${report.meta.from}-${report.meta.to}.csv`; link.click(); URL.revokeObjectURL(url);
}

export default function FinancialReportsPage() {
  const [draft, setDraft] = useState({ from: initialFrom, to: initialTo, basis: 'accrual' as 'accrual' | 'cash' });
  const [query, setQuery] = useState<FinancialReportQuery>({ ...draft, baseCurrency: 'NZD' });
  const report = useQuery({ queryKey: ['reports', 'financial', query], queryFn: () => reportsApi.financial(query) });
  const ledger = useQuery({ queryKey: ['reports', 'general-ledger', query], queryFn: () => reportsApi.generalLedger(query) });
  const data = report.data;
  const summary = useMemo(() => data ? [
    { label: 'Revenue', value: data.profitLoss.revenue }, { label: 'Expenses', value: data.profitLoss.expenses },
    { label: 'Net income', value: data.profitLoss.netIncome }, { label: 'Closing cash', value: data.cashFlow.closingCash },
  ] : [], [data]);

  return <div className="space-y-6">
    <PageHeader title="Financial reports" description="Auditable statements calculated by the server from posted journal entries." actions={<div className="flex gap-2"><Button variant="outline" onClick={() => report.refetch()} disabled={report.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} />Refresh</Button><Button onClick={() => data && downloadCsv(data)} disabled={!data}><Download className="mr-2 h-4 w-4" />Export CSV</Button></div>} />
    <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_auto]">
      <label className="space-y-2 text-sm font-medium">From<Input type="date" value={draft.from} onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))} /></label>
      <label className="space-y-2 text-sm font-medium">To<Input type="date" value={draft.to} onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))} /></label>
      <label className="space-y-2 text-sm font-medium">Basis<Select value={draft.basis} onValueChange={(basis: 'accrual' | 'cash') => setDraft((value) => ({ ...value, basis }))}><SelectTrigger aria-label="Accounting basis"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accrual">Accrual</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent></Select></label>
      <Button className="self-end" onClick={() => setQuery({ ...draft, baseCurrency: 'NZD' })} disabled={!draft.from || !draft.to || draft.from > draft.to}>Run report</Button>
    </CardContent></Card>
    {report.isLoading && <Card><CardContent className="p-12 text-center text-muted-foreground" role="status">Calculating reports from the ledger…</CardContent></Card>}
    {report.isError && <Card><CardContent className="space-y-3 p-8 text-center"><p className="font-semibold text-destructive">Reports could not be loaded.</p><p className="text-sm text-muted-foreground">{report.error instanceof Error ? report.error.message : 'Try again.'}</p><Button variant="outline" onClick={() => report.refetch()}>Try again</Button></CardContent></Card>}
    {data && <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{summary.map((item) => <Metric key={item.label} {...item} />)}</div>
      <Tabs defaultValue="profit-loss" className="space-y-4"><TabsList className="h-auto w-full justify-start overflow-x-auto"><TabsTrigger value="profit-loss">Profit & loss</TabsTrigger><TabsTrigger value="balance-sheet">Balance sheet</TabsTrigger><TabsTrigger value="trial-balance">Trial balance</TabsTrigger><TabsTrigger value="general-ledger">General ledger</TabsTrigger><TabsTrigger value="cash-flow">Cash flow</TabsTrigger><TabsTrigger value="receivables">Receivables</TabsTrigger><TabsTrigger value="payables">Payables</TabsTrigger><TabsTrigger value="tax">Tax</TabsTrigger></TabsList>
        <TabsContent value="profit-loss"><Card><CardHeader><CardTitle>Profit & loss</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Revenue" value={data.profitLoss.revenue} /><Metric label="Expenses" value={data.profitLoss.expenses} /><Metric label="Net income" value={data.profitLoss.netIncome} /></div><AccountTable rows={data.profitLoss.rows} /></CardContent></Card></TabsContent>
        <TabsContent value="balance-sheet"><Card><CardHeader><CardTitle>Balance sheet</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Assets" value={data.balanceSheet.assets} /><Metric label="Liabilities" value={data.balanceSheet.liabilities} /><Metric label="Equity" value={data.balanceSheet.equity} quiet={data.balanceSheet.balanced ? 'Accounting equation balances' : 'Review unbalanced postings'} /></div><AccountTable rows={data.balanceSheet.rows} /></CardContent></Card></TabsContent>
        <TabsContent value="trial-balance"><Card><CardHeader><CardTitle>Trial balance</CardTitle></CardHeader><CardContent className="space-y-4"><p className={`text-sm font-medium ${data.trialBalance.balanced ? 'text-success' : 'text-destructive'}`}>{data.trialBalance.balanced ? 'Debits equal credits.' : 'Debits and credits do not balance.'}</p><AccountTable rows={data.trialBalance.rows} /></CardContent></Card></TabsContent>
        <TabsContent value="general-ledger"><Card><CardHeader><CardTitle>General ledger</CardTitle></CardHeader><CardContent>{ledger.isLoading ? <p className="py-12 text-center text-sm text-muted-foreground" role="status">Loading posted journal lines…</p> : ledger.isError ? <div className="space-y-3 py-10 text-center"><p className="text-sm text-destructive">The general ledger could not be loaded.</p><Button variant="outline" onClick={() => ledger.refetch()}>Try again</Button></div> : !ledger.data?.lines.length ? <div className="rounded-2xl bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">No posted ledger lines in this period.</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Entry</TableHead><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Running balance</TableHead></TableRow></TableHeader><TableBody>{ledger.data.lines.map((line, index) => <TableRow key={`${line.journalEntryId}-${line.accountId}-${index}`}><TableCell>{line.date}</TableCell><TableCell className="font-medium">{line.entryNumber}</TableCell><TableCell>{line.accountName}</TableCell><TableCell className="min-w-56">{line.description}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(line.debit)}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(line.credit)}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatMoney(line.runningBalance)}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card></TabsContent>
        <TabsContent value="cash-flow"><Card><CardHeader><CardTitle>Cash flow</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Opening cash" value={data.cashFlow.openingCash} /><Metric label="Inflows" value={data.cashFlow.inflows} /><Metric label="Outflows" value={data.cashFlow.outflows} /><Metric label="Closing cash" value={data.cashFlow.closingCash} /></div><AccountTable rows={data.cashFlow.rows} /></CardContent></Card></TabsContent>
        <TabsContent value="receivables"><Card><CardHeader><CardTitle>Accounts receivable aging · {formatMoney(data.receivablesAging.total)}</CardTitle></CardHeader><CardContent><AgingTable report={data.receivablesAging} noun="receivables" /></CardContent></Card></TabsContent>
        <TabsContent value="payables"><Card><CardHeader><CardTitle>Accounts payable aging · {formatMoney(data.payablesAging.total)}</CardTitle></CardHeader><CardContent><AgingTable report={data.payablesAging} noun="payables" /></CardContent></Card></TabsContent>
        <TabsContent value="tax"><Card><CardHeader><CardTitle>Tax summary</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><Metric label="GST collected" value={data.taxSummary.collected} /><Metric label="GST paid" value={data.taxSummary.paid} /><Metric label="Net payable" value={data.taxSummary.netPayable} /></CardContent></Card></TabsContent>
      </Tabs><p className="text-xs text-muted-foreground">Generated {new Date(data.meta.generatedAt).toLocaleString()} · {data.meta.basis} basis · {data.meta.baseCurrency}. Draft documents are excluded.</p></>}
  </div>;
}
