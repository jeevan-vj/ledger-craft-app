const ID = '[0-9a-f-]{36}';
const PUBLIC_READ = new RegExp(`^/api/public/(?:invoices|quotes)/(${ID})_${ID}$`);
const PUBLIC_RESPOND = new RegExp(`^/api/public/quotes/(${ID})_${ID}/respond$`);
const PUBLIC_PAY = new RegExp(`^/api/public/pay/(${ID})_${ID}$`);

/**
 * Organisation id for an unauthenticated public ledger route, or null when the
 * request must keep the normal session gate (401 without a session).
 * Only the invoice/quote share read and the quote respond write match.
 */
export function publicLedgerOrganisationId(pathname: string): string | null {
  return pathname.match(PUBLIC_READ)?.[1] ?? pathname.match(PUBLIC_RESPOND)?.[1] ?? pathname.match(PUBLIC_PAY)?.[1] ?? null;
}
