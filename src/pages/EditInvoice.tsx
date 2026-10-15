
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppData } from "@/hooks/useAppData";
import InvoiceForm from "@/components/invoice/InvoiceForm";
import { Invoice, Item, Customer } from "@/types";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/utils/invoiceUtils";
import CustomerFormDrawer, { CustomerFormValues } from '@/components/customer/CustomerFormDrawer';
import { useToast } from '@/hooks/use-toast';
import { useCustomerDirectory } from '@/features/customers/hooks/useCustomerDirectory';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';

const EditInvoicePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getInvoice, updateInvoice, businessProfile, items, isLoadingItems, refreshInvoices } = useAppData();
  const { customers, isLoadingCustomers, createCustomer } = useCustomerDirectory();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newlyAddedCustomer, setNewlyAddedCustomer] = useState<Customer | null>(null);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    
    const loadInvoice = async () => {
      try {
        const invoiceFound = await getInvoice(id);
        if (!invoiceFound) {
          setError("Invoice not found");
        } else {
          setInvoice(invoiceFound);
          // Set title for print support - will appear in the print dialog/print output
          document.title = `Invoice ${invoiceFound.invoiceNumber}`;
        }
      } catch (error) {
        console.error('Error loading invoice:', error);
        setError("Error loading invoice");
      } finally {
        setLoading(false);
      }
    };

    loadInvoice();
      
    // Cleanup on unmount
    return () => {
      document.title = "Invoice App"; // Reset title
    };
  }, [id]); // Removed getInvoice from dependencies to prevent infinite loop

  useEffect(() => {
    if (newlyAddedCustomer && invoice) {
      // For edit mode, we need a way to update the customer selection
      // This will be handled by the InvoiceForm component when newlyAddedCustomer changes
    }
  }, [newlyAddedCustomer, invoice]);

  const handleSave = async (
    values: any,
    items: any,
    total: number,
    subtotal: number,
    taxAmount: number,
    additionalCharges: number,
    discount: number,
    additionalChargesList?: any[],
    intent: 'draft' | 'send' = 'draft',
  ) => {
    if (!invoice) return;
    try {
      const saved = await updateInvoice({
        ...invoice,
        ...values,
        date: formatDate(values.date),
        dueDate: formatDate(values.dueDate),
        paymentTermDays: values.paymentTermDays,
        items,
        subtotal,
        taxAmount,
        total,
        additionalCharges,
        discountType: values.discountType,
        discountPercent: values.discountPercent,
        discount,
        additionalChargesList,
        templateName: values.templateName,
      });
      if (intent === 'send') {
        await invoicesApi.send(saved.id);
        await refreshInvoices();
        toast({
          title: 'Invoice sent',
          description: `Invoice ${saved.invoiceNumber} was sent.`,
        });
      }
      navigate("/invoices");
    } catch (e: any) {
      setError(e?.message || "Error updating invoice");
    }
  };

  const handleAddCustomer = async (values: CustomerFormValues) => {
    try {
      const newCustomerData = {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
        address: values.address || null,
        city: values.city || null,
        state: values.state || null,
        zip: values.zip || null,
        country: values.country || 'New Zealand',
        isVip: values.is_vip
      };

      const newCustomer = await createCustomer(newCustomerData);

      toast({
        title: 'Customer added successfully',
        description: `${newCustomer.name} has been added to your customers.`
      });

      setNewlyAddedCustomer(newCustomer);
      setIsCustomerDrawerOpen(false);

    } catch (error) {
      console.error('Error creating customer:', error);
      toast({
        title: 'Error',
        description: 'Failed to add customer. Please try again.',
        variant: 'destructive'
      });
    }
  };

  if (loading || isLoadingItems) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading invoice...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-destructive font-semibold">{error}</div>
        <Button variant="secondary" onClick={() => navigate("/invoices")}>
          Back to Invoices
        </Button>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <>
      <InvoiceForm
        mode="edit"
        initialValues={invoice}
        customers={customers}
        businessProfile={businessProfile}
        isLoadingCustomers={isLoadingCustomers}
        onSubmit={handleSave}
        onCancel={() => navigate("/invoices")}
        onAddCustomer={() => setIsCustomerDrawerOpen(true)}
        newlyAddedCustomer={newlyAddedCustomer}
        availableItems={items}
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

export default EditInvoicePage;
