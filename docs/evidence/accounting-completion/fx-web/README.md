Real local HTTP/API and production-preview Chromium verification using isolated synthetic companies. AR remained at 1440×900; AP remained at 390×844 to preserve component state across review and submission. Fixtures are seeded through real APIs; reviewed revaluation and both settlement operations use actual web forms.

Run: `node scripts/accounting-completion-fx-web-proof.mjs` with preview localhost:8080 and API proxy available. `COMPLETION_FX_OUTPUT` overrides the output directory.

Expected and actual assertions passed for both USD100 source documents booked at NZD160: October31 reviewed rate1.70 produces NZD170 control/ageing and unrealized gain10 (AR) or loss10 (AP); November1 automatic reversal restores160; November2 reviewed settlement1.65 produces cash165, remaining control/ageing0 and realized gain5/loss5. Historical October31 ageing remains170 after settlement. Source base totals remain160. Posted/reversing journal IDs exist, exact revaluation replay reuses IDs, and pageerror collection is empty.

`results.json` contains expected values and actual API report/document/payment snapshots. Six numbered screenshots capture actual reviewed rate previews, posted audit trails and settlement forms. These are local Chromium desktop/phone viewport proofs, not native device or production data verification.
