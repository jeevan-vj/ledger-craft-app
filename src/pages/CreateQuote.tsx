import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import InvoiceForm from '@/components/invoice/InvoiceForm';
import CustomerFormDrawer, { type CustomerFormValues } from '@/components/customer/CustomerFormDrawer';
import { useCustomerDirectory } from '@/features/customers/hooks/useCustomerDirectory';
import { quoteQueryKeys } from '@/features/quotes/hooks/useQuotes';
import { quotesApi, quoteShareUrl, type QuoteFormInput } from '@/features/quotes/api/quotesApi';
import type { QuoteKind } from '@/features/quotes/types';
import { useAppData } from '@/hooks/useAppData';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/invoiceUtils';
import type { AdditionalCharge, Customer, LineItem } from '@/types';

const CreateQuote = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { businessProfile, items, isLoadingItems, refreshBusinessProfile } = useAppData();
  const { customers, isLoadingCustomers, createCustomer } = useCustomerDirectory();
  const [newlyAddedCustomer, setNewlyAddedCustomer] = useState<Customer | null>(null);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [quoteNumber, setQuoteNumber] = useState<string | undefined>();
  const [isLoadingNumber, setIsLoadingNumber] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingNumber(true);
      try {
        await refreshBusinessProfile();
        const next = await quotesApi.nextNumber();
        if (!cancelled) setQuoteNumber(next);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: 'Could not prepare a quote number',
            description: error instanceof Error ? error.message : 'Try again.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setIsLoadingNumber(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // refreshBusinessProfile is not stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      kind: values.kind ?? businessProfile?.defaultQuoteKind ?? 'quote',
      notes: values.notes || null,
      terms: values.terms || null,
      currency: values.currency || 'NZD',
      templateName: values.templateName ?? null,
      taxRate: values.taxRate ?? 0,
      taxInclusive: false,
      discountType: values.discountType,
      discountPercent: values.discountPercent,
      discount,
      additionalCharges,
      additionalChargesList,
      items: lineItems.filter((item) => item.description.trim() && item.quantity > 0),
    };
    const created = await quotesApi.create(input);
    if (intent === 'send') {
      try {
        const share = await quotesApi.share(created.id, { templateName: created.templateName ?? undefined });
        const url = quoteShareUrl(share.shareToken);
        let copied = false;
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch {
          copied = false;
        }
        toast({
          title: copied ? 'Quote saved and link copied' : 'Quote saved',
          description: copied ? url : `Share this link: ${url}`,
        });
      } catch (error) {
        toast({
          title: 'Quote saved',
          description: error instanceof Error ? error.message : 'The share link could not be created. Open the quote and try again.',
          variant: 'destructive',
        });
      }
    } else {
      toast({ title: 'Draft saved', description: `${created.quoteNumber} is saved as a draft.` });
    }
    await queryClient.invalidateQueries({ queryKey: quoteQueryKeys.all });
    navigate(`/quotes/${created.id}`);
  };

  const handleAddCustomer = async (values: CustomerFormValues) => {
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
      toast({ title: 'Customer added', description: `${customer.name} is ready to use on this quote.` });
    } catch (error) {
      toast({
        title: 'Could not add the customer',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <InvoiceForm
        mode="create"
        documentKind="quote"
        initialQuoteKind={businessProfile?.defaultQuoteKind ?? 'quote'}
        customers={customers}
        businessProfile={businessProfile}
        isLoadingCustomers={isLoadingCustomers}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/quotes')}
        onAddCustomer={() => setIsCustomerDrawerOpen(true)}
        newlyAddedCustomer={newlyAddedCustomer}
        availableItems={items}
        isLoadingItems={isLoadingItems}
        generatedInvoiceNumber={quoteNumber}
        isLoadingInvoiceNumber={isLoadingNumber}
      />
      <CustomerFormDrawer
        open={isCustomerDrawerOpen}
        onOpenChange={setIsCustomerDrawerOpen}
        initialValues={null}
        onSubmit={handleAddCustomer}
      />
    </>
  );
};

export default CreateQuote;
