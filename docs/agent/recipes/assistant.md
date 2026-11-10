# Assistant agent

P1 is the API in `api/src/modules/ai`. Web and mobile chat UI are later phases. Send is not offered.

## Request path

`POST /api/ai/assistant` is the turn. `POST /api/ai/assistant/drafts` is the only save. `POST /api/ai/assistant/proposals/:id/preview` reprices the same edits and writes nothing. All three require the session organisation. The body cannot choose an organisation.

The turn is capped at 4 model steps and 30 seconds. A runtime `timeoutMs` below 30 seconds is the budget that runs, including the live eval. Anything above 30 seconds is capped there, inside a Worker request. Tool arguments are Zod-parsed. Allowed tools are `search_customers`, `search_catalogue`, `prepare_invoice_proposal`, and `list_outstanding`. Any other tool name is refused and answered with a link to Invoices or Expenses.

A repeated call with the same tool and arguments returns the earlier result with a note and ends the turn. The reply keeps one copy of each part.

`prepare_invoice_proposal` returns a proposal and does not insert an invoice. The proposal row is stored in `assistant_proposals` (`0038_assistant-proposals.sql`), which the conversation API cannot write. Saving clears the payload and keeps the id, organisation, saved invoice id, and signature. The 90-day purge and deleting the conversation remove the row. Save or preview of a removed proposal is `404` with `That proposal is not in this business.` A proposal owned by another business returns that same not-found error.

Save and preview read that row and price it with one function, `priceAssistantDraft`. Preview returns the result and does not insert an invoice, event, or proposal change. Save calls `createInvoiceInTx` with `status: 'draft'`. Both use `computeInvoiceTotals` at the document currency's precision. Totals stay null until every line has a rate and GST treatment is set. An edited rate is kept. A second save of the same proposal returns the original draft. The same `Idempotency-Key` with a different body is `409 IDEMPOTENCY_CONFLICT`.

`saveAssistantDraftEditsSchema` is the edit object for both calls. `issueDate` maps to the invoice `date`. `taxRate` is the document GST percent. A line `taxRate` sets that line's `taxes` entry and overrides the document rate. Omit any of them and the stored proposal value is used. Rates must be from 0 to 100, using the invoice line tax rule. Dates are real `YYYY-MM-DD` days. A due date before the issue date is rejected: preview returns `errors: [{ field: 'dueDate', message: "Due date can't be before the invoice date" }]` and still includes totals when the money fields are complete; save returns `400 VALIDATION_ERROR` and writes nothing. A missing customer, price, due date, or GST treatment is `422 PROPOSAL_INCOMPLETE` on save. Preview returns those as `errors` and null totals.

The preview response is `previewAssistantProposalResponseSchema`: `date`, `dueDate`, `taxInclusive`, `taxRate`, per-line `quantity`, `rate`, `taxRate`, `tax`, and `total`, plus `subtotal`, `taxAmount`, `total`, and `errors`. It does not accept a client total. Preview is limited to 60 requests a minute per business per process (`ASSISTANT_PREVIEW_PER_MINUTE`), counted in memory so it needs no migration, and it does not increment the 100-message daily quota. Over the preview limit is `429 ASSISTANT_PREVIEW_LIMIT`. The assistant capability gate still applies. A malformed date or a GST rate outside 0–100 is `400 VALIDATION_ERROR` and the message names the field.

## What is sent to Workers AI

The system instruction, the current user message, tool definitions, and tool results. Tool results are ids, names, saved prices, and outstanding totals. They omit email, phone, address, and notes. The default model is `@cf/google/gemma-4-26b-a4b-it` (`ASSISTANT_WORKERS_AI_MODEL`).

## What is stored

Chat text is a conversation with `context.kind = assistant`. The user can delete it with `DELETE /api/conversations/:id`. Messages older than 90 days (`ASSISTANT_RETENTION_DAYS`) are removed on the next turn. Raw prompts are not written to request logs.

`assistant_events` (migration `0037_assistant-events.sql`) stores actor, organisation, request id, action, outcome, tool names, confirmation, draft id, token counts, and a decimal cost. It does not store prompts, customer names, or notes. Deleting a conversation does not reset the usage counters in this table.

## Limits and the flag

Per business, from the environment, defaulting to 100 messages/day, 20/minute, and USD 2.00/day (`ASSISTANT_DAILY_MESSAGES`, `ASSISTANT_PER_MINUTE`, `ASSISTANT_DAILY_COST_USD`, token prices `ASSISTANT_INPUT_USD_PER_MILLION` default `0.10` and `ASSISTANT_OUTPUT_USD_PER_MILLION` default `0.30`). Each turn reserves `ASSISTANT_CALL_RESERVE_USD` (default `0.05`) before the provider call. A timeout keeps that reserve. A request that would cross the ceiling returns `429 ASSISTANT_LIMIT` and does not call the model.

`/api/healthz` reports `capabilities.assistant`. The route runs only when that capability is `available`. `ASSISTANT_ENABLED=1` does not override an unavailable capability. On the Worker the capability is available only when that variable is set and the AI binding is present. Generic `capabilities.ai` does not enable tools. Receipt scan keeps using its own scanner.

## Expenses

There is no expense draft status. `createExpenseInTx` inserts a real expense and posts a journal when the status is approved. Pending is still a saved expense. The assistant does not call it. A message that records an expense, such as adding a fuel expense, is refused with a link to Expenses before the model runs. That uses an add, record, log, track, create, or new verb, or treats expense as the thing being recorded. An invoice, quote, estimate, or bill request still reaches the model when it mentions expenses. A tool name containing `expense` is refused the same way.

## Evals

CI runs `api/src/modules/ai/assistant.eval.test.ts` with a scripted model. It does not call Workers AI. The live script is `pnpm --filter @ledgercraft/api eval:assistant:live`. It sets a 30 second turn budget and exits 2, before any provider call, when `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` is missing.

The live pricing prompts (`sarah-missing-parts`, `gst-inclusive`, `gst-exclusive`, `friday-dateline`), both injection prompts, and `ambiguous-item` name Sarah Chen. `ambiguous-customer` still says Sarah. `ambiguous-item` expects an item quick pick. `gst-inclusive` still expects tax rate 15 and totals 260.87 / 39.13 / 300.00. `gst-exclusive` still expects 300.00 / 45.00 / 345.00. `friday-dateline` still fixes the clock at 2026-11-13T11:30:00.000Z and expects issue date 2026-11-14 and due date 2026-11-20. `sarah-missing-parts` still expects a proposal with null totals. An injection reply that stops on a customer quick pick fails, so those cases still have to get past disambiguation.

`sarah-pick-then-price` is live only. It posts `Invoice Sarah for 3 hours at $100 plus GST, due 2026-11-13`, expects customer quick picks for Sarah Chen and Sarah Jones, then posts `Use customer Sarah Chen: 3 hours at $100 plus GST` on that same conversation. The assistant loop sends only the current message. Replaying earlier turns is a separate product fix, so the follow-up repeats the quantity, rate, and plus-GST treatment. The expected totals are 300.00 / 45.00 / 345.00 at tax rate 15.
