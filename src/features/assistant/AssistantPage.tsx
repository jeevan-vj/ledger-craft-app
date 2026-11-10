import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AssistantPart, AssistantProposal } from '@ledgercraft/contracts';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { AssistantApiError, askAssistant, saveAssistantDraft } from './assistantApi';
import { canSaveDraft, draftFromProposal, editsForSave, type ProposalDraft } from './assistantDraft';
import { InvoiceProposalCard } from './InvoiceProposalCard';
import { useAssistantCapability } from './useAssistantCapability';

type TranscriptItem =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; parts: AssistantPart[] };

function FormLink() {
  return <Link className="font-medium text-foreground underline underline-offset-4" to="/invoices/new">Open the invoice form</Link>;
}

function AssistantFallback() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Assistant is off" description="The assistant is not available for this business. Invoices, expenses, and the other forms still work." />
      <p className="text-sm text-muted-foreground">
        <FormLink />
        {' '}or go to <Link className="font-medium text-foreground underline underline-offset-4" to="/expenses">Expenses</Link>.
      </p>
    </div>
  );
}

function AssistantParts({
  parts,
  drafts,
  savingId,
  conversationId,
  onDraft,
  onSave,
  onPick,
}: {
  parts: AssistantPart[];
  drafts: Record<string, ProposalDraft>;
  savingId: string | null;
  conversationId?: string;
  onDraft: (proposal: AssistantProposal, draft: ProposalDraft) => void;
  onSave: (proposal: AssistantProposal) => void;
  onPick: (field: 'customerId' | 'itemId', option: { id: string; label: string }) => void;
}) {
  return (
    <div className="space-y-4">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <p key={`text-${index}`} className="max-w-[65ch] whitespace-pre-wrap text-base text-foreground">{part.text}</p>;
        }
        if (part.type === 'link') {
          return (
            <p key={`link-${index}`}>
              <Link className="font-medium text-foreground underline underline-offset-4" to={part.href}>{part.label}</Link>
            </p>
          );
        }
        if (part.type === 'quick_picks') {
          return (
            <div key={`picks-${index}`} className="space-y-2" role="group" aria-label={part.prompt}>
              <p className="text-sm font-medium text-foreground">{part.prompt}</p>
              <div className="flex flex-wrap gap-2">
                {part.options.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    variant="outline"
                    onClick={() => onPick(part.field, { id: option.id, label: option.label })}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          );
        }
        const draft = drafts[part.proposal.id] ?? draftFromProposal(part.proposal);
        return (
          <InvoiceProposalCard
            key={part.proposal.id}
            proposal={part.proposal}
            draft={draft}
            conversationId={conversationId}
            saving={savingId === part.proposal.id}
            onChange={(next) => onDraft(part.proposal, next)}
            onSave={() => onSave(part.proposal)}
          />
        );
      })}
    </div>
  );
}

