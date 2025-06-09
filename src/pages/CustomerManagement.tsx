import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { Customer } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useCustomers } from '@/hooks/useCustomers';

const customerFormSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters' }),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  zip: z.string().optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')).default('New Zealand'),
  is_vip: z.boolean().default(false)
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

const CustomerManagement = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getCustomer, createCustomer, updateCustomer } = useAppContext();
  const { customers, createCustomer: useCustomersCreateCustomer, updateCustomer: useCustomersUpdateCustomer, isLoading } = useCustomers();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: 'New Zealand',
      is_vip: false
    }
  });

  useEffect(() => {
    const loadCustomer = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const customer = await getCustomer(id);
        if (customer) {
          setCustomer(customer);
          form.reset({
            name: customer.name,
            email: customer.email || '',
            phone: customer.phone || '',
            address: customer.address || '',
            city: customer.city || '',
            state: customer.state || '',
            zip: customer.zip || '',
            country: customer.country || 'New Zealand',
            is_vip: customer.isVip || false
          });
        }
      } catch (error) {
        console.error('Error loading customer:', error);
        toast({
          title: 'Error',
          description: 'Failed to load customer details',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    loadCustomer();
  }, [id, getCustomer, form, toast]);

  const onSubmit = async (values: CustomerFormValues) => {
    setSaving(true);
    try {
      const customerData = {
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

      if (id) {
        await updateCustomer(id, customerData);
        toast({
          title: 'Success',
          description: 'Customer updated successfully'
        });
      } else {
        await createCustomer(customerData);
        toast({
          title: 'Success',
          description: 'Customer created successfully'
        });
      }
      navigate('/customers');
    } catch (error) {
      console.error('Error saving customer:', error);
      toast({
        title: 'Error',
        description: 'Failed to save customer',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/customers')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">
          {id ? 'Edit Customer' : 'New Customer'}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP Code</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* <FormField
                control={form.control}
                name="is_vip"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>VIP Customer</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              /> */}

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/customers')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {id ? 'Update Customer' : 'Create Customer'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerManagement; 