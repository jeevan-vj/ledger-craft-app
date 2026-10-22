import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Star, Pencil, Trash, Mail, Phone, MapPin, ChevronRight, Filter, X, Search, ChevronDown, RefreshCw, Loader2, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { useCustomerDirectory } from '@/features/customers/hooks/useCustomerDirectory';
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
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue
} from '@/components/ui/select';
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

const VIP_OPTIONS = [
  { value: 'all', label: 'All Customers' },
  { value: 'vip', label: 'VIP Only' },
  { value: 'regular', label: 'Regular Only' },
];

const LOCATION_FILTERS = [
  { value: 'all', label: 'All Locations' },
  { value: 'with_location', label: 'With Location' },
  { value: 'no_location', label: 'No Location' },
];

interface CustomerFilters {
  search: string;
  vipStatus: string;
  location: string;
  country: string;
  tags: string;
  sortBy: 'name' | 'email' | 'city' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

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
  const { 
    customers, 
    isLoadingCustomers: loading, 
    refreshCustomers,
    createCustomer: createCustomerFromAppData,
    updateCustomer: updateCustomerFromAppData,
    deleteCustomer: deleteCustomerFromAppData
  } = useCustomerDirectory();
  
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [filters, setFilters] = useState<CustomerFilters>({
    search: '',
    vipStatus: 'all',
    location: 'all',
    country: 'all',
    tags: '',
    sortBy: 'name',
    sortOrder: 'asc',
  });

  // Data is automatically loaded by useAppData hook

