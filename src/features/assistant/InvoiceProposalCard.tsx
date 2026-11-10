import type { AssistantProposal } from '@ledgercraft/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canSaveDraft, customerNeedsPick, proposalIsDirty, type ProposalDraft } from './assistantDraft';
import { useProposalPreview, type ProposalPreviewState } from './useProposalPreview';

type InvoiceProposalCardProps = {
  proposal: AssistantProposal;
  draft: ProposalDraft;
  conversationId?: string;
  saving: boolean;
  onChange: (draft: ProposalDraft) => void;
  onSave: () => void;
};

function lineLabel(description: string, field: string) {
  return `${field} for ${description || 'line'}`;
}

function fieldMessage(preview: ProposalPreviewState, field: string) {
  if (preview.status !== 'ready') return undefined;
  return preview.preview.errors.find((error) => error.field === field)?.message;
}

function moneyText(amount: string, currency: string) {
  return `${amount} ${currency}`;
}

export function InvoiceProposalCard({ proposal, draft, conversationId, saving, onChange, onSave }: InvoiceProposalCardProps) {
  const dirty = proposalIsDirty(proposal, draft);
  const preview = useProposalPreview(conversationId, proposal, draft);
  const priced = pricedTotals(preview, proposal, dirty);
  const needsCustomer = customerNeedsPick(proposal, draft);
  const saveAllowed = canSaveDraft(proposal, draft);
  const knownFields = new Set([
    'customerId',
    'date',
    'issueDate',
    'dueDate',
    'taxInclusive',
    'taxRate',
    ...draft.lines.flatMap((_, index) => [`lines.${index}.description`, `lines.${index}.quantity`, `lines.${index}.rate`, `lines.${index}.itemId`]),
  ]);
  const otherErrors = preview.status === 'ready'
    ? preview.preview.errors.filter((error) => !knownFields.has(error.field))
    : [];

  const updateLine = (index: number, patch: Partial<ProposalDraft['lines'][number]>) => {
    onChange({
      ...draft,
      lines: draft.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    });
  };

  const issueError = fieldMessage(preview, 'date') ?? fieldMessage(preview, 'issueDate');
  const dueError = fieldMessage(preview, 'dueDate');
  const taxRateError = fieldMessage(preview, 'taxRate');
  const taxTreatmentError = fieldMessage(preview, 'taxInclusive');
  const customerError = fieldMessage(preview, 'customerId');

  return (
    <section className="rounded-2xl bg-card p-4 text-card-foreground shadow-surface sm:p-6" aria-label="Invoice proposal">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Invoice proposal</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nothing is saved until you tap Save draft.</p>
        </div>
        <p className="text-sm font-medium text-foreground">{priced ? 'Priced by the server' : proposal.totals == null && !dirty && preview.status === 'idle' ? 'Incomplete' : 'Unconfirmed'}</p>
      </div>

      {preview.status === 'error' && (
        <p role="alert" className="mt-3 text-sm text-destructive">{preview.message}</p>
      )}
      {!priced && preview.status !== 'error' && (
        <p className="mt-3 text-sm text-muted-foreground">
          {preview.status === 'pending'
            ? 'Checking this edit with the server. Totals stay unconfirmed.'
            : preview.status === 'idle' && dirty
              ? 'Totals stay unconfirmed.'
              : 'The server has not priced this invoice yet.'}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`customer-${proposal.id}`}>Customer</Label>
          <Input
            id={`customer-${proposal.id}`}
            value={draft.customerName}
            aria-invalid={Boolean(customerError)}
            aria-describedby={customerError ? `customer-error-${proposal.id}` : undefined}
            onChange={(event) => {
              const customerName = event.target.value;
              const restored = customerName === (proposal.customerName ?? '');
              onChange({ ...draft, customerName, customerId: restored ? proposal.customerId : null });
            }}
          />
          {needsCustomer && <p className="text-sm text-muted-foreground">Choose a customer from the suggestions before saving.</p>}
          {customerError && <p id={`customer-error-${proposal.id}`} className="text-sm text-destructive">{customerError}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`issue-${proposal.id}`}>Issue date</Label>
          <Input
            id={`issue-${proposal.id}`}
            type="date"
            value={draft.issueDate}
            aria-invalid={Boolean(issueError)}
            aria-describedby={issueError ? `issue-error-${proposal.id}` : undefined}
            onChange={(event) => onChange({ ...draft, issueDate: event.target.value })}
          />
          {issueError && <p id={`issue-error-${proposal.id}`} className="text-sm text-destructive">{issueError}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`due-${proposal.id}`}>Due date</Label>
          <Input
            id={`due-${proposal.id}`}
            type="date"
            value={draft.dueDate}
            aria-invalid={Boolean(dueError)}
            aria-describedby={dueError ? `due-error-${proposal.id}` : undefined}
            onChange={(event) => onChange({ ...draft, dueDate: event.target.value })}
          />
          {dueError && <p id={`due-error-${proposal.id}`} className="text-sm text-destructive">{dueError}</p>}
        </div>
      </div>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium text-foreground">GST</legend>
        <div className="space-y-2">
          <Label htmlFor={`gst-rate-${proposal.id}`}>GST rate</Label>
          <Input
            id={`gst-rate-${proposal.id}`}
            inputMode="decimal"
            value={draft.taxRate}
            aria-invalid={Boolean(taxRateError)}
            aria-describedby={taxRateError ? `gst-rate-error-${proposal.id}` : undefined}
            onChange={(event) => onChange({ ...draft, taxRate: event.target.value })}
          />
          <p className="text-sm text-muted-foreground">Percent from 0 to 100. The server applies this rate.</p>
          {taxRateError && <p id={`gst-rate-error-${proposal.id}`} className="text-sm text-destructive">{taxRateError}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={`gst-${proposal.id}`}
              checked={draft.taxInclusive === true}
              onChange={() => onChange({ ...draft, taxInclusive: true })}
            />
            Included in the price
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={`gst-${proposal.id}`}
              checked={draft.taxInclusive === false}
              onChange={() => onChange({ ...draft, taxInclusive: false })}
            />
            Added on top
          </label>
        </div>
        {taxTreatmentError && <p className="text-sm text-destructive">{taxTreatmentError}</p>}
      </fieldset>

      <div className="mt-4 space-y-4">
        {draft.lines.map((line, index) => {
          const serverLine = preview.status === 'ready' ? preview.preview.lines[index] : undefined;
          const descriptionError = fieldMessage(preview, `lines.${index}.description`);
          const quantityError = fieldMessage(preview, `lines.${index}.quantity`);
          const rateError = fieldMessage(preview, `lines.${index}.rate`);
          const itemError = fieldMessage(preview, `lines.${index}.itemId`);
          return (
            <div key={`${proposal.id}-${index}`} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor={`desc-${proposal.id}-${index}`}>{lineLabel(line.description, 'Description')}</Label>
                <Input
                  id={`desc-${proposal.id}-${index}`}
                  value={line.description}
                  aria-invalid={Boolean(descriptionError)}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                />
                {descriptionError && <p className="text-sm text-destructive">{descriptionError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`qty-${proposal.id}-${index}`}>{lineLabel(line.description, 'Quantity')}</Label>
                <Input
                  id={`qty-${proposal.id}-${index}`}
                  inputMode="decimal"
                  value={line.quantity}
                  aria-invalid={Boolean(quantityError)}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                />
                {quantityError && <p className="text-sm text-destructive">{quantityError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`rate-${proposal.id}-${index}`}>{lineLabel(line.description, 'Rate')}</Label>
                <Input
                  id={`rate-${proposal.id}-${index}`}
                  inputMode="decimal"
                  value={line.rate}
                  aria-invalid={Boolean(rateError)}
                  onChange={(event) => updateLine(index, { rate: event.target.value })}
                />
                {rateError && <p className="text-sm text-destructive">{rateError}</p>}
              </div>
              <div className="self-end space-y-1">
                <p className="text-sm text-muted-foreground">{line.unit ? `Unit ${line.unit}` : 'No unit'}</p>
                {priced && serverLine?.total ? <p className="text-sm font-medium tabular-nums text-foreground">Line total {moneyText(serverLine.total, proposal.currency)}</p> : null}
                {itemError && <p className="text-sm text-destructive">{itemError}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor={`notes-${proposal.id}`}>Notes</Label>
        <textarea
          id={`notes-${proposal.id}`}
          value={draft.notes}
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
          className="flex min-h-20 w-full rounded-xl border border-transparent bg-muted/80 px-3.5 py-2 text-base text-foreground focus-visible:border-primary/35 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {otherErrors.map((error) => (
        <p key={error.field} className="mt-3 text-sm text-destructive">{error.message}</p>
      ))}

      {priced && (
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-medium tabular-nums text-foreground">{moneyText(priced.subtotal, proposal.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">GST</dt>
            <dd className="font-medium tabular-nums text-foreground">{moneyText(priced.taxAmount, proposal.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums text-foreground">{moneyText(priced.total, proposal.currency)}</dd>
          </div>
        </dl>
      )}

      <div className="mt-5">
        <Button type="button" onClick={onSave} disabled={saving || !saveAllowed}>
          {saving ? 'Saving draft' : 'Save draft'}
        </Button>
      </div>
    </section>
  );
}

function pricedTotals(
  preview: ProposalPreviewState,
  proposal: AssistantProposal,
  dirty: boolean,
): { subtotal: string; taxAmount: string; total: string } | null {
  if (preview.status === 'ready') {
    const { subtotal, taxAmount, total } = preview.preview;
    if (subtotal != null && taxAmount != null && total != null) return { subtotal, taxAmount, total };
    return null;
  }
  const stored = proposal.totals;
  if (preview.status === 'idle' && !dirty && stored?.subtotal && stored.taxAmount && stored.total) {
    return { subtotal: stored.subtotal, taxAmount: stored.taxAmount, total: stored.total };
  }
  return null;
}
