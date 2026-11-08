# Independent accountant/source review

Status: provisional source and retained API artifact review; not final approval. Reviewed the working tree against `0a35c75` on `codex/self-service-month-close`. Production was still changing during this review. Final immutable head, complete CI gates and actual UI evidence remain the parent's final acceptance responsibilities. Native installed-device acceptance remains pending unless separately evidenced.

## Independent expectation and retained artifact

The expected October case was prescribed before application lookup in `docs/evidence/full-month-close/expected.json` (SHA256 `c581c7343a971e4844971a5885d601a4c70308fc66ed423e53f9e388a05b3739`). I independently opened `close-pack-api/api-example.zip` using Python zipfile/json/hashlib, verified all 13 declared content hashes and byte lengths against the 14-member ZIP, and read the exported CSVs and GST JSON.

| Measure | Independently expected | Retained ZIP actual |
| --- | --- | --- |
| Trial balance closing debit/credit | 13,680 / 13,680 | 13,680 / 13,680 |
| Period debit/credit turnover | 14,605 / 14,605 | 14,605 / 14,605 |
| Balance sheet | 12,480 = 980 + 11,500 | 12,480 = 980 + 11,500 |
| Revenue / costs / profit | 2,700 / 1,200 / 1,500 | 2,700 / 1,200 / 1,500 |
| Opening / movement / closing cash | 10,000 / 1,380 / 11,380 | 10,000 / 1,380 / 11,380 |
| Current receivables / payables | 920 / 575 | 920 / 575 |
| Aging unallocated controls | 0 / 0 | 0 / 0 |
| Bank reconciliation | Five matches, difference 0 | Five matches, completed, difference 0 |
| Invoice-basis GST | 405 − 180 = 225 | 405 − 180 = 225 |

The artifact warns that retained drafts/preparation are not an IRD filing. Its accounting cutoff is 2026-10-31, revision 1. These are API acceptance results, not evidence of browser or installed mobile execution.

## Guard coverage reviewed

- Shared posting and reversal helpers check the accounting cutoff alongside existing completed-bank locks. Already posted invoice journals return before attempting a new posting, allowing November settlements of genuinely posted October invoices.
- Invoice creation/edit/cancel/restore; receipts and reversals; bill creation/edit/receive/void; supplier payments and reversals; expenses; credits/refunds; journals/openings; bank financial metadata and allocations; GST configuration/draft changes; currency/FY configuration are covered by central or explicit guards. Notes-only edits remain available.
- Recurring invoice/bill generation and quote conversion use canonical guarded creation. Import commit and direct invoice journal paths required additional explicit guards (below).
- Account classification/code/currency/opening changes affecting posted closed history are blocked; unused future accounts can be established. Bank-ledger linking creates metadata only and must not repost opening money.
- Close/reopen uses authenticated organisation context, optimistic revision, reviewed reason and append-only audit events. Reopen is owner/admin controlled. Expected-company headers are concurrency assertions, not authority for ownership.
- The close pack uses one organisation transaction, canonical financial/ledger/GST functions, full-company accrual scope, both report and banking permissions, fixed archive paths, CSV escaping, explicit preparation warnings and retained original GST snapshots. ZIP construction/checksums follow the read snapshot. It does not post or file anything.

## Findings and follow-up

1. Direct invoice journal posting bypassed the cutoff when an old draft was paid or completed later. Reported to period specialist; authentic red tests and helper guards added. Source delta reviewed: guard follows the existing journal replay lookup and precedes insertion. All three direct invoice journal helpers now guard actual writes.
2. Purchase import commit inserted old bills without canonical creation guard. Reported and fixed with explicit issue-date guard; specialist reported authentic red 201 versus expected 409.
3. Legacy bank-detail document allocation mutated balances under a closed cutoff. Reported and fixed for financial connections/splits; attachments-only metadata stays available. Specialist reported authentic red 200 versus expected 409.
4. Chart creation needed lost-response retry safety and duplicate account-code handling. Parent owns existing-idempotency-table support and uniqueness checks; mobile owns stable scoped pending request reuse. Final delta/evidence review pending.
5. Mobile ZIP download needed report-plus-bank permission gating and explicit full-company accrual scope despite active cash/party filters. Mobile specialist owns fix and component evidence; final review pending.
6. Explicit credit/refund reversal replay currently checks closed cutoff before its already-reversed exact-date/reason return. This rejects harmless accepted-request retries after month close. Specialist has two authentic red tests running and will move the guard after exact replay; different-body retries must remain 409 and produce no journal changes. Same principle is being applied to existing invoice/bill natural no-op branches. Final source reinspection confirms exact replay now precedes the cutoff guard in both credit and refund reversal paths, retaining different-details conflicts. Specialist reports authentic red tests followed by green regression. The journal same-status path now returns without metadata writes. A further paid-invoice email completion defect was fixed: every non-draft delivery completion returns its existing status; drafts still pass guarded posting. Final full-suite evidence remains pending.