  // Manual refresh function
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshCustomers();
      toast({
        title: "Refreshed",
        description: "Customer list has been updated.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh customers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateCustomer = async (values: CustomerFormValues) => {
    try {
      console.log("Attempting to create customer with values:", values);
      const newCustomer = {
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

      console.log("Transformed customer data:", newCustomer);
      await createCustomerFromAppData(newCustomer);
      console.log("Customer created successfully");

      toast({
        title: 'Success',
        description: 'Customer created successfully',
      });

      setIsCustomerDrawerOpen(false);
      setCustomerToEdit(null);
    } catch (error) {
      console.error('Error creating customer:', error);
      toast({
        title: 'Error',
        description: 'Failed to create customer',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateCustomer = async (values: CustomerFormValues) => {
    if (!customerToEdit) return;

    try {
      const updatedCustomer = {
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

      await updateCustomerFromAppData(customerToEdit.id, updatedCustomer);

      toast({
        title: 'Success',
        description: 'Customer updated successfully',
      });

      setIsCustomerDrawerOpen(false);
      setCustomerToEdit(null);
    } catch (error) {
      console.error('Error updating customer:', error);
      toast({
        title: 'Error',
        description: 'Failed to update customer',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deleteCustomerId) return;

    try {
      await deleteCustomerFromAppData(deleteCustomerId);

      toast({
        title: 'Success',
        description: 'Customer deleted successfully',
      });

      setDeleteCustomerId(null);
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

  const handleOpenCreateCustomerDrawer = () => {
    setCustomerToEdit(null);
    setIsCustomerDrawerOpen(true);
  };

  const handleOpenEditCustomerDrawer = (customer: Customer) => {
    setCustomerToEdit(customer);
    setIsCustomerDrawerOpen(true);
  };

  const handleFormSubmit = (values: CustomerFormValues) => {
    if (customerToEdit) {
      handleUpdateCustomer(values);
    } else {
      handleCreateCustomer(values);
    }
  };

  // Filter logic
  const filteredAndSortedCustomers = useMemo(() => {
    let filtered = customers.filter((customer) => {
      // Search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        const matchesSearch = 
          customer.name.toLowerCase().includes(searchTerm) ||
          customer.email?.toLowerCase().includes(searchTerm) ||
          customer.phone?.toLowerCase().includes(searchTerm) ||
          customer.city?.toLowerCase().includes(searchTerm) ||
          customer.state?.toLowerCase().includes(searchTerm) ||
          customer.country?.toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;
      }

      // VIP status filter
      if (filters.vipStatus !== 'all') {
        if (filters.vipStatus === 'vip' && !customer.isVip) return false;
        if (filters.vipStatus === 'regular' && customer.isVip) return false;
      }

      // Location filter
      if (filters.location !== 'all') {
        const hasLocation = customer.city || customer.state;
        if (filters.location === 'with_location' && !hasLocation) return false;
        if (filters.location === 'no_location' && hasLocation) return false;
      }

      // Country filter
      if (filters.country !== 'all') {
        if (!customer.country?.toLowerCase().includes(filters.country.toLowerCase())) return false;
      }

      // Tags filter
      if (filters.tags) {
        const tagSearch = filters.tags.toLowerCase();
        const hasTags = customer.tags?.some(tag => 
          tag.toLowerCase().includes(tagSearch)
        );
        if (!hasTags) return false;
      }

      return true;
    });

    // Sort filtered results
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (filters.sortBy) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'email':
          aValue = a.email || '';
          bValue = b.email || '';
          break;
        case 'city':
          aValue = a.city || '';
          bValue = b.city || '';
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt || 0);
          bValue = new Date(b.createdAt || 0);
          break;
        default:
          aValue = a.name;
          bValue = b.name;
      }

      if (filters.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [customers, filters]);

  const updateFilter = (key: keyof CustomerFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      vipStatus: 'all',
      location: 'all',
      country: 'all',
      tags: '',
      sortBy: 'name',
      sortOrder: 'asc',
    });
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.search) count++;
    if (filters.vipStatus !== 'all') count++;
    if (filters.location !== 'all') count++;
    if (filters.country !== 'all') count++;
    if (filters.tags) count++;
    return count;
  };

  const uniqueCountries = useMemo(() => {
    const countries = customers.map(c => c.country).filter(Boolean);
    return [...new Set(countries)].sort();
  }, [customers]);

  const allTags = useMemo(() => {
    const tags = customers.flatMap(c => c.tags || []);
    return [...new Set(tags)].sort();
  }, [customers]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        actions={
          customers.length > 0 ? (
            <Button onClick={handleOpenCreateCustomerDrawer}>
              <Plus size={18} />
              <span>New Customer</span>
            </Button>
          ) : undefined
        }
      />

      {customers.length === 0 ? (
        <EmptyState
          variant="panel"
          title="Here's how to get started"
          description="Add the people and businesses you invoice so you can bill them in a few taps."
          actions={[
            {
              icon: Users,
              title: 'Add a customer',
              subtitle: 'Name, email, and billing details for your next invoice.',
              onClick: handleOpenCreateCustomerDrawer,
            },
          ]}
        />
      ) : (
      <>
      <div className="flex flex-col gap-4">

        {/* Search and Quick Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search customers, email, phone, location..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2"
            >
              <Filter size={16} />
              Filters
              {getActiveFiltersCount() > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {getActiveFiltersCount()}
                </Badge>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>

          {/* Advanced Filters */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleContent className="space-y-4">
              <Card className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* VIP Status Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Customer Type</label>
                    <Select value={filters.vipStatus} onValueChange={(value) => updateFilter('vipStatus', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIP_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Location Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Location Status</label>
                    <Select value={filters.location} onValueChange={(value) => updateFilter('location', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LOCATION_FILTERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Country Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Country</label>
                    <Select value={filters.country} onValueChange={(value) => updateFilter('country', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Countries</SelectItem>
                        {uniqueCountries.map((country) => (
                          <SelectItem key={country} value={country}>
                            {country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort Options */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sort By</label>
                    <div className="flex gap-2">
                      <Select value={filters.sortBy} onValueChange={(value) => updateFilter('sortBy', value)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Name</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="city">Location</SelectItem>
                          <SelectItem value="createdAt">Created Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                        className="px-3"
                      >
                        {filters.sortOrder === 'asc' ? '↑' : '↓'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Tags Filter - Full Width */}
                <div className="mt-4 space-y-2">
                  <label className="text-sm font-medium">Tags</label>
                  <Input
                    placeholder="Search by tags..."
                    value={filters.tags}
                    onChange={(e) => updateFilter('tags', e.target.value)}
                  />
                  {allTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {allTags.slice(0, 10).map((tag) => (
                        <Button
                          key={tag}
                          variant="outline"
                          size="sm"
                          className="text-xs h-6"
                          onClick={() => updateFilter('tags', tag)}
                        >
                          {tag}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clear Filters */}
                {getActiveFiltersCount() > 0 && (
                  <div className="mt-4 flex justify-end">
                    <Button variant="ghost" onClick={clearFilters} className="text-sm">
                      <X size={16} className="mr-2" />
                      Clear Filters
                    </Button>
                  </div>
                )}
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Results Summary */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredAndSortedCustomers.length} of {customers.length} customers
              {getActiveFiltersCount() > 0 && (
                <span className="ml-2">
                  ({getActiveFiltersCount()} filter{getActiveFiltersCount() !== 1 ? 's' : ''} applied)
                </span>
              )}
              {loading && (
                <span className="ml-2 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
      
      {isMobile ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredAndSortedCustomers.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No customers match your filters.</p>
          ) : (
            filteredAndSortedCustomers.map((customer) => (
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
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/quotes?customerId=${customer.id}`} aria-label={`Quotes for ${customer.name}`}>Quotes</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEditCustomerDrawer(customer)}
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
                <CardContent className="pt-2 pb-2">
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
                  {customer.tags && customer.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {customer.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex justify-end pt-2">
                  <Button variant="ghost" className="h-8 px-3 text-xs flex items-center">
                    View Details
                    <ChevronRight className="ml-1 w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      ) : (
        <ContentPanel padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      No customers match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedCustomers.map((customer) => (
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
                        {customer.city && customer.state
                          ? `${customer.city}, ${customer.state}`
                          : customer.city || customer.state || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {customer.tags && customer.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {customer.tags.map((tag) => (
                              <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No tags</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/quotes?customerId=${customer.id}`} aria-label={`Quotes for ${customer.name}`}>Quotes</Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditCustomerDrawer(customer)}
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
        </ContentPanel>
      )}
      </>
      )}
      
      <CustomerFormDrawer
        open={isCustomerDrawerOpen}
        onOpenChange={setIsCustomerDrawerOpen}
        initialValues={customerToEdit}
        onSubmit={handleFormSubmit}
      />
      
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
