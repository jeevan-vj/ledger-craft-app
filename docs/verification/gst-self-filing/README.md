# GST self-filing verification

Verified locally on 25 October 2026 against an isolated SQLite database using the real Vite client, Hono API, Better Auth session, and persisted tax-return reload.

## Scenario

- Business: Kauri Design Limited (New Zealand, GST registered at 15%)
- Customer: Harbour Cafe
- Invoice: `INV-2026-0001`, subtotal `NZD 1,000.00`, GST `NZD 150.00`, total `NZD 1,150.00`
- Payment: full bank-transfer payment of `NZD 1,150.00`
- GST period: 1 July 2026 to 30 September 2026
- Calculated GST: `NZD 150.00` owing
- Filing record: submitted with confirmation `MYIR-GST-Q3-2026-001`
- Browser console/page errors: none
- Responsive evidence: desktop `1440x900`, mobile `390x844`

## Evidence

1. [Paid invoice](./01-paid-invoice-desktop.png)
2. [Calculated GST review](./02-gst-calculation-review-desktop.png)
3. [Saved GST draft](./03-saved-gst-draft-desktop.png)
4. [myIR confirmation step](./04-myir-confirmation-desktop.png)
5. [Persisted filed return](./05-filed-gst-return-desktop.png)
6. [Persisted filed return on mobile](./06-filed-gst-return-mobile.png)

LedgerCraft correctly stops at the IRD boundary: the user files in myIR, then records the IRD confirmation reference in LedgerCraft. The app does not claim to submit directly to IRD.
