# Independent second-month and year-end review

Provisional review against base `8f6bb68`; fixed implementation/evidence head is not yet recorded. No merge recommendation or hosted-CI claim. The reviewer did not write the source/tests/drivers or expected working paper and has not approved, pushed or merged anything.

## Scope and evidence checked

- Read the repository reviewer, verification and accounting-invariant instructions and `docs/PIPELINE.md`.
- Confirmed frozen independent paper SHA-256 `44569ca2371a1e2495eb966f1f7a6f400dde48b805d865aa56aabca80b9f409e`.
- Independently summed every prescribed November and April journal with Python Decimal, starting from the frozen October role balances. Every journal balances; all nine raw closing roles and TB totals reconcile. November economic turnover is4,140 each side, closing TB14,370; April economic turnover575, closing TB14,715. Import/match turnover is separate from economic activity and must net to zero.
- Independently checked November assets12,670 = liabilities770 + equity11,900 and April assets12,915 = liabilities915 + equity12,000. November profit400, March financial-year profit1,900 and April profit100 follow the prescribed revenues/costs. Equity retains prior earnings1,900 exactly once plus April100; no synthetic nominal-account closing journal is necessary for this dated-report design.
- Reviewed the real HTTP/SQLite scenario and helper: later October settlements, half-paid November invoice, unpaid-balance credit, partially paid bill, paid expense, actual imports/matches and period closes use application routes. The only shared helper change is an optional HTTP idempotency-key argument, preserving default behavior.
- Overpayment400 is checked against complete unchanged payment/journal lists. An accepted receipt replay returns the original body and unchanged journal list; a changed-body retry rejects409. October sections/journal rows/GST fingerprint, November sections and prior-financial-year sections are compared after later events. Monthly/quarterly accrual and annual cash comparisons assert business figures.
- Current API results agree with frozen November/April controls. Registered invoice-basis GST is tested; payments/hybrid analytical expectations are not misrepresented as registered-basis UI acceptance.

No production accounting defect or production/schema/contract change has been found in the reviewed diff. This is verification work, so no invented failing production test or unnecessary code patch is required.

## Pending final review gates

Actual web/mobile walkthroughs, downloaded PDFs/CSVs/ZIP member checks, the zero-activity year-end and April bank proofs, full command results, final docs/risk/diff size and immutable head remain to be checked before a final verdict. Installed Android/iOS share-sheet, lifecycle, keyboard and native date-picker acceptance remains a separate device gate; Expo web evidence does not establish installed-device behavior.

## Additional provisional checks

The independent supplement (`d56efc7db7d26a37b076f41f70b08a8a12827bd013a91b654ead1be66c2f6ca5`) reconciles year-end ledger cash0 +13,795 −1,840 =11,955, with supported operating net1,955. Its September30 initial-equity10,000 is an imported opening component, not proof of an actual capital cash contribution during April–September. The complete prescribed cash history begins October1 with opening10,000. Fiscal-year cash-flow and bank-coverage limitations must remain explicit, including the archive warning for missing pre-October statements.

The four nil-GST periods (`5516099a1b4e051f31face0842dc615a328fc9301be69864fed5e206f68b4012`) independently follow the express absence of December–March transactions. Draft preparation is not a filing. The web's reviewed owner reopen/reclose to prepare those drafts preserves the existing policy; mobile prepares them before its initial March close. Neither path may alter financial sections.

Full API output now records144suites/626tests passing. Final command metadata/artifacts and immutable head remain pending.

## Web artifact review

The actual web gallery and `web/verification.json` now record22UI phases. I independently opened all3 downloaded ZIPs: each has14members and all13member SHA-256/byte-length checks pass. November/March/April TB, profit and equity match the frozen paper. I independently summed all9account roles in each period from the downloaded raw GL plus prescribed opening balances (27role checks); technical Other Income nets to zero. The year-end archive includes all4retained nil-GST drafts, each still draft and net0. Its period cutoff is March31 revision7 after the audited reopen/reclose. The April archive correctly retains a working-pack warning because April's fiscal period is not closed, and all packs retain no-filed-confirmation warnings. The full-year missing pre-October bank history warning is preserved.

I inspected the actual April balance-sheet screenshot and exported CSV. Equity12,000 is numerically correct, including capital10,000 plus retained/current cumulative profit2,000. The UI account table displays capital10,000 without an explicit accumulated-earnings bridge, while PDF/CSV label the aggregate total `Equity (includes retained income)`. This is a nonblocking presentation follow-up for the declared rollover-verification scope, not an arithmetic defect: the reports and raw ledger prove prior1,900 plus current100 exactly once. Evidence must not claim the UI provides a separate retained/current earnings breakdown or a fully footed equity presentation. A future enhancement should expose the bridge canonically from the server and reuse it across clients/exports, rather than add client-calculated money.

## Equity bridge delta pending

The builder elected to address the presentation gap in this authorized scope. The proposed bridge exposes the existing canonical accumulated-income result as an optional contract field and labels it `Accumulated earnings (included in equity)` across clients/exports. The preceding nonblocking-follow-up assessment describes the pre-fix artifact; it is not the final implementation verdict. The delta still requires independent source/test-first review and regenerated report artifacts on the final production source. It must not create a fictitious posted account, a new money formula, a second addition to inclusive equity or an unsupported prior/current split.

## Earnings bridge source and mobile reproof

The bridge delta is now implemented. I reviewed the actual diff: the response schema adds optional exact-money `balanceSheet.accumulatedEarnings`, so older reports remain accepted. The API serializes the **existing** cumulative-income value already included in equity; the equity formula, journals, posted amounts and account rows are unchanged. Both clients conditionally display that server value and explicitly say `included in equity`; neither subtracts, sums or derives money. The shared export rows carry the same canonical amount into PDF/CSV. No synthetic ledger account or unsupported prior/current split is introduced.

Reviewed red evidence shows the contract dropping the absent field/export row (2failures) and the real HTTP/SQLite scenario missing the API disclosure (1failure) before implementation. Positive, negative and legacy-omission contract/UI assertions are meaningful; web also tests zero. Large exact decimal export coverage proves the shared row does not float-convert the canonical string.

I independently re-opened the final mobile November/year-end/April archives: all39member checksums and lengths pass, and their canonical earnings are1,900/1,900/2,000 with unchanged equity11,900/11,900/12,000. The actual downloaded balance-sheet CSVs and text extracted from all3 PDFs carry the bridge label and exact amounts. The refreshed actual April Expo screenshot shows earnings2,000 explicitly within equity12,000. This resolves the pre-fix presentation gap described above. Final full gates, refreshed web artifacts and immutable-head review remain pending; the change should conservatively be classified as high risk because it affects production accounting-report output/contracts, even though its money calculation is reused unchanged.
