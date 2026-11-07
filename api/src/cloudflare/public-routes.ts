const ID = '[0-9a-f-]{36}';
const PUBLIC_STATEMENT = new RegExp(`^/api/public/customer-statements/(${ID})\\.[a-f0-9]{64}$`);
const PUBLIC_READ = new RegExp(`^/api/public/(?:invoices|quotes)/(${ID})_${ID}$`);
const PUBLIC_RESPOND = new RegExp(`^/api/public/quotes/(${ID})_${ID}/respond$`);
const PUBLIC_PAY = new RegExp(`^/api/public/pay/(${ID})_${ID}$`);

/**
 * Organisation id for an unauthenticated public ledger route, or null when the
 * request must keep the normal session gate (401 without a session).
 * Only exact invoice/quote/statement share reads, quote responses and pay redirects match.
 */
export function publicLedgerOrganisationId(pathname: string): string | null {
  return PUBLIC_STATEMENT.exec(pathname)?.[1] ?? PUBLIC_READ.exec(pathname)?.[1] ?? PUBLIC_RESPOND.exec(pathname)?.[1] ?? PUBLIC_PAY.exec(pathname)?.[1] ?? null;
}
