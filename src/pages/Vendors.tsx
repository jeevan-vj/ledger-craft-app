import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateVendorRequest, VendorDto } from '@ledgercraft/contracts';
import { Building2, Download, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';

const emptyForm: CreateVendorRequest = { name: '', email: null, phone: null, taxId: null, address: null, paymentTermDays: 20, notes: null, contactName: null, defaultAccountId: null, defaultTaxRate: '15', importIdentifier: null, isActive: true };

export default function Vendors() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VendorDto | null>(null);
  const [form, setForm] = useState<CreateVendorRequest>(emptyForm);
  const vendorsQuery = useQuery({ queryKey: ['vendors'], queryFn: purchasesApi.listVendors });
  const accountsQuery = useQuery({ queryKey: ['accounts', 'vendor-defaults'], queryFn: purchasesApi.listAccounts });

  const save = useMutation({
    mutationFn: () => editing ? purchasesApi.updateVendor(editing.id, form) : purchasesApi.createVendor(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setOpen(false);
      toast.success(editing ? 'Vendor updated' : 'Vendor created');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: purchasesApi.removeVendor,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor removed');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const vendors = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (vendorsQuery.data ?? []).filter((vendor) => !needle || [vendor.name, vendor.email, vendor.phone]
      .some((value) => value?.toLowerCase().includes(needle)));
  }, [search, vendorsQuery.data]);

  const showCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const showEdit = (vendor: VendorDto) => {
    setEditing(vendor);
    setForm({
      name: vendor.name,
      email: vendor.email,
      phone: vendor.phone,
      taxId: vendor.taxId,
      address: vendor.address,
      paymentTermDays: vendor.paymentTermDays,
      notes: vendor.notes,
      isActive: vendor.isActive,
      contactName: vendor.contactName,
      defaultAccountId: vendor.defaultAccountId,
      defaultTaxRate: vendor.defaultTaxRate,
      importIdentifier: vendor.importIdentifier,
    });
    setOpen(true);
  };
  const downloadCsv = async () => { const csv = await purchasesApi.exportVendors(); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'vendors.csv'; anchor.click(); URL.revokeObjectURL(url); };
  const importCsv = async (file: File) => {
    const csv = await file.text();
    const preview = await purchasesApi.importVendors({ csv, dryRun: true });
    if (preview.errors.length) { toast.error(`${preview.errors.length} rows need attention`); return; }
    const applied = await purchasesApi.importVendors({ csv, dryRun: false });
    await queryClient.invalidateQueries({ queryKey: ['vendors'] }); toast.success(`${applied.appliedRows} vendors imported`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Keep supplier details and payment terms ready for bills."
        actions={<div className="flex gap-2"><label><input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && void importCsv(event.target.files[0])} /><Button variant="outline" asChild><span><Upload />Import CSV</span></Button></label><Button variant="outline" onClick={() => void downloadCsv()}><Download />Export CSV</Button><Button onClick={showCreate}><Plus />New vendor</Button></div>}
      />

      {vendorsQuery.isLoading ? (
        <ContentPanel><div className="h-40 animate-pulse rounded-2xl bg-muted" aria-label="Loading vendors" /></ContentPanel>
      ) : vendorsQuery.isError ? (
        <ContentPanel>
          <p className="font-semibold">Vendors could not be loaded</p>
          <p className="mt-1 text-sm text-muted-foreground">{vendorsQuery.error.message}</p>
          <Button className="mt-5" variant="outline" onClick={() => vendorsQuery.refetch()}>Try again</Button>
        </ContentPanel>
      ) : (vendorsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Build your supplier directory"
          description="Add suppliers before recording bills, so due dates and contact details stay consistent."
          actions={[{ icon: Plus, title: 'Add your first vendor', subtitle: 'Name, contact details and payment terms', onClick: showCreate }]}
        />
      ) : (
        <ContentPanel padded={false}>
          <div className="p-4 sm:p-6">
            <label className="relative block max-w-md">
              <span className="sr-only">Search vendors</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search vendors" />
            </label>
          </div>
          <div className="hidden sm:block">
            <Table>
              <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Contact</TableHead><TableHead>Terms</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>{vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell><p className="font-semibold">{vendor.name}</p>{vendor.taxId && <p className="text-xs text-muted-foreground">GST {vendor.taxId}</p>}</TableCell>
                  <TableCell><p>{vendor.email ?? 'No email'}</p><p className="text-xs text-muted-foreground">{vendor.phone ?? 'No phone'}</p></TableCell>
                  <TableCell>{vendor.paymentTermDays} days</TableCell>
                  <TableCell><Badge variant={vendor.isActive ? 'success' : 'secondary'}>{vendor.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`Edit ${vendor.name}`} onClick={() => showEdit(vendor)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${vendor.name}`} onClick={() => window.confirm(`Delete ${vendor.name}?`) && remove.mutate(vendor.id)}><Trash2 /></Button></div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
          <div className="divide-y divide-border sm:hidden">{vendors.map((vendor) => (
            <button key={vendor.id} type="button" onClick={() => showEdit(vendor)} className="flex w-full items-center gap-3 p-5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"><Building2 className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{vendor.name}</span><span className="block truncate text-sm text-muted-foreground">{vendor.email ?? `${vendor.paymentTermDays} day terms`}</span></span>
              <Badge variant={vendor.isActive ? 'success' : 'secondary'}>{vendor.isActive ? 'Active' : 'Inactive'}</Badge>
            </button>
          ))}</div>
        </ContentPanel>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit vendor' : 'New vendor'}</DialogTitle><DialogDescription>Contact details and default payment terms for purchase bills.</DialogDescription></DialogHeader>
          <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
            <div className="space-y-2"><Label htmlFor="vendor-name">Vendor name</Label><Input id="vendor-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="vendor-contact">Contact person</Label><Input id="vendor-contact" value={form.contactName ?? ''} onChange={(event) => setForm({ ...form, contactName: event.target.value || null })} /></div>
              <div className="space-y-2"><Label htmlFor="vendor-email">Email</Label><Input id="vendor-email" type="email" value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value || null })} /></div>
              <div className="space-y-2"><Label htmlFor="vendor-phone">Phone</Label><Input id="vendor-phone" value={form.phone ?? ''} onChange={(event) => setForm({ ...form, phone: event.target.value || null })} /></div>
              <div className="space-y-2"><Label htmlFor="vendor-tax">GST number</Label><Input id="vendor-tax" value={form.taxId ?? ''} onChange={(event) => setForm({ ...form, taxId: event.target.value || null })} /></div>
              <div className="space-y-2"><Label htmlFor="vendor-terms">Payment terms (days)</Label><Input id="vendor-terms" type="number" min="0" max="365" value={form.paymentTermDays ?? 20} onChange={(event) => setForm({ ...form, paymentTermDays: Number(event.target.value) })} /></div>
              <div className="space-y-2"><Label>Default expense account</Label><Select value={form.defaultAccountId ?? 'none'} onValueChange={(value) => setForm({ ...form, defaultAccountId: value === 'none' ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No default</SelectItem>{accountsQuery.data?.filter((account) => account.type === 'expense').map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="vendor-tax-rate">Default GST rate</Label><Input id="vendor-tax-rate" inputMode="decimal" value={form.defaultTaxRate ?? '15'} onChange={(event) => setForm({ ...form, defaultTaxRate: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="vendor-import-id">Import identifier</Label><Input id="vendor-import-id" value={form.importIdentifier ?? ''} onChange={(event) => setForm({ ...form, importIdentifier: event.target.value || null })} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="vendor-address">Address</Label><Textarea id="vendor-address" value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value || null })} /></div>
            <div className="space-y-2"><Label htmlFor="vendor-notes">Notes</Label><Textarea id="vendor-notes" value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value || null })} /></div>
            <div className="flex items-center justify-between rounded-xl bg-muted p-4"><div><Label htmlFor="vendor-active">Active vendor</Label><p className="text-sm text-muted-foreground">Inactive vendors stay in history but are hidden from new bills.</p></div><Switch id="vendor-active" checked={form.isActive ?? true} onCheckedChange={(checked) => setForm({ ...form, isActive: checked })} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={save.isPending || !form.name.trim()}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create vendor'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
