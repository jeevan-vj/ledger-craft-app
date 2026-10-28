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
  return PUBLIC_READ.exec(pathname)?.[1] ?? PUBLIC_RESPOND.exec(pathname)?.[1] ?? PUBLIC_PAY.exec(pathname)?.[1] ?? null;
}