No final PASS is asserted by this provisional record. Financial/schema changes require human review; no merge approval was performed.

## Account deletion follow-up (source-only)

The new event actor FK introduces a concrete local Node deletion coupling: an accountant who only closes another owner's books has no prior financial rows, but their retained audit event references users with NO ACTION. Local SQLite enables foreign keys; account deletion leaves non-owned organisations intact and unconditionally deletes the identity user. There is no retained-user branch. Therefore deletion fails for this newly affected user class. Similar preexisting financial-row FKs do not handle this new actor-only case. Sole-owner organisation purge is safe. Reported to parent for a narrow real-SQLite regression and a solution retaining audit events without identity-deletion coupling; do not cascade-delete audit history. Worker identity/ledger separation must be assessed independently.

## Final source/mobile delta review before commit freeze

No remaining blocking source finding is identified in the reviewed delta. This remains provisional until the immutable commit, web proof and parent full gates are checked.

- Actor-only identity deletion regression resolved by additive0036. Source review confirms it copies every event column unchanged, retains the organisation FK, action constraint and unique organisation/revision index, and removes only the users FK.0035 remains unchanged. Opaque immutable actor IDs survive identity deletion without retaining the deleted identity record. Reviewed real SQLite tests cover AccountDeletionService on an actor-only accountant and an existing0035→0036 copy preserving event, cutoff and invoice rows plus remaining constraints.
- Generic account creation now checks scoped idempotency before duplicate code detection, returns the currently owned account on replay, rejects replay after removal, and normalises codes before checking. Mobile persists the original request body/key under user and company scope, locks fields on uncertain responses, and reuses the pending request after remount. The bank link remains metadata-only. No opening amount is posted by chart setup.
- Mobile pack UI now requires both banking and reporting read permissions and explicitly explains full-company accrual scope regardless of cash or party filters. Examined actual chart-classification and successful pack screenshots, period-proof JSON and evidence README. The close/reopen/reclose history is revisions1/2/3; the rejected October journal reports409 and unchanged journals/financial sections.
- Independently opened the actual mobile UI-downloaded ZIP, verified all13 SHA256 hashes and byte sizes across14 members, and read all six financial CSVs plus GST. TB13680 each, turnover14605 each, assets12480=liabilities980+equity11500, profit1500, cash11380/net1380, current AR920/AP575 with zero unallocated controls, and GST225 all match the independent paper. ZIP cutoff is2026-10-31 revision3.
- Mobile evidence explicitly states Expo web at390×844,150 Jest suites/674 tests, type/lint checks and both native bundles; no installed iOS/Android runtime acceptance is claimed. I did not rerun the full suite; parent is running final gates. Native share-sheet/lifecycle/keyboard/date-picker device acceptance remains an explicit limitation, not a completed check.

## Worker integration and web artifact follow-up

Reviewed the Durable Object migration execution fix: only generated Drizzle breakpoint markers are removed at execution, while original migration source/checksum checks, recovery bookmarks and transaction handling remain intact. This avoids the actual Worker rejection of a trailing comment-only SQL segment. The helper does not split SQL or rewrite executable schema. Reviewed the two regression tests (marker preservation in immutable source; full real-SQLite migration sequence and FK integrity). Actual Durable Object probe evidence is owned by parent/specialist; final Worker flow is still running.

Read final web evidence README and independently verified the actual web UI-downloaded ZIP:14members, all13hashes/lengths, cutoff2026-10-31 revision3. Every financial CSV and GST225 matches the frozen paper and independent mobile archive: TB13680/turnover14605 per side, assets12480=980+11500, profit1500, cash11380/net1380 and current AR920/AP575 with zero unallocated controls. Web evidence carefully distinguishes ten actual UI phases from broad API mutation coverage. No additional blocking finding from these deltas. Immutable-head/full-gate review remains pending.
