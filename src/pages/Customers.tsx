import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Star, Pencil, Trash, Mail, Phone, MapPin, ChevronRight } from 'lucide-react';
import { customerService } from '@/services/supabaseService';
import { Customer } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useIsMobile } from '@/hooks/use-mobile';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import CustomerFormDrawer from '@/components/customer/CustomerFormDrawer';
import { useNavigate } from 'react-router-dom';

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

const Customers = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const data = await customerService.getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load customers',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deleteCustomerId) return;

    try {
      await customerService.deleteCustomer(deleteCustomerId);

      toast({
        title: 'Success',
        description: 'Customer deleted successfully',
      });

      setDeleteCustomerId(null);
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete customer',
        variant: 'destructive',
      });
    } finally {
      setDeleteCustomerId(null);
    }
  };

  const handleOpenCreateCustomer = () => {
    if (isMobile) {
      setCustomerToEdit(null);
      setIsCustomerDrawerOpen(true);
    } else {
      navigate('/customers/new');
    }
  };

  const handleOpenEditCustomer = (customer: Customer) => {
    if (isMobile) {
      setCustomerToEdit(customer);
      setIsCustomerDrawerOpen(true);
    } else {
      navigate(`/customers/${customer.id}/edit`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pt-5">
        <h1 className="text-3xl font-bold">Customers</h1>
        <Button
          className="flex items-center gap-2 bg-invoice-teal hover:bg-invoice-teal/90"
          onClick={handleOpenCreateCustomer}
        >
          <Plus size={18} />
          <span>New Customer</span>
        </Button>
      </div>
      
      {isMobile ? (
        <div className="grid grid-cols-1 gap-4">
          {customers.length === 0 ? (
            <Card className="flex items-center justify-center h-32 text-muted-foreground">
              No customers found. Create your first customer to get started.
            </Card>
          ) : (
            customers.map((customer) => (
              <Card key={customer.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center">
                      <h3 className="text-lg font-medium">
                        {customer.name}
                      </h3>
                      {customer.isVip && (
                        <Star className="h-4 w-4 text-amber-400 ml-1" />
                      )}
                    </div>
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEditCustomer(customer)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500"
                        onClick={() => setDeleteCustomerId(customer.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <div className="flex items-center text-sm">
                      <Mail className="w-4 h-4 mr-2 text-muted-foreground" />
                      <span>{customer.email}</span>
                    </div>
                    {customer.phone && (
                      <div className="flex items-center text-sm">
                        <Phone className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                    {(customer.city || customer.state) && (
                      <div className="flex items-center text-sm">
                        <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span>{customer.city && customer.state ? `${customer.city}, ${customer.state}` : customer.city || customer.state}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No customers found. Create your first customer to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="flex items-center">
                          <div className="text-sm font-medium">
                            {customer.name} {customer.isVip && (
                              <Star className="inline-block h-3 w-3 text-amber-400 ml-1" />
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{customer.email}</TableCell>
                      <TableCell>{customer.phone || 'N/A'}</TableCell>
                      <TableCell>
                        {customer.city && customer.state ? `${customer.city}, ${customer.state}` : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditCustomer(customer)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500"
                            onClick={() => setDeleteCustomerId(customer.id)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      
      {isMobile && (
        <CustomerFormDrawer
          open={isCustomerDrawerOpen}
          onOpenChange={setIsCustomerDrawerOpen}
          initialValues={customerToEdit}
          onSubmit={async (values) => {
            if (customerToEdit) {
              await customerService.updateCustomer(customerToEdit.id, {
                name: values.name,
                email: values.email || null,
                phone: values.phone || null,
                address: values.address || null,
                city: values.city || null,
                state: values.state || null,
                zip: values.zip || null,
                country: values.country || 'New Zealand',
                isVip: values.is_vip
              });
              toast({
                title: 'Success',
                description: 'Customer updated successfully',
              });
            } else {
              await customerService.createCustomer({
                name: values.name,
                email: values.email || null,
                phone: values.phone || null,
                address: values.address || null,
                city: values.city || null,
                state: values.state || null,
                zip: values.zip || null,
                country: values.country || 'New Zealand',
                isVip: values.is_vip
              });
              toast({
                title: 'Success',
                description: 'Customer created successfully',
              });
            }
            setIsCustomerDrawerOpen(false);
            setCustomerToEdit(null);
            fetchCustomers();
          }}
        />
      )}
      
      <Dialog
        open={!!deleteCustomerId} 
        onOpenChange={(open) => {
          if (!open) setDeleteCustomerId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteCustomerId(null)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteCustomer}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
