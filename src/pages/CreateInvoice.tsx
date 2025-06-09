import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import InvoiceForm from "@/components/invoice/InvoiceForm";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Customer } from '@/types';
import CustomerFormDrawer, { CustomerFormValues } from '@/components/customer/CustomerFormDrawer';
import { invoiceService } from '@/services/supabaseService';
import { useForm } from 'react-hook-form';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBusinessProfile } from '@/hooks/useBusinessProfile';
import { useCustomers } from '@/hooks/useCustomers';

const CreateInvoice = () => {
  const { 
    customers, 
    isLoadingCustomers, 
    createInvoice, 
    businessProfile, 
    createCustomer, 
    items, 
    isLoadingItems
  } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { isLoading: isLoadingProfile } = useBusinessProfile();
  const { fetchCustomers } = useCustomers();
  const [newlyAddedCustomer, setNewlyAddedCustomer] = useState<Customer | null>(null);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);

  const [calculatedInvoiceNumber, setCalculatedInvoiceNumber] = useState<string | undefined>(undefined);
  const [isLoadingInvoiceNumber, setIsLoadingInvoiceNumber] = useState(true);

  const form = useForm<any>({
    defaultValues: {
      invoiceNumber: '',
      customerId: '',
      date: new Date(),
      dueDate: new Date(new Date().setDate(new Date().getDate() + 30)),
      notes: businessProfile?.defaultNotes || "",
      terms: businessProfile?.defaultTerms || "",
      currency: businessProfile?.currency || "USD",
      additionalCharges: 0,
      discount: 0,
    },
  });

  useEffect(() => {
    const fetchAndCalculateInvoiceNumber = async () => {
      setIsLoadingInvoiceNumber(true);
      try {
        const nextGeneratedNumber = await invoiceService.getNextInvoiceNumber();
        setCalculatedInvoiceNumber(nextGeneratedNumber);
      } catch (error) {
        console.error('Error fetching/calculating invoice number from service:', error);
        toast({
          title: "Error",
          description: "Failed to generate invoice number. Please try again.",
          variant: "destructive",
        });
        setCalculatedInvoiceNumber(`INV-${Date.now()}`);
      } finally {
        setIsLoadingInvoiceNumber(false);
      }
    };

    fetchAndCalculateInvoiceNumber();
  }, []);

  useEffect(() => {
    if (newlyAddedCustomer) {
      form.setValue('customerId', newlyAddedCustomer.id);
    }
  }, [newlyAddedCustomer, form]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSubmit = async (
    values: any,
    items: any,
    total: number,
    subtotal: number,
    taxAmount: number,
    additionalCharges: number,
    discount: number
  ) => {
    try {
      console.log("Attempting to create invoice with data:", {
        invoiceNumber: values.invoiceNumber,
        customerId: values.customerId,
        date: values.date.toISOString().split('T')[0],
        dueDate: values.dueDate.toISOString().split('T')[0],
        items: items,
        subtotal: subtotal,
        taxAmount: taxAmount,
        total: total,
        status: 'draft',
        currency: values.currency,
        notes: values.notes,
        terms: values.terms,
        additionalCharges: additionalCharges,
        discount: discount,
      });
      await createInvoice({
        invoiceNumber: values.invoiceNumber,
        customerId: values.customerId,
        date: values.date.toISOString().split('T')[0],
        dueDate: values.dueDate.toISOString().split('T')[0],
        items: items,
        subtotal: subtotal,
        taxAmount: taxAmount,
        total: total,
        status: 'draft',
        currency: values.currency,
        notes: values.notes,
        terms: values.terms,
        additionalCharges: additionalCharges,
        discount: discount,
      });
      toast({
        title: "Invoice Created",
        description: "Your invoice has been successfully created."
      });
      navigate('/invoices');
    } catch (error) {
      console.error('Error caught during invoice creation submission:', error);
      console.error('Error creating invoice:', error);
      toast({
        title: "Error",
        description: "Failed to create invoice. Please try again.",
        variant: "destructive"
      });
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

  const handleOpenCustomerForm = () => {
    if (isMobile) {
      setIsCustomerDrawerOpen(true);
    } else {
      navigate('/customers/new');
    }
  };

  const handleCustomerSubmit = async (customer: Customer) => {
    try {
      await fetchCustomers();
      setIsCustomerDrawerOpen(false);
      toast({
        title: 'Success',
        description: 'Customer created successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create customer',
        variant: 'destructive',
      });
    }
  };

  if (isLoadingProfile || isLoadingCustomers) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Create Invoice</h1>
      <InvoiceForm
        mode="create"
        customers={customers}
        businessProfile={businessProfile}
        isLoadingCustomers={isLoadingCustomers}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/invoices')}
        onAddCustomer={handleOpenCustomerForm}
        newlyAddedCustomer={newlyAddedCustomer}
        availableItems={items}
        isLoadingItems={isLoadingItems}
        generatedInvoiceNumber={calculatedInvoiceNumber}
        isLoadingInvoiceNumber={isLoadingInvoiceNumber}
      />

      {isMobile && (
        <CustomerFormDrawer
          open={isCustomerDrawerOpen}
          onOpenChange={setIsCustomerDrawerOpen}
          initialValues={null}
          onSubmit={handleCustomerSubmit}
        />
      )}
    </div>
  );
};

export default CreateInvoice;
