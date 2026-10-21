import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import InvoiceForm from '@/components/invoice/InvoiceForm';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import CustomerFormDrawer, { type CustomerFormValues } from '@/components/customer/CustomerFormDrawer';
import { useCustomerDirectory } from '@/features/customers/hooks/useCustomerDirectory';
import { canEditQuote, canReviseQuote } from '@/features/quotes/actions';
import { quotesApi, quoteShareUrl, type QuoteFormInput } from '@/features/quotes/api/quotesApi';
import { quoteQueryKeys, useQuoteQuery, useRefreshQuotes } from '@/features/quotes/hooks/useQuotes';
import { quoteAsInvoicePreview } from '@/features/quotes/preview';
import type { QuoteKind } from '@/features/quotes/types';
import { useAppData } from '@/hooks/useAppData';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/invoiceUtils';
import type { AdditionalCharge, Customer, LineItem } from '@/types';

const EditQuote = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = useRefreshQuotes();
  const { toast } = useToast();
  const quoteQuery = useQuoteQuery(id);
  const { businessProfile, items, isLoadingItems } = useAppData();
  const { customers, isLoadingCustomers, createCustomer } = useCustomerDirectory();
  const [newlyAddedCustomer, setNewlyAddedCustomer] = useState<Customer | null>(null);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const quote = quoteQuery.data;

  const handleSubmit = async (
    values: {
      customerId: string;
      date: Date;
      dueDate: Date;
      kind?: QuoteKind;
      notes?: string;
      terms?: string;
      currency?: string;
      templateName?: string;
      taxRate?: number;
      taxInclusive?: boolean;
      discountType?: 'fixed' | 'percent';
      discountPercent?: number | null;
    },
    lineItems: LineItem[],
    _total: number,
    _subtotal: number,
    _taxAmount: number,
    additionalCharges: number,
    discount: number,
    additionalChargesList?: AdditionalCharge[],
    intent: 'draft' | 'send' = 'draft',
  ) => {
    const input: QuoteFormInput = {
      customerId: values.customerId,
      date: formatDate(values.date),
      expiryDate: formatDate(values.dueDate),
      kind: values.kind ?? quote?.kind ?? 'quote',
      notes: values.notes || null,
      terms: values.terms || null,
      currency: values.currency || 'NZD',
      templateName: values.templateName ?? null,
      taxRate: values.taxRate ?? quote?.taxRate ?? 0,
      taxInclusive: values.taxInclusive ?? quote?.taxInclusive ?? true,
      discountType: values.discountType,
      discountPercent: values.discountPercent,
      discount,
      additionalCharges,
      additionalChargesList,
      items: lineItems.filter((item) => item.description.trim() && item.quantity > 0),
    };
    const saved = await quotesApi.update(id, input);
    if (intent === 'send') {
      const share = await quotesApi.share(saved.id, { templateName: saved.templateName ?? undefined });
      const url = quoteShareUrl(share.shareToken);
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copied', description: url });
      } catch {
        toast({ title: 'Share link ready', description: url });
      }
    } else {
      toast({ title: 'Quote updated', description: saved.quoteNumber });
    }
    await queryClient.invalidateQueries({ queryKey: quoteQueryKeys.all });
    navigate(`/quotes/${saved.id}`);
  };

  if (quoteQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-muted" aria-label="Loading quote" />;
  }

  if (quoteQuery.isError || !quote) {
    return (
      <ContentPanel>
        <p className="font-medium">This quote could not be opened.</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link to="/quotes">Back to quotes</Link>
        </Button>
      </ContentPanel>
    );
  }

  if (!canEditQuote(quote.status)) {
    return (
      <ContentPanel className="space-y-3">
        <p className="font-medium">Only draft quotes can be edited.</p>
        <p className="text-sm text-muted-foreground">
          {canReviseQuote(quote.status)
            ? 'Revise it to make a new draft. Existing share links will stop working.'
            : 'This quote can no longer be changed.'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/quotes/${quote.id}`}>View quote</Link>
          </Button>
          {canReviseQuote(quote.status) ? (
            <Button onClick={async () => {
              try {
                await quotesApi.revise(quote.id);
                await refresh();
                toast({ title: 'Quote revised', description: 'It is a draft again. Share links from the previous version no longer work.' });
              } catch (error) {
                toast({
                  title: 'Could not revise the quote',
                  description: error instanceof Error ? error.message : 'Try again.',
                  variant: 'destructive',
                });
              }
            }}
            >
              Revise
            </Button>
          ) : null}
        </div>
      </ContentPanel>
    );
  }

  return (
    <>
      <InvoiceForm
        mode="edit"
        documentKind="quote"
        initialQuoteKind={quote.kind}
        initialTaxRate={quote.taxRate}
        initialTaxInclusive={quote.taxInclusive}
        initialValues={quoteAsInvoicePreview(quote)}
        customers={customers}
        businessProfile={businessProfile}
        isLoadingCustomers={isLoadingCustomers}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/quotes/${quote.id}`)}
        onAddCustomer={() => setIsCustomerDrawerOpen(true)}
        newlyAddedCustomer={newlyAddedCustomer}
        availableItems={items}
        isLoadingItems={isLoadingItems}
      />
      <CustomerFormDrawer
        open={isCustomerDrawerOpen}
        onOpenChange={setIsCustomerDrawerOpen}
        initialValues={null}
        onSubmit={async (values: CustomerFormValues) => {
          try {
            const customer = await createCustomer({
              name: values.name,
              email: values.email || null,
              phone: values.phone || null,
              address: values.address || null,
              city: values.city || null,
              state: values.state || null,
              zip: values.zip || null,
              country: values.country || 'New Zealand',
              isVip: values.is_vip,
            });
            setNewlyAddedCustomer(customer);
            setIsCustomerDrawerOpen(false);
          } catch (error) {
            toast({
              title: 'Could not add the customer',
              description: error instanceof Error ? error.message : 'Try again.',
              variant: 'destructive',
            });
          }
        }}
      />
    </>
  );
};

export default EditQuote;