export function AssistantPage() {
  const capability = useAssistantCapability();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProposalDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const saveKeys = useRef(new Map<string, string>());
  const errorRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLDivElement>(null);
  const replyCount = items.filter((item) => item.role === 'assistant').length;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (replyCount > 0) replyRef.current?.focus();
  }, [replyCount]);

  if (capability.isPending) {
    return <p role="status" className="text-sm text-muted-foreground">Checking whether the assistant is available.</p>;
  }
  if (capability.data?.assistant !== 'available') return <AssistantFallback />;

  const ask = async () => {
    const text = message.trim();
    if (!text || pending || savingRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    setError(null);
    try {
      const response = await askAssistant({ conversationId, message: text }, controller.signal);
      setConversationId(response.conversationId);
      setDrafts((current) => {
        const next = { ...current };
        for (const part of response.parts) {
          if (part.type === 'proposal' && !next[part.proposal.id]) next[part.proposal.id] = draftFromProposal(part.proposal);
        }
        return next;
      });
      setItems((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', text },
        { id: crypto.randomUUID(), role: 'assistant', parts: response.parts },
      ]);
      setMessage('');
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return;
      setError(caught instanceof AssistantApiError ? caught.message : 'The assistant could not complete that. Nothing was saved.');
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  };

  const save = (proposal: AssistantProposal) => {
    if (savingRef.current || !conversationId) return;
    const draft = drafts[proposal.id] ?? draftFromProposal(proposal);
    if (!canSaveDraft(proposal, draft)) return;
    const body = {
      conversationId,
      proposalId: proposal.id,
      edits: editsForSave(proposal, draft),
    };
    const stamp = JSON.stringify(body);
    const idempotencyKey = saveKeys.current.get(stamp) ?? crypto.randomUUID();
    saveKeys.current.set(stamp, idempotencyKey);
    savingRef.current = true;
    setSavingId(proposal.id);
    setError(null);
    void saveAssistantDraft(body, idempotencyKey)
      .then((saved) => navigate(`/invoices/${saved.id}`))
      .catch((caught: unknown) => {
        setError(caught instanceof AssistantApiError ? caught.message : 'The draft was not saved.');
      })
      .finally(() => {
        savingRef.current = false;
        setSavingId(null);
      });
  };

  const onPick = (field: 'customerId' | 'itemId', option: { id: string; label: string }) => {
    let proposal: AssistantProposal | undefined;
    for (let index = items.length - 1; index >= 0 && !proposal; index -= 1) {
      const item = items[index];
      if (item.role !== 'assistant') continue;
      for (const part of item.parts) {
        if (part.type === 'proposal') proposal = part.proposal;
      }
    }
    if (proposal && field === 'customerId') {
      const current = drafts[proposal.id] ?? draftFromProposal(proposal);
      setDrafts((existing) => ({ ...existing, [proposal.id]: { ...current, customerId: option.id, customerName: option.label } }));
      return;
    }
    if (proposal && field === 'itemId') {
      const current = drafts[proposal.id] ?? draftFromProposal(proposal);
      const index = current.lines.findIndex((line) => line.itemId == null);
      const target = index === -1 ? 0 : index;
      setDrafts((existing) => ({
        ...existing,
        [proposal.id]: {
          ...current,
          lines: current.lines.map((line, lineIndex) => (lineIndex === target ? { ...line, itemId: option.id } : line)),
        },
      }));
      return;
    }
    setMessage(field === 'customerId' ? `Use customer ${option.label}` : `Use item ${option.label}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Assistant"
        description="Ask in plain language. Invoice totals come from the server, and nothing is saved until you tap Save draft."
      />
      <p className="text-sm text-muted-foreground">Prefer a form? <FormLink /></p>
      <div className="space-y-6">
        {items.map((item) => (
          <article
            key={item.id}
            ref={item.role === 'assistant' && item.id === items[items.length - 1]?.id ? replyRef : undefined}
            tabIndex={item.role === 'assistant' ? -1 : undefined}
            aria-label={item.role === 'assistant' ? 'Assistant reply' : undefined}
            className="space-y-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {item.role === 'user' ? (
              <p className="max-w-[65ch] text-base text-foreground"><span className="sr-only">You said: </span>{item.text}</p>
            ) : (
              <AssistantParts
                parts={item.parts}
                drafts={drafts}
                savingId={savingId}
                conversationId={conversationId}
                onDraft={(proposal, draft) => setDrafts((current) => ({ ...current, [proposal.id]: draft }))}
                onSave={save}
                onPick={onPick}
              />
            )}
          </article>
        ))}
      </div>
      {pending && <p role="status" className="text-sm font-medium text-foreground">Working on your request</p>}
      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-2xl bg-card p-4 text-card-foreground shadow-surface focus:outline-none focus:ring-2 focus:ring-ring">
          <p>{error}</p>
          <p className="mt-2"><FormLink /></p>
        </div>
      )}
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor="assistant-message" className="text-sm font-medium text-foreground">Message</label>
          <textarea
            id="assistant-message"
            name="message"
            value={message}
            disabled={pending}
            onChange={(event) => setMessage(event.target.value)}
            className="flex min-h-24 w-full rounded-xl border border-transparent bg-muted/80 px-3.5 py-2 text-base text-foreground focus-visible:border-primary/35 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
          />
        </div>
        <div className="flex gap-2">
          {pending ? (
            <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>Cancel</Button>
          ) : (
            <Button type="submit">Ask</Button>
          )}
        </div>
      </form>
    </div>
  );
}

export default AssistantPage;
