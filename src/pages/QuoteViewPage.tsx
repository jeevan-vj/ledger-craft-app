import React, { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { quoteDocumentLabels } from '@/components/invoice/preview/documentLabels';
import InvoicePreview from '@/components/invoice/preview/InvoicePreview';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  canConvertQuote,
  canDeleteQuote,
  canEditQuote,
  canMarkQuoteSent,
  canRespondToQuote,
  canReviseQuote,
  canShareQuote,
} from '@/features/quotes/actions';
import { quotesApi, quoteShareUrl } from '@/features/quotes/api/quotesApi';
import { QuoteStatusBadge } from '@/features/quotes/components/QuoteStatusBadge';
import { QuoteTimeline } from '@/features/quotes/components/QuoteTimeline';
import { useQuoteQuery, useRefreshQuotes } from '@/features/quotes/hooks/useQuotes';
import { quoteAsInvoicePreview } from '@/features/quotes/preview';
import { quoteNoun } from '@/features/quotes/types';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/utils/invoiceUtils';

const REVISE_WARNING = 'Existing share links will stop working. The client will need a new link after you save the revision.';

const QuoteViewPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const refresh = useRefreshQuotes();
  const quoteQuery = useQuoteQuery(id);
  const quote = quoteQuery.data;
  const [pending, setPending] = useState<string | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [responseOpen, setResponseOpen] = useState<'accepted' | 'declined' | 'convert' | null>(null);
  const [responseName, setResponseName] = useState('');
  const [responseNote, setResponseNote] = useState('');
  const convertKey = useRef<string | null>(null);

  const run = async (action: string, task: () => Promise<void>) => {
    if (pending) return;
    setPending(action);
    try {
      await task();
      await refresh();
    } catch (error) {
      toast({
        title: 'Could not update the quote',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setPending(null);
    }
  };

  if (quoteQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-muted" aria-label="Loading quote" />;
  }

  if (quoteQuery.isError || !quote) {
    return (
      <ContentPanel>
        <p className="font-medium">This quote could not be opened.</p>
        <Button className="mt-4" variant="outline" onClick={() => quoteQuery.refetch()}>Try again</Button>
      </ContentPanel>
    );
  }

  const noun = quoteNoun(quote.kind);
  const preview = quoteAsInvoicePreview(quote);

  const share = () => run('share', async () => {
    const result = await quotesApi.share(quote.id, { templateName: quote.templateName ?? undefined });
    const url = quoteShareUrl(result.shareToken);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: url });
    } catch {
      toast({ title: 'Share link ready', description: url });
    }
  });

  const convert = () => run('convert', async () => {
    convertKey.current ??= crypto.randomUUID();
    const result = await quotesApi.convert(quote.id, convertKey.current);
    navigate(`/invoices/${result.invoice.id}`);
  });

  const submitResponse = () => {
    const mode = responseOpen;
    setResponseOpen(null);
    if (!mode) return;
    const name = responseName.trim();
    const note = responseNote.trim();
    void run(mode, async () => {
      if (mode === 'convert') {
        if (quote.status !== 'accepted') {
          await quotesApi.setStatus(quote.id, {
            status: 'accepted',
            name: name || undefined,
            note: note || undefined,
          });
        }
        convertKey.current ??= crypto.randomUUID();
        const result = await quotesApi.convert(quote.id, convertKey.current);
        navigate(`/invoices/${result.invoice.id}`);
        return;
      }
      await quotesApi.setStatus(quote.id, {
        status: mode,
        name: name || undefined,
        note: note || undefined,
      });
      toast({ title: mode === 'accepted' ? 'Marked accepted' : 'Marked declined' });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" className="mb-2 px-0" asChild>
            <Link to="/quotes">Back to quotes</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{quote.quoteNumber}</h1>
            <QuoteStatusBadge status={quote.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {noun} · Revision {quote.revision} · {quote.customerName || 'Customer'} · Valid until {quote.expiryDate}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{formatCurrency(quote.total, quote.currency)}</p>
        </div>
      </div>

      <ContentPanel>
        <div className="flex flex-wrap gap-2">
          {canEditQuote(quote.status) ? (
            <Button variant="outline" asChild><Link to={`/quotes/${quote.id}/edit`}>Edit</Link></Button>
          ) : null}
          <Button variant="outline" disabled={pending !== null} onClick={() => run('duplicate', async () => {
            const copy = await quotesApi.duplicate(quote.id);
            navigate(`/quotes/${copy.id}`);
          })}
          >
            Duplicate
          </Button>
          {canShareQuote(quote.status) ? (
            <Button variant="outline" disabled={pending !== null} onClick={share}>Copy share link</Button>
          ) : null}
          {canMarkQuoteSent(quote.status) ? (
            <Button variant="outline" disabled={pending !== null} onClick={() => run('sent', async () => {
              await quotesApi.markSent(quote.id);
              toast({ title: 'Marked sent' });
            })}
            >
              Mark sent
            </Button>
          ) : null}
          {canRespondToQuote(quote.status) ? (
            <>
              <Button variant="outline" disabled={pending !== null} onClick={() => setResponseOpen('accepted')}>Mark accepted</Button>
              <Button variant="outline" disabled={pending !== null} onClick={() => setResponseOpen('declined')}>Mark declined</Button>
              <Button disabled={pending !== null} onClick={() => setResponseOpen('convert')}>Mark accepted and convert</Button>
            </>
          ) : null}
          <Button
            disabled={!canConvertQuote(quote.status) || pending !== null}
            title={canConvertQuote(quote.status) ? 'Create a draft invoice from this quote' : 'Accept the quote before converting'}
            onClick={convert}
          >
            Convert to invoice
          </Button>
          {canReviseQuote(quote.status) ? (
            <Button variant="outline" disabled={pending !== null} onClick={() => setReviseOpen(true)}>Revise</Button>
          ) : null}
          {canDeleteQuote(quote.status) ? (
            <Button variant="ghost" disabled={pending !== null} onClick={() => setDeleteOpen(true)}>Delete draft</Button>
          ) : null}
          <Button variant="outline" disabled title="Email delivery is not available yet. Share a link instead.">
            Send email
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Email delivery is not available yet. Share a link so the client can view, accept, or decline this {noun.toLowerCase()}.
        </p>
        {quote.convertedInvoiceId ? (
          <p className="mt-3 text-sm">
            Converted to invoice{' '}
            <Link className="font-medium text-primary underline" to={`/invoices/${quote.convertedInvoiceId}`}>
              {quote.convertedInvoiceNumber || 'View invoice'}
            </Link>
          </p>
        ) : null}
      </ContentPanel>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <ContentPanel>
          <h2 className="mb-4 font-semibold">Activity</h2>
          <QuoteTimeline quote={quote} />
        </ContentPanel>
        <InvoicePreview
          invoice={preview}
          selectedTemplate={(quote.templateName as 'classic') || 'classic'}
          documentLabels={quoteDocumentLabels(quote.kind)}
        />
      </div>

      <AlertDialog open={reviseOpen} onOpenChange={setReviseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revise this {noun.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>{REVISE_WARNING}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setReviseOpen(false);
              void run('revise', async () => {
                await quotesApi.revise(quote.id);
                toast({ title: 'Revised', description: 'Old share links no longer work.' });
              });
            }}
            >
              Revise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>This draft {noun.toLowerCase()} will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setDeleteOpen(false);
              void run('delete', async () => {
                await quotesApi.remove(quote.id);
                navigate('/quotes');
              });
            }}
            >
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={responseOpen !== null} onOpenChange={(open) => { if (!open) setResponseOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {responseOpen === 'declined' ? 'Mark declined' : responseOpen === 'convert' ? 'Mark accepted and convert' : 'Mark accepted'}
            </DialogTitle>
            <DialogDescription>
              Record a verbal or emailed response. A name is optional for a response you enter yourself.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={responseName}
              onChange={(event) => setResponseName(event.target.value)}
              placeholder="Name"
              aria-label="Response name"
              maxLength={120}
            />
            <Textarea
              value={responseNote}
              onChange={(event) => setResponseNote(event.target.value)}
              placeholder="Note (optional)"
              aria-label="Response note"
              maxLength={1000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponseOpen(null)}>Cancel</Button>
            <Button onClick={submitResponse}>
              {responseOpen === 'declined' ? 'Mark declined' : responseOpen === 'convert' ? 'Accept and convert' : 'Mark accepted'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuoteViewPage;
