import { useCallback, useEffect, useState } from 'react';
import type { BankTransactionDto, BankTransactionSuggestionResponse } from '@ledgercraft/contracts';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Filter, Loader2, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bankReconciliationApi } from '../api/bankReconciliationApi';
import { MatchPanel } from './MatchPanel';

interface TransactionFeedProps {
  bankAccounts: Array<{ id: string; accountName: string; isActive: boolean }>;
}

type Status = 'unreconciled' | 'suggested' | 'reconciled';
type Direction = 'any' | 'debit' | 'credit';

function formatMoney(value: string, type: 'debit' | 'credit') {
  const formatted = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(Number(value));
  return type === 'debit' ? `−${formatted}` : `+${formatted}`;
}

export function TransactionFeed({ bankAccounts }: TransactionFeedProps) {
  const [transactions, setTransactions] = useState<BankTransactionDto[]>([]);
  const [suggestions, setSuggestions] = useState<Map<string, BankTransactionSuggestionResponse>>(new Map());
  const [selected, setSelected] = useState<BankTransactionDto | null>(null);
  const [status, setStatus] = useState<Status>('unreconciled');
  const [accountId, setAccountId] = useState('all');
  const [direction, setDirection] = useState<Direction>('any');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bankReconciliationApi.listTransactions({
        status,
        bankAccountId: accountId === 'all' ? undefined : accountId,
        direction,
        from: from || undefined,
        to: to || undefined,
        search: appliedSearch || undefined,
        page,
        pageSize: 20,
      });
      setTransactions(result.transactions);
      setPagination({
        page: result.pagination?.page ?? 1,
        pageSize: result.pagination?.pageSize ?? 20,
        total: result.pagination?.total ?? result.transactions.length,
        totalPages: result.pagination?.totalPages ?? (result.transactions.length ? 1 : 0),
      });
      setSuggestions(await bankReconciliationApi.suggestionsBatch(result.transactions.filter((row) => !row.isReconciled).map((row) => row.id)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load bank transactions');
    } finally {
      setLoading(false);
    }
  }, [accountId, appliedSearch, direction, from, page, status, to]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [accountId, direction, from, status, to]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex items-center gap-2"><Filter className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">Transaction feed</h2><span className="text-sm text-muted-foreground">{pagination.total} {pagination.total === 1 ? 'line' : 'lines'}</span></div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[10rem_minmax(9rem,1fr)_9rem_9rem_9rem_minmax(14rem,1.5fr)]">
            <div className="space-y-1.5"><Label htmlFor="recon-status">Status</Label><Select value={status} onValueChange={(value: Status) => setStatus(value)}><SelectTrigger id="recon-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unreconciled">Unreconciled</SelectItem><SelectItem value="suggested">Suggested</SelectItem><SelectItem value="reconciled">Reconciled</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="recon-account">Account</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger id="recon-account"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All bank accounts</SelectItem>{bankAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.accountName}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="recon-direction">Money</Label><Select value={direction} onValueChange={(value: Direction) => setDirection(value)}><SelectTrigger id="recon-direction"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">In and out</SelectItem><SelectItem value="credit">Money in</SelectItem><SelectItem value="debit">Money out</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="recon-from">From</Label><Input id="recon-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="recon-to">To</Label><Input id="recon-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
            <form className="space-y-1.5" onSubmit={submitSearch}><Label htmlFor="recon-search">Search</Label><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="recon-search" className="pl-9" placeholder="Description or reference" value={search} onChange={(event) => setSearch(event.target.value)} /></div><Button type="submit" variant="outline">Apply</Button></div></form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading transactions…</div> : transactions.length === 0 ? <div className="px-6 py-16 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-success" /><h3 className="mt-4 font-semibold">No transactions in this view</h3><p className="mt-1 text-sm text-muted-foreground">Try another status, account, date range, or search.</p></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Bank account</TableHead><TableHead>Match status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-28"><span className="sr-only">Action</span></TableHead></TableRow></TableHeader>
              <TableBody>{transactions.map((transaction) => {
                const response = suggestions.get(transaction.id);
                const top = response?.suggestions[0];
                const account = bankAccounts.find((item) => item.id === transaction.bankAccountId);
                return <TableRow key={transaction.id} className="cursor-pointer" tabIndex={0} onClick={() => setSelected(transaction)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelected(transaction); }}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(`${transaction.transactionDate}T00:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</TableCell>
                  <TableCell><div className="flex items-start gap-3">{transaction.type === 'credit' ? <ArrowDownLeft className="mt-0.5 h-4 w-4 text-success" /> : <ArrowUpRight className="mt-0.5 h-4 w-4 text-muted-foreground" />}<div><p className="font-medium">{transaction.description}</p>{transaction.reference && <p className="text-xs text-muted-foreground">{transaction.reference}</p>}</div></div></TableCell>
                  <TableCell className="text-muted-foreground">{account?.accountName ?? 'Bank account'}</TableCell>
                  <TableCell>{transaction.isReconciled ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Reconciled</Badge> : top ? <Badge className="gap-1 bg-info/10 text-info hover:bg-info/15"><Sparkles className="h-3 w-3" />{top.score}% · {top.type === 'matching_rule' ? 'Rule' : 'Suggested'}</Badge> : <Badge variant="outline">Needs review</Badge>}</TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${transaction.type === 'credit' ? 'text-success' : ''}`}>{formatMoney(transaction.amount, transaction.type)}</TableCell>
                  <TableCell><Button size="sm" variant={top && !transaction.isReconciled ? 'default' : 'outline'} onClick={(event) => { event.stopPropagation(); setSelected(transaction); }}>{transaction.isReconciled ? 'Review' : top ? 'Accept' : 'Match'}</Button></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          )}
          {pagination.totalPages > 1 && <div className="flex items-center justify-between border-t border-border px-4 py-3"><p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>}
        </CardContent>
      </Card>

      <MatchPanel transaction={selected} bankAccounts={bankAccounts} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }} onChanged={load} />
    </div>
  );
}
