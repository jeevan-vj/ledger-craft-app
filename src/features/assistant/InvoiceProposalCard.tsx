import type { AssistantProposal } from '@ledgercraft/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canSaveDraft, customerNeedsPick, proposalIsDirty, type ProposalDraft } from './assistantDraft';

type InvoiceProposalCardProps = {
  proposal: AssistantProposal;
  draft: ProposalDraft;
  saving: boolean;
  onChange: (draft: ProposalDraft) => void;
  onSave: () => void;
};

function lineLabel(description: string, field: string) {
  return `${field} for ${description || 'line'}`;
}

export function InvoiceProposalCard({ proposal, draft, saving, onChange, onSave }: InvoiceProposalCardProps) {
  const dirty = proposalIsDirty(proposal, draft);
  const incomplete = proposal.totals == null || dirty;
  const needsCustomer = customerNeedsPick(proposal, draft);
  const saveAllowed = canSaveDraft(proposal, draft);

  const updateLine = (index: number, patch: Partial<ProposalDraft['lines'][number]>) => {
    onChange({
      ...draft,
      lines: draft.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    });
  };

  return (
    <section className="rounded-2xl bg-card p-4 text-card-foreground shadow-surface sm:p-6" aria-label="Invoice proposal">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Invoice proposal</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nothing is saved until you tap Save draft.</p>
        </div>
        <p className="text-sm font-medium text-foreground">{incomplete ? (proposal.totals == null && !dirty ? 'Incomplete' : 'Unconfirmed') : 'Priced by the server'}</p>
      </div>

      {incomplete && (
        <p className="mt-3 text-sm text-muted-foreground">
          {proposal.totals == null && !dirty
            ? 'The server has not priced this invoice yet.'
            : 'Save draft to revalidate this edit on the server. Totals are not calculated in the browser.'}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`customer-${proposal.id}`}>Customer</Label>
          <Input
            id={`customer-${proposal.id}`}
            value={draft.customerName}
            onChange={(event) => {
              const customerName = event.target.value;
              const restored = customerName === (proposal.customerName ?? '');
              onChange({ ...draft, customerName, customerId: restored ? proposal.customerId : null });
            }}
          />
          {needsCustomer && <p className="text-sm text-muted-foreground">Choose a customer from the suggestions before saving.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`due-${proposal.id}`}>Due date</Label>
          <Input id={`due-${proposal.id}`} type="date" value={draft.dueDate} onChange={(event) => onChange({ ...draft, dueDate: event.target.value })} />
          <p className="text-sm text-muted-foreground">Issue date <time dateTime={proposal.date}>{proposal.date}</time></p>
        </div>
      </div>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium text-foreground">GST</legend>
        <p className="text-sm text-muted-foreground">Server rate {proposal.taxRate}%</p>
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
      </fieldset>

      <div className="mt-4 space-y-4">
        {draft.lines.map((line, index) => (
          <div key={`${proposal.id}-${index}`} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor={`desc-${proposal.id}-${index}`}>{lineLabel(line.description, 'Description')}</Label>
              <Input
                id={`desc-${proposal.id}-${index}`}
                value={line.description}
                onChange={(event) => updateLine(index, { description: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`qty-${proposal.id}-${index}`}>{lineLabel(line.description, 'Quantity')}</Label>
              <Input
                id={`qty-${proposal.id}-${index}`}
                inputMode="decimal"
                value={line.quantity}
                onChange={(event) => updateLine(index, { quantity: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`rate-${proposal.id}-${index}`}>{lineLabel(line.description, 'Rate')}</Label>
              <Input
                id={`rate-${proposal.id}-${index}`}
                inputMode="decimal"
                value={line.rate}
                onChange={(event) => updateLine(index, { rate: event.target.value })}
              />
            </div>
            <p className="self-end text-sm text-muted-foreground">{line.unit ? `Unit ${line.unit}` : 'No unit'}</p>
          </div>
        ))}
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

      {!incomplete && proposal.totals && (
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-medium tabular-nums text-foreground">{proposal.totals.subtotal} {proposal.currency}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">GST</dt>
            <dd className="font-medium tabular-nums text-foreground">{proposal.totals.taxAmount} {proposal.currency}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums text-foreground">{proposal.totals.total} {proposal.currency}</dd>
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
