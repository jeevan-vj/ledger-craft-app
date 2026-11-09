# Assistant agent

P1 is the API in `api/src/modules/ai`. Web and mobile chat UI are later phases. Send is not offered.

## Request path

`POST /api/ai/assistant` is the turn. `POST /api/ai/assistant/drafts` is the only save. Both require the session organisation. The body cannot choose an organisation.

The turn is capped at 6 model steps and 8 seconds. Tool arguments are Zod-parsed. Allowed tools are `search_customers`, `search_catalogue`, `prepare_invoice_proposal`, and `list_outstanding`. Any other tool name is refused and answered with a link to Invoices or Expenses.

`prepare_invoice_proposal` returns a proposal and does not insert an invoice. The proposal row is stored in `assistant_proposals` (`0038_assistant-proposals.sql`), which the conversation API cannot write. Save reads that row, applies edits, and calls `createInvoiceInTx` with `status: 'draft'`. Totals stay null until every line has a rate and GST treatment is set. Totals use `computeInvoiceTotals` at the document currency's precision. An edited rate is kept. A second save of the same proposal returns the original draft. The same `Idempotency-Key` with a different body is `409 IDEMPOTENCY_CONFLICT`.

## What is sent to Workers AI

The system instruction, the current user message, tool definitions, and tool results. Tool results are ids, names, saved prices, and outstanding totals. They omit email, phone, address, and notes. The default model is `@cf/google/gemma-4-26b-a4b-it` (`ASSISTANT_WORKERS_AI_MODEL`).

## What is stored

Chat text is a conversation with `context.kind = assistant`. The user can delete it with `DELETE /api/conversations/:id`. Messages older than 90 days (`ASSISTANT_RETENTION_DAYS`) are removed on the next turn. Raw prompts are not written to request logs.

`assistant_events` (migration `0037_assistant-events.sql`) stores actor, organisation, request id, action, outcome, tool names, confirmation, draft id, token counts, and a decimal cost. It does not store prompts, customer names, or notes. Deleting a conversation does not reset the usage counters in this table.

## Limits and the flag

Per business, from the environment, defaulting to 100 messages/day, 20/minute, and USD 2.00/day (`ASSISTANT_DAILY_MESSAGES`, `ASSISTANT_PER_MINUTE`, `ASSISTANT_DAILY_COST_USD`, token prices `ASSISTANT_INPUT_USD_PER_MILLION` default `0.10` and `ASSISTANT_OUTPUT_USD_PER_MILLION` default `0.30`). Each turn reserves `ASSISTANT_CALL_RESERVE_USD` (default `0.05`) before the provider call. A timeout keeps that reserve. A request that would cross the ceiling returns `429 ASSISTANT_LIMIT` and does not call the model.

`/api/healthz` reports `capabilities.assistant`. The route runs only when that capability is `available`. `ASSISTANT_ENABLED=1` does not override an unavailable capability. On the Worker the capability is available only when that variable is set and the AI binding is present. Generic `capabilities.ai` does not enable tools. Receipt scan keeps using its own scanner.

## Expenses

There is no expense draft status. `createExpenseInTx` inserts a real expense and posts a journal when the status is approved. Pending is still a saved expense. The assistant does not call it. A fuel request is refused with a link to Expenses.

## Evals

CI runs `api/src/modules/ai/assistant.eval.test.ts` with a scripted model. The live script is `pnpm --filter @ledgercraft/api eval:assistant:live`.
