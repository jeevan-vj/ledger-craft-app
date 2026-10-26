import { useEffect, useState } from 'react';
import type { InvoiceImportDraftPatch, InvoiceImportDraftResponse, InvoiceImportMimeType } from '@ledgercraft/contracts';
import { AlertTriangle, Download, FileWarning, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type Contact = { id: string; name: string; type: 'customer' | 'vendor' };
type Props = {
  review: InvoiceImportDraftResponse;
  filename: string;
  mimeType: InvoiceImportMimeType;
  previewUrl: string | null;
  organisationName: string;
  contacts: Contact[];
  onChange: (patch: InvoiceImportDraftPatch) => void;
  onCommit: (acknowledgeDuplicates: boolean) => void;
  onDownload: () => void;
  committing: boolean;
};

type Rational = { numerator: bigint; denominator: bigint };
function rational(value: string): Rational {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error('Enter a non-negative decimal number');
  const fraction = match[2] ?? '';
  return { numerator: BigInt(`${match[1]}${fraction}`), denominator: 10n ** BigInt(fraction.length) };
}
function halfUp(numerator: bigint, denominator: bigint) { return (numerator * 2n + denominator) / (denominator * 2n); }
function centsText(cents: bigint) { return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`; }
function lineCents(quantity: string, unitPrice: string) {
  const q = rational(quantity); const price = rational(unitPrice);
  return halfUp(q.numerator * price.numerator * 100n, q.denominator * price.denominator);
}
function percentageCents(cents: bigint, rate: string) {
  const parsed = rational(rate);
  return halfUp(cents * parsed.numerator, parsed.denominator * 100n);
}
function updateLines(review: InvoiceImportDraftResponse, index: number, changes: Partial<InvoiceImportDraftResponse['draft']['lineItems'][number]>): InvoiceImportDraftPatch {
  const lineItems = review.draft.lineItems.map((line, lineIndex) => lineIndex === index ? { ...line, ...changes } : line);
  let net = 0n; let gst = 0n;
  const computed = lineItems.map((line) => {
    const amount = lineCents(line.quantity, line.unitPrice); net += amount; gst += percentageCents(amount, line.gstRate);
    return { ...line, amount: centsText(amount) };
  });
  return { lineItems: computed, net: centsText(net), gst: centsText(gst), total: centsText(net + gst) };
}

function ConfidenceLabel({ field, review }: { field: keyof InvoiceImportDraftResponse['draft']['confidence']; review: InvoiceImportDraftResponse }) {
  const value = review.draft.confidence[field];
  if (Array.isArray(value) || value.label === 'High') return null;
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Check this · {Math.round(value.value * 100)}%</span>;
}

function Field({ label, field, review, type = 'text', onChange }: { label: string; field: 'issuerName' | 'recipientName' | 'documentNumber' | 'issueDate' | 'dueDate'; review: InvoiceImportDraftResponse; type?: string; onChange: Props['onChange'] }) {
  const confidence = review.draft.confidence[field];
  return <div className={cn('space-y-2 rounded-xl border p-3', confidence.label !== 'High' ? 'border-amber-400 bg-amber-50/50' : 'border-border')}>
    <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={`import-${field}`}>{label}</Label><ConfidenceLabel field={field} review={review} /></div>
    <Input id={`import-${field}`} type={type} defaultValue={review.draft[field] ?? ''} onBlur={(event) => onChange({ [field]: event.target.value || null })} />
  </div>;
}

export function InvoiceImportReview({ review, filename, mimeType, previewUrl, organisationName, contacts, onChange, onCommit, onDownload, committing }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => setAcknowledged(false), [review.documentId]);
  const blocking = review.validationIssues.some((issue) => issue.blocking);
  const hasDuplicates = review.duplicateWarnings.length > 0;
  const canCommit = Boolean(review.direction) && !blocking && (!hasDuplicates || acknowledged) && Boolean(review.contactId) && !committing;
  const buttonLabel = review.direction === 'SALES' ? 'Create draft invoice' : review.direction === 'PURCHASE' ? 'Create draft bill' : 'Choose Sales or Purchase to continue';
  const filteredContacts = contacts.filter((contact) => !review.direction || contact.type === (review.direction === 'SALES' ? 'customer' : 'vendor'));

  return <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(430px,0.85fr)]">
      <section className="min-h-[560px] overflow-hidden rounded-2xl border border-border bg-[#121511]" aria-label="Original document preview">
        <div className="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-3 text-white"><div className="min-w-0"><p className="truncate text-sm font-semibold">{filename}</p><p className="text-xs text-white/65">Original document</p></div><Button type="button" variant="secondary" size="sm" onClick={onDownload}><Download />Download original</Button></div>
        {previewUrl ? (mimeType === 'application/pdf' ? <iframe title="Original invoice document" src={previewUrl} className="h-[620px] w-full bg-white" /> : <div className="flex h-[620px] items-center justify-center overflow-auto p-5"><img src={previewUrl} alt={`Original document ${filename}`} className="max-h-full max-w-full object-contain" /></div>) : <div className="flex h-[620px] items-center justify-center text-sm text-white/70">Loading original document…</div>}
      </section>

      <section className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="Review extracted invoice fields">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold tracking-tight">Review extraction</h2><p className="mt-1 text-sm text-muted-foreground">Confirm the document type and check every flagged field.</p></div>{(review.provider === 'mock' || review.mock) && <Badge variant="warning">Mock extraction — demo data</Badge>}</div>

        <fieldset className="space-y-3"><legend className="font-semibold">What should this become?</legend><p className="text-sm text-muted-foreground">AI suggestion only: <strong className="text-foreground">Suggested: {review.draft.suggestedDirection === 'SALES' ? 'Sales' : review.draft.suggestedDirection === 'PURCHASE' ? 'Purchase' : 'No suggestion'}</strong></p>
          <RadioGroup value={review.direction ?? ''} onValueChange={(value) => onChange({ direction: value as 'SALES' | 'PURCHASE', contactId: null })} className="grid gap-3 sm:grid-cols-2">
            <Label htmlFor="direction-sales" className="flex cursor-pointer gap-3 rounded-xl border border-border p-4 hover:bg-muted/50"><RadioGroupItem id="direction-sales" value="SALES" /><span><span className="block font-semibold">Money in: Sales invoice</span><span className="mt-1 block text-xs text-muted-foreground">A customer owes your business</span></span></Label>
            <Label htmlFor="direction-purchase" className="flex cursor-pointer gap-3 rounded-xl border border-border p-4 hover:bg-muted/50"><RadioGroupItem id="direction-purchase" value="PURCHASE" /><span><span className="block font-semibold">Money out: Purchase bill</span><span className="mt-1 block text-xs text-muted-foreground">Your business owes a supplier</span></span></Label>
          </RadioGroup>
        </fieldset>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4"><div><Label htmlFor="third-party-issued" className="font-semibold">Issued by a third party</Label><p className="mt-1 text-xs text-muted-foreground">Use for buyer-created or self-billed documents.</p></div><Switch id="third-party-issued" checked={review.thirdPartyIssued} onCheckedChange={(value) => onChange({ thirdPartyIssued: value })} /></div>
        {review.direction === 'SALES' && review.thirdPartyIssued && review.draft.issuerName && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>{review.draft.issuerName}</strong> issued this document on your behalf (buyer-created). It will be recorded as a sales invoice for <strong>{organisationName}</strong>, keeping the external number.</div>}

        <div className="space-y-2"><Label>Customer or vendor</Label><Select value={review.contactId ?? ''} onValueChange={(value) => onChange({ contactId: value })} disabled={!review.direction}><SelectTrigger aria-label="Customer or vendor"><SelectValue placeholder={review.direction ? `Choose ${review.direction === 'SALES' ? 'customer' : 'vendor'}` : 'Choose a direction first'} /></SelectTrigger><SelectContent>{filteredContacts.map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.name}</SelectItem>)}</SelectContent></Select>{review.direction && filteredContacts.length === 0 && <p className="text-xs text-muted-foreground">No matching contacts found. Add one before committing this import.</p>}</div>

        <div className="grid gap-3 sm:grid-cols-2"><Field label="Issuer" field="issuerName" review={review} onChange={onChange} /><Field label="Recipient" field="recipientName" review={review} onChange={onChange} /><Field label="Document number" field="documentNumber" review={review} onChange={onChange} /><Field label="Issue date" field="issueDate" type="date" review={review} onChange={onChange} /><Field label="Due date" field="dueDate" type="date" review={review} onChange={onChange} /></div>

        <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Line items</h3><Button type="button" variant="ghost" size="sm" onClick={() => onChange({ lineItems: [...review.draft.lineItems, { description: 'New item', quantity: '1', unitPrice: '0.00', amount: '0.00', gstRate: '15' }] })}><Plus />Add line</Button></div>{review.draft.lineItems.map((line, index) => <div key={index} className={cn('grid gap-2 rounded-xl border p-3 sm:grid-cols-[2fr_.7fr_1fr_.7fr_auto]', review.draft.confidence.lineItems[index]?.label !== 'High' ? 'border-amber-400 bg-amber-50/50' : 'border-border')}>
          <Input aria-label={`Line ${index + 1} description`} defaultValue={line.description} onBlur={(event) => onChange(updateLines(review, index, { description: event.target.value }))} />
          <Input aria-label={`Line ${index + 1} quantity`} inputMode="decimal" defaultValue={line.quantity} onBlur={(event) => onChange(updateLines(review, index, { quantity: event.target.value }))} />
          <Input aria-label={`Line ${index + 1} unit price`} inputMode="decimal" defaultValue={line.unitPrice} onBlur={(event) => onChange(updateLines(review, index, { unitPrice: event.target.value }))} />
          <Input aria-label={`Line ${index + 1} GST rate`} inputMode="decimal" defaultValue={line.gstRate} onBlur={(event) => onChange(updateLines(review, index, { gstRate: event.target.value }))} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} onClick={() => onChange({ lineItems: review.draft.lineItems.filter((_, i) => i !== index) })}><Trash2 /></Button>
          {review.draft.confidence.lineItems[index]?.label !== 'High' && <span className="sm:col-span-5"><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Check this · {Math.round((review.draft.confidence.lineItems[index]?.value ?? 0) * 100)}%</span></span>}
        </div>)}</div>

        <div className="ml-auto max-w-xs space-y-2 rounded-xl bg-muted p-4 tabular-nums"><div className="flex justify-between"><span className="text-muted-foreground">Net</span><strong>{review.draft.currency} {review.draft.net}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">GST</span><strong>{review.draft.currency} {review.draft.gst}</strong></div><div className="flex justify-between border-t border-border pt-2 text-lg"><span>Total</span><strong>{review.draft.currency} {review.draft.total}</strong></div></div>

        {blocking && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"><div className="flex gap-2 font-semibold"><FileWarning className="h-5 w-5" />Totals need correction</div><p className="mt-2">The line amounts do not match the stated total. Correct the lines or totals before creating a draft.</p>{review.validationIssues.filter((issue) => issue.blocking).map((issue) => <p key={`${issue.code}-${issue.path}`} className="mt-1">{issue.message}</p>)}</div>}
        {hasDuplicates && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><div className="flex gap-2 font-semibold"><AlertTriangle className="h-5 w-5" />Possible duplicate</div><ul className="mt-2 list-disc space-y-1 pl-5">{review.duplicateWarnings.map((warning) => <li key={`${warning.kind}-${warning.recordId}`}>{warning.message}</li>)}</ul><Label className="mt-4 flex cursor-pointer items-start gap-3"><Checkbox checked={acknowledged} onCheckedChange={(value) => setAcknowledged(value === true)} aria-label="I reviewed the possible duplicate" /><span>I reviewed the possible duplicate and want to continue.</span></Label></div>}
        <Button type="button" className="w-full bg-[#9FE870] text-[#163300] hover:bg-[#8ED85F]" size="lg" disabled={!canCommit} onClick={() => onCommit(acknowledged)}>{committing ? 'Creating draft…' : buttonLabel}</Button>
      </section>
    </div>
  </div>;
}
