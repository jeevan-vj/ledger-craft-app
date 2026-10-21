import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';
import { quoteDocumentLabels } from '@/components/invoice/preview/documentLabels';
import type { InvoiceTemplateId } from '@/components/invoice/templates/InvoiceTemplates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  QuoteAlreadyRespondedError,
  quotesApi,
  QuotesApiError,
  type PublicQuoteView,
} from '@/features/quotes/api/quotesApi';
import { quoteAsInvoicePreview } from '@/features/quotes/preview';
import { quoteNoun } from '@/features/quotes/types';
import { createTemplateData, renderTemplateComponent } from '@/services/invoiceTemplateRenderer';
import { useToast } from '@/hooks/use-toast';
import { generateInvoicePdf } from '@/utils/pdfUtils';
import type { PublicQuoteResponse } from '@ledgercraft/contracts';
import { useParams } from 'react-router-dom';

type PageState =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'revoked' }
  | { kind: 'ready'; view: PublicQuoteView; response: PublicQuoteResponse | null };

const SharedQuote: React.FC = () => {
  const { shareToken = '' } = useParams<{ shareToken: string }>();
  const { toast } = useToast();
  const templateRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PageState>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [nameError, setNameError] = useState('');
  const [submitting, setSubmitting] = useState<'accept' | 'decline' | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!shareToken) {
        setPage({ kind: 'invalid', message: 'This link is missing a quote token.' });
        return;
      }
      try {
        const view = await quotesApi.getPublic(shareToken);
        if (cancelled) return;
        const response = view.respondedAt
          ? {
              action: view.status === 'declined' ? 'decline' as const : 'accept' as const,
              name: view.respondedByName,
              note: view.responseNote,
              respondedAt: view.respondedAt,
              acceptedRevision: view.quote.acceptedRevision,
            }
          : null;
        setPage({ kind: 'ready', view, response });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof QuotesApiError && (error.status === 410 || error.code === 'QUOTE_LINK_REVOKED')) {
          setPage({ kind: 'revoked' });
          return;
        }
        setPage({
          kind: 'invalid',
          message: error instanceof QuotesApiError ? error.message : 'This quote link could not be opened.',
        });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  const submit = async (action: 'accept' | 'decline') => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Enter your name');
      return;
    }
    if (trimmed.length > 120) {
      setNameError('Name must be 120 characters or fewer');
      return;
    }
    setNameError('');
    setSubmitting(action);
    try {
      const response = await quotesApi.respond(shareToken, {
        action,
        name: trimmed,
        note: note.trim() || undefined,
      });
      setPage((current) => current.kind === 'ready'
        ? {
            kind: 'ready',
            view: {
              ...current.view,
              status: action === 'accept' ? 'accepted' : 'declined',
              respondedByName: response.name,
              responseNote: response.note,
              respondedAt: response.respondedAt,
            },
            response,
          }
        : current);
    } catch (error) {
      if (error instanceof QuoteAlreadyRespondedError) {
        setPage((current) => current.kind === 'ready'
          ? { kind: 'ready', view: current.view, response: error.response }
          : current);
        return;
      }
      if (error instanceof QuotesApiError && (error.code === 'QUOTE_EXPIRED' || error.status === 410)) {
        if (error.status === 410 || error.code === 'QUOTE_LINK_REVOKED') {
          setPage({ kind: 'revoked' });
        } else if (page.kind === 'ready') {
          setPage({ kind: 'ready', view: { ...page.view, status: 'expired' }, response: null });
        }
        return;
      }
      toast({
        title: 'Could not save your response',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(null);
    }
  };

  const download = async () => {
    if (page.kind !== 'ready' || !templateRef.current || downloading) return;
    setDownloading(true);
    try {
      const preview = quoteAsInvoicePreview(page.view.quote);
      await generateInvoicePdf(
        preview,
        templateRef.current,
        (page.view.templateName.toLowerCase() as InvoiceTemplateId) || 'classic',
        page.view.businessProfile.logoUrl ?? undefined,
        { fileName: `Quote-${page.view.quote.quoteNumber}.pdf`, subject: quoteNoun(page.view.quote.kind).toUpperCase() },
      );
      toast({ title: 'PDF downloaded' });
    } catch (error) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  if (page.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading quote...</p>
        </div>
      </div>
    );
  }

  if (page.kind === 'revoked' || page.kind === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-fit rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>{page.kind === 'revoked' ? 'Link no longer valid' : 'Quote not found'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center text-sm text-muted-foreground">
            <p>
              {page.kind === 'revoked'
                ? 'This link was replaced when the quote was revised. Ask the sender for a new link.'
                : page.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { view, response } = page;
  const noun = quoteNoun(view.quote.kind);
  const labels = quoteDocumentLabels(view.quote.kind);
  const preview = quoteAsInvoicePreview(view.quote);
  const expired = view.status === 'expired';
  const closed = response !== null || view.status === 'accepted' || view.status === 'declined' || view.status === 'converted';
  const template = (view.templateName.toLowerCase() as InvoiceTemplateId) || 'classic';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-lg bg-accent p-2">
              <FileText className="h-5 w-5 text-accent-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{noun} {view.quote.quoteNumber}</h1>
              <p className="text-sm text-muted-foreground">From {view.businessProfile.name} · Valid until {view.expiryDate}</p>
            </div>
          </div>
          <Button variant="outline" className="min-h-11" onClick={download} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div ref={templateRef} className="p-2 sm:p-6">
            {renderTemplateComponent(template, createTemplateData(preview, view.businessProfile, labels))}
          </div>
        </div>

        {expired ? (
          <Card>
            <CardHeader>
              <CardTitle>This {noun.toLowerCase()} has expired</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              It was valid until {view.expiryDate}. Ask {view.businessProfile.name} for an updated link if you still want to proceed.
            </CardContent>
          </Card>
        ) : null}

        {closed && response ? (
          <Card>
            <CardHeader>
              <CardTitle>{response.action === 'decline' ? 'Declined' : 'Accepted'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{response.action === 'decline' ? 'Declined' : 'Accepted'} by {response.name || 'the client'}.</p>
              {response.note ? <p className="text-muted-foreground">{response.note}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        {view.status === 'converted' && !response ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              This {noun.toLowerCase()} has already been accepted and invoiced.
            </CardContent>
          </Card>
        ) : null}

        {!expired && !closed ? (
          <Card>
            <CardHeader>
              <CardTitle>Respond</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="quote-response-name" className="text-sm font-medium">Your name</label>
                <Input
                  id="quote-response-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  autoComplete="name"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'quote-response-name-error' : undefined}
                />
                {nameError ? <p id="quote-response-name-error" className="text-sm text-destructive">{nameError}</p> : null}
              </div>
              <div className="space-y-2">
                <label htmlFor="quote-response-note" className="text-sm font-medium">Note (optional)</label>
                <Textarea
                  id="quote-response-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="min-h-11" disabled={submitting !== null} onClick={() => submit('accept')}>
                  {submitting === 'accept' ? 'Saving...' : `Accept ${noun.toLowerCase()}`}
                </Button>
                <Button className="min-h-11" variant="outline" disabled={submitting !== null} onClick={() => submit('decline')}>
                  {submitting === 'decline' ? 'Saving...' : 'Decline'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
};

export default SharedQuote;
