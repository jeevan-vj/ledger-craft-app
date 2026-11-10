import { invoiceTabParams, moreTabParams, type HomeQuickActionLink } from '@/navigation/links';

const invoiceId = /^\/invoices\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Maps an assistant link onto the existing invoice, draft, or expense screen. */
export function assistantScreenLink(href: string): HomeQuickActionLink {
  if (href === '/invoices') {
    return { tab: 'Invoices', params: invoiceTabParams({ name: 'InvoiceList' }) };
  }
  const invoice = invoiceId.exec(href);
  if (invoice?.[1]) {
    return { tab: 'Invoices', params: invoiceTabParams({ name: 'InvoiceDetail', params: { invoiceId: invoice[1] } }) };
  }
  if (href === '/expenses') {
    return { tab: 'More', params: moreTabParams({ name: 'ExpenseList' }) };
  }
  return { tab: 'Invoices', params: invoiceTabParams({ name: 'InvoiceCreate' }) };
}
