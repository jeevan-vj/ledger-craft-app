# Workers AI scanner: evidence

All data here is synthetic. The org is "Crystal Touch Cleaning". The invoices are generated test images marked "SYNTHETIC TEST DOCUMENT".

## Screenshots (real browser, local dev, fake AI binding)

| File | What it shows |
| --- | --- |
| `01-review-workers-ai-label.png` | Import from file → Review extraction for `inv1-kiwi-supplies.png`, with the banner "Scanned with Cloudflare Workers AI, check carefully" |
| `02-review-workers-ai-label-closeup.png` | Close-up of the review panel and banner |

To reproduce, run `bash scripts/workers-ai-demo.sh`. It starts the local API with `INVOICE_IMPORT_AI_PROVIDER=workers-ai` and `WORKERS_AI_FAKE=1`, starts the web dev server, signs up a throwaway local user, uploads the invoice and captures the screenshots with `scripts/workers-ai-screens.mjs` (Playwright Chromium). The script then stops the servers and deletes the temporary data.

Limits of this setup:
- The fake binding returns canned extraction values, so the fields in the review panel don't match the image. The screenshots only show the provider wiring and the label.
- `WORKERS_AI_FAKE` is ignored when `NODE_ENV=production`.
- In the Node demo, `/api/healthz` reports `ai: unavailable` because there is no real `env.AI` binding. On the deployed Worker the binding is present and healthz reports `available`. Unit tests cover both cases.

## Real Workers AI (model-level probe only)

`probe-worker/` is a throwaway Worker that I ran only with local `wrangler dev`, never deployed. The AI binding always runs remotely, so this called the real model. It sent the same JSON prompt as the app to three synthetic invoices (`fixtures/`) and checked 8 fields per invoice. Raw output is in `real-model-probe-results.json`.

| Model | Fields correct | Latency | Neurons / scan |
| --- | --- | --- | --- |
| `@cf/meta/llama-4-scout-17b-16e-instruct` (default) | 8/8 on all 3 | ~5.1–5.9 s | ~64–67 |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 8/8 on all 3 | ~7.2–9.2 s | higher |
| `@cf/meta/llama-3.2-11b-vision-instruct` | error 5016: needs a one-time licence acceptance (not accepted on Jeevan's behalf) | – | – |

Cost: the free tier gives 10,000 neurons/day, about 150 scans, and resets at 00:00 UTC. Paid usage is $0.011 per 1,000 neurons, about $0.0007 per scan. When the quota runs out the API returns 429. When the model is unavailable it returns 503. It never falls back to mock silently.

The app was not run end-to-end against the real model. The full pipeline (upload → extract → review) was exercised only through the fake binding.

## Bug found while doing this

Migration `0019` put a CHECK on `import_documents.extraction_provider` that allowed only `openai`/`xai`/`mock`, so saving a Workers AI extraction failed with a 500. Migration `0020_workers-ai-extraction-provider.sql` rebuilds the column to also allow `workers-ai` and keeps existing values.
