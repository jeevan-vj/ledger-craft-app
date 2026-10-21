import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCustomerDirectory } from '@/features/customers/hooks/useCustomerDirectory';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/utils/invoiceUtils';
import {
  canConvertQuote,
  canDeleteQuote,
  canEditQuote,
  canMarkQuoteSent,
  canRespondToQuote,
  canReviseQuote,
  canShareQuote,
} from '@/features/quotes/actions';
import { quotesApi, quoteShareUrl, QuotesApiError } from '@/features/quotes/api/quotesApi';
import { QuoteStatusBadge } from '@/features/quotes/components/QuoteStatusBadge';
import { applyQuoteListFilters } from '@/features/quotes/filters';
import { useQuotesQuery, useRefreshQuotes } from '@/features/quotes/hooks/useQuotes';
import { QUOTE_STATUSES, quoteNoun, type Quote, type QuoteStatus } from '@/features/quotes/types';

const REVISE_WARNING = 'Existing share links will stop working. The client will need a new link after you save the revision.';

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

const Quotes = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const refresh = useRefreshQuotes();
  const [params] = useSearchParams();
  const quotesQuery = useQuotesQuery();
  const { customers } = useCustomerDirectory();
  const [status, setStatus] = useState<QuoteStatus | 'all'>('all');
  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'revise' | 'delete'; quote: Quote } | null>(null);

  const filtered = useMemo(
    () => applyQuoteListFilters(quotesQuery.data?.quotes ?? [], {
      status,
      customerId: customerId || undefined,
      q: search,
      from: from || undefined,
      to: to || undefined,
    }),
    [quotesQuery.data?.quotes, status, customerId, search, from, to],
  );

  const fail = (error: unknown, fallback: string) => {
    toast({
      title: 'Could not update the quote',
      description: error instanceof Error ? error.message : fallback,
      variant: 'destructive',
    });
  };

  const run = async (quote: Quote, action: string, task: () => Promise<void>) => {
    setPending(`${quote.id}:${action}`);
    try {
      await task();
      await refresh();
    } catch (error) {
      fail(error, 'Try again.');
    } finally {
      setPending(null);
    }
  };

  const share = (quote: Quote) => run(quote, 'share', async () => {
    const result = await quotesApi.share(quote.id, { templateName: quote.templateName ?? undefined });
    const url = quoteShareUrl(result.shareToken);
    const copied = await copyText(url);
    toast({
      title: copied ? 'Link copied' : 'Share link ready',
      description: copied ? url : `Copy this link: ${url}`,
    });
  });

  const quotes = quotesQuery.data?.quotes ?? [];
  const visibleCount = QUOTE_STATUSES.reduce((sum, value) => sum + filtered.counts[value], 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        description="Send a quote or estimate, then turn an accepted one into a draft invoice."
        actions={(
          <Button asChild>
            <Link to="/quotes/new">
              <Plus className="mr-2 h-4 w-4" />
              New quote
            </Link>
          </Button>
        )}
      />

      {quotesQuery.isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-muted" aria-label="Loading quotes" />
      ) : null}

      {quotesQuery.isError ? (
        <ContentPanel>
          <p className="font-medium">Quotes could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {quotesQuery.error instanceof QuotesApiError ? quotesQuery.error.message : 'Check your connection and try again.'}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => quotesQuery.refetch()}>Try again</Button>
        </ContentPanel>
      ) : null}

      {!quotesQuery.isLoading && !quotesQuery.isError && quotes.length === 0 ? (
        <EmptyState
          title="No quotes yet"
          description="Create a quote or estimate, share a link, and convert it to an invoice once the client accepts."
          ctaLabel="New quote"
          ctaTo="/quotes/new"
        />
      ) : null}

      {!quotesQuery.isLoading && !quotesQuery.isError && quotes.length > 0 ? (
        <>
          <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Filter by status">
            <StatusTab label="All" count={visibleCount} selected={status === 'all'} onClick={() => setStatus('all')} />
            {QUOTE_STATUSES.map((value) => (
              <StatusTab
                key={value}
                label={value[0].toUpperCase() + value.slice(1)}
                count={filtered.counts[value]}
                selected={status === value}
                onClick={() => setStatus(value)}
              />
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search number or customer"
              aria-label="Search quotes"
            />
            <Select value={customerId || 'all'} onValueChange={(value) => setCustomerId(value === 'all' ? '' : value)}>
              <SelectTrigger aria-label="Filter by customer">
                <SelectValue placeholder="All customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To date" />
          </div>

          {filtered.quotes.length === 0 ? (
            <EmptyState
              title="No quotes match"
              description="Try another status, customer, or search."
            />
          ) : (
            <div className="space-y-3">
              {filtered.quotes.map((quote) => (
                <ContentPanel key={quote.id} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/quotes/${quote.id}`} className="text-lg font-semibold hover:underline">
                          {quote.quoteNumber}
                        </Link>
                        <QuoteStatusBadge status={quote.status} />
                        <span className="text-sm text-muted-foreground">{quoteNoun(quote.kind)}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {quote.customerName || 'Customer'} · Valid until {quote.expiryDate}
                      </p>
                    </div>
                    <p className="text-xl font-bold tabular-nums">{formatCurrency(quote.total, quote.currency)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/quotes/${quote.id}`}>View</Link>
                    </Button>
                    {canEditQuote(quote.status) ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/quotes/${quote.id}/edit`}>Edit</Link>
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending !== null}
                      onClick={() => run(quote, 'duplicate', async () => {
                        const copy = await quotesApi.duplicate(quote.id);
                        navigate(`/quotes/${copy.id}`);
                      })}
                    >
                      Duplicate
                    </Button>
                    {canShareQuote(quote.status) ? (
                      <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => share(quote)}>
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        Share link
                      </Button>
                    ) : null}
                    {canMarkQuoteSent(quote.status) ? (
                      <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => run(quote, 'sent', async () => {
                        await quotesApi.markSent(quote.id);
                      })}
                      >
                        Mark sent
                      </Button>
                    ) : null}
                    {canRespondToQuote(quote.status) ? (
                      <>
                        <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => run(quote, 'accept', async () => {
                          await quotesApi.setStatus(quote.id, { status: 'accepted' });
                        })}
                        >
                          Mark accepted
                        </Button>
                        <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => run(quote, 'decline', async () => {
                          await quotesApi.setStatus(quote.id, { status: 'declined' });
                        })}
                        >
                          Mark declined
                        </Button>
                      </>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canConvertQuote(quote.status) || pending !== null}
                      title={canConvertQuote(quote.status) ? undefined : 'Accept the quote before converting'}
                      onClick={() => run(quote, 'convert', async () => {
                        const result = await quotesApi.convert(quote.id);
                        navigate(`/invoices/${result.invoice.id}`);
                      })}
                    >
                      Convert
                    </Button>
                    {canReviseQuote(quote.status) ? (
                      <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => setConfirm({ kind: 'revise', quote })}>
                        Revise
                      </Button>
                    ) : null}
                    {canDeleteQuote(quote.status) ? (
                      <Button variant="ghost" size="sm" disabled={pending !== null} onClick={() => setConfirm({ kind: 'delete', quote })}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </ContentPanel>
              ))}
            </div>
          )}
        </>
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'delete' ? 'Delete this draft?' : 'Revise this quote?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'delete'
                ? 'This draft will be removed. Sent quotes stay in the list so you can revise them instead.'
                : REVISE_WARNING}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const current = confirm;
              setConfirm(null);
              if (!current) return;
              if (current.kind === 'delete') {
                void run(current.quote, 'delete', () => quotesApi.remove(current.quote.id));
              } else {
                void run(current.quote, 'revise', () => quotesApi.revise(current.quote.id).then(() => undefined));
              }
            }}
            >
              {confirm?.kind === 'delete' ? 'Delete draft' : 'Revise quote'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function StatusTab({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
    >
      {label}
      <span className="ml-1 tabular-nums">{count}</span>
    </button>
  );
}

export default Quotes;
