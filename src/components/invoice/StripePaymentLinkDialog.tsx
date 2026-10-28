import { useEffect, useState } from 'react';
import type { StripePaymentLink } from '@ledgercraft/contracts';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { stripeApi } from '@/features/stripe/api/stripeApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; invoice: { id: string; invoiceNumber: string; balanceDue: number; currency: string }; }
function money(value: string, currency: string) {
  if (currency === 'NZD') return `NZ$${Number(value).toFixed(2)}`;
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(Number(value));
}

export function StripePaymentLinkDialog({ open, onOpenChange, invoice }: Props) {
  const [link, setLink] = useState<StripePaymentLink | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) void stripeApi.listPaymentLinks(invoice.id).then(({ items }) => setLink(items.find((item) => item.status === 'open') ?? null)).catch(() => undefined); }, [invoice.id, open]);
  const create = async () => { setBusy(true); try { setLink(await stripeApi.createPaymentLink(invoice.id, { amount: invoice.balanceDue.toFixed(2) })); } catch (error) { toast.error('Could not create payment link', { description: error instanceof Error ? error.message : 'Try again.' }); } finally { setBusy(false); } };
  const copy = async () => { if (link) { await navigator.clipboard.writeText(link.payUrl); toast.success('Payment link copied'); } };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-[#635BFF]" />Card payment</DialogTitle><DialogDescription>Create a secure Stripe Checkout link for invoice {invoice.invoiceNumber}.</DialogDescription></DialogHeader>
    {!link ? <div className="space-y-5 py-2"><div className="rounded-2xl bg-muted/50 p-5"><p className="text-sm text-muted-foreground">Amount due</p><p className="mt-1 text-3xl font-semibold">{money(invoice.balanceDue.toFixed(2), invoice.currency)}</p></div><Button className="w-full" disabled={busy || invoice.currency !== 'NZD'} onClick={() => void create()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create payment link</Button>{invoice.currency !== 'NZD' && <p className="text-sm text-amber-700">Card payment links currently support NZD invoices only.</p>}</div> : <div className="space-y-5 py-2">
      <div className="mx-auto rounded-2xl border bg-white p-4" aria-label="Stripe payment QR code"><QRCodeSVG value={link.payUrl} size={176} level="M" /></div>
      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-4 text-sm"><div><p className="text-muted-foreground">Customer pays</p><p className="font-semibold">{money(link.amount, link.currency)}</p></div><div><p className="text-muted-foreground">Platform fee</p><p className="font-semibold">{money(link.platformFee, link.currency)}</p></div></div>
      <div className="flex gap-2"><Input readOnly value={link.payUrl} aria-label="Payment link" /><Button variant="outline" size="icon" onClick={() => void copy()} aria-label="Copy payment link"><Copy className="h-4 w-4" /></Button></div>
      <div className="flex gap-3"><Button className="flex-1" onClick={() => void copy()}><Check className="mr-2 h-4 w-4" />Copy link</Button><Button variant="outline" asChild><a href={link.payUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open</a></Button></div>
      <p className="text-xs text-muted-foreground">Expires {new Date(link.expiresAt).toLocaleString()}. Payment is recorded automatically after Stripe confirms it.</p>
    </div>}
  </DialogContent></Dialog>;
}
