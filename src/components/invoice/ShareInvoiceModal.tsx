import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateShareInvoiceRequest, ShareInvoiceResponse } from '@ledgercraft/contracts';
import { Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { Invoice, InvoiceTemplateName } from '@/types';
import { businessProfileService } from '@/services/supabaseService';
import { ProfileCompletenessBanner } from './ProfileCompletenessBanner';

interface ShareInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
  businessName?: string;
}

const TEMPLATE_OPTIONS = [
  ['classic', 'Classic'], ['modern', 'Modern'], ['minimal', 'Minimal'],
  ['executive', 'Executive'], ['corporate', 'Corporate'], ['modernPro', 'Modern Pro'],
] as const;

function ShareInvoiceControls({ invoice, businessName }: ShareInvoiceModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<InvoiceTemplateName>(
    (invoice.templateName as InvoiceTemplateName) || 'classic',
  );
  const [showTemplates, setShowTemplates] = useState(!invoice.templateName);
  const [enableExpiration, setEnableExpiration] = useState(false);
  const [expirationDays, setExpirationDays] = useState('30');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState('');
  const queryKey = ['invoice-shares', invoice.id];
  const days = Number(expirationDays);
  const validExpiry = !enableExpiration || (Number.isInteger(days) && days >= 1 && days <= 365);
  const mutation = useMutation({
    mutationFn: (input: CreateShareInvoiceRequest) => invoicesApi.share(invoice.id, input),
    retry: false,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
    },
    onSuccess: async (result, input) => {
      // Discard any older list response before publishing the mutation result.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<ShareInvoiceResponse[]>(queryKey, previous => input.replace
        ? [result] : [result, ...(previous ?? []).filter(share => share.shareToken !== result.shareToken)]);
      setCopied(false);
      setActionError('');
      toast({ title: input.replace ? 'Share link replaced' : 'Share link ready', description: 'The link status below comes from the server.' });
    },
    onError: () => {
      setActionError('Could not update the share link. Check the current links and try again.');
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const shares = useQuery({
    queryKey, queryFn: () => invoicesApi.shares(invoice.id), retry: false,
    gcTime: 0, staleTime: 30_000, refetchOnMount: 'always', refetchInterval: 30_000,
    enabled: !mutation.isPending,
  });
  const profile = useQuery({ queryKey: ['business-profile'], queryFn: () => businessProfileService.getBusinessProfile() });
  const current = shares.data?.find(share => share.templateName === selectedTemplate && share.isActive &&
    (!share.expiresAt || Date.parse(share.expiresAt) > Date.now()));
  const shareUrl = current ? `${window.location.origin}/shared/invoice/${current.shareToken}` : '';
  const createLink = (replace = false) => {
    if (!validExpiry) return;
    setActionError('');
    mutation.mutate({ templateName: selectedTemplate,
      expiresAt: enableExpiration ? new Date(Date.now() + days * 86_400_000).toISOString() : undefined,
      ...(replace ? { replace: true } : {}),
    });
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setActionError('');
      toast({ title: 'Link copied' });
    } catch {
      setActionError('Could not copy the link. Select the link above and copy it manually.');
    }
  };
  const shareLink = async () => {
    try {
      await navigator.share({ title: `Invoice ${invoice.invoiceNumber}`, text: `View your invoice from ${businessName || 'us'}.`, url: shareUrl });
      toast({ title: 'Invoice shared successfully!' });
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')) {
        setActionError('Could not share the invoice. Please try again or copy the link.');
      }
    }
  };
  const busy = mutation.isPending || shares.isFetching;
  return <div className="space-y-4">
    <ProfileCompletenessBanner profile={profile.data ?? null} />
    <div className="space-y-2">
      <Label htmlFor="share-template">Template</Label>
      {showTemplates ? <Select value={selectedTemplate} disabled={mutation.isPending} onValueChange={value => { setSelectedTemplate(value as InvoiceTemplateName); setCopied(false); }}>
        <SelectTrigger id="share-template"><SelectValue /></SelectTrigger>
        <SelectContent>{TEMPLATE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
      </Select> : <div className="flex items-center justify-between rounded-md bg-muted/50 p-3">
        <span>{TEMPLATE_OPTIONS.find(([value]) => value === selectedTemplate)?.[1]}</span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setShowTemplates(true)}>Change</Button>
      </div>}
    </div>
    {shares.isPending ? <p role="status">Loading current links…</p> : shares.isError ? <div role="alert" className="space-y-2">
      <p>Could not load the current links.</p><Button variant="outline" onClick={() => shares.refetch()}>Retry loading links</Button>
    </div> : <>
      {current ? <div className="space-y-3">
        <p className="text-sm font-medium">Active link · {current.expiresAt ? `Expires ${new Date(current.expiresAt).toLocaleString()}` : 'No expiry'}</p>
        <p className="text-sm text-muted-foreground">This link keeps its original invoice and business details. Replace it to publish your current details or change its expiry.</p>
        <Label htmlFor="share-url">Share Link</Label>
        <Input id="share-url" value={shareUrl} readOnly className="font-mono text-sm" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={copyLink}><Copy className="mr-2 h-4 w-4" />{copied ? 'Copied' : 'Copy Link'}</Button>
          {typeof navigator.share === 'function' && <Button disabled={busy} onClick={shareLink}><Share2 className="mr-2 h-4 w-4" />Share</Button>}
          <Button asChild variant="outline"><a href={shareUrl} target="_blank" rel="noopener noreferrer">Open invoice</a></Button>
        </div>
      </div> : <p className="text-sm text-muted-foreground">No active link for this template.</p>}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><Label htmlFor="expiration">Link Expiration</Label><p className="text-sm text-muted-foreground">For the new or replacement link only.</p></div>
          <Switch id="expiration" checked={enableExpiration} disabled={mutation.isPending} onCheckedChange={setEnableExpiration} />
        </div>
        {enableExpiration && <div className="space-y-2">
          <Label htmlFor="expiration-days">Expires in (days)</Label>
          <Input id="expiration-days" type="number" min="1" max="365" value={expirationDays} disabled={mutation.isPending} onChange={event => setExpirationDays(event.target.value)} />
          {!validExpiry && <p role="alert" className="text-sm text-destructive">Enter a whole number from 1 to 365.</p>}
        </div>}
        <Button className="w-full" disabled={busy || !validExpiry} onClick={() => current ? setConfirmReplace(true) : createLink()}>
          {mutation.isPending ? 'Updating link…' : current ? 'Replace link' : 'Generate Share Link'}
        </Button>
      </div>
    </>}
    {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
    <p className="text-sm text-muted-foreground">Email delivery is unavailable. Copy or share a link instead.</p>
    <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Replace this invoice’s links?</AlertDialogTitle>
          <AlertDialogDescription>All active links for this invoice will stop working, including links using other templates. The new link publishes the current invoice and business details. {enableExpiration ? `It will expire in ${days} day${days === 1 ? '' : 's'}.` : 'It will have no expiry.'}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep existing links</AlertDialogCancel><AlertDialogAction onClick={() => createLink(true)}>Replace and invalidate old links</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

export default function ShareInvoiceModal(props: ShareInvoiceModalProps) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader><DialogTitle>Share Invoice {props.invoice.invoiceNumber}</DialogTitle>
        <DialogDescription>Anyone with the link can view this invoice and download its PDF without an account.</DialogDescription>
      </DialogHeader>
      {props.open && <ShareInvoiceControls key={props.invoice.id} {...props} />}
    </DialogContent>
  </Dialog>;
}
