import type { Invoice, BusinessProfile } from '@/types/invoice';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { invoiceDocumentCss, resolveInvoiceTheme } from '@/utils/invoiceTheme';
import { formatMoney } from '@/utils/money';

/** Wording for an invoice or a quote/estimate. Invoice defaults match the existing templates. */
export interface DocumentLabels {
  title: string;
  titleUpper: string;
  detailsHeading: string;
  informationHeading: string;
  dueLabel: string;
  dueShort: string;
  dueHeading: string;
  issuedDateLabel: string;
  paymentDueLabel: string;
  issueDateLabel: string;
  showPayment: boolean;
}

export const invoiceDocumentLabels: DocumentLabels = {
  title: 'Invoice',
  titleUpper: 'INVOICE',
  detailsHeading: 'Invoice Details',
  informationHeading: 'Invoice Information',
  dueLabel: 'Due Date',
  dueShort: 'Due',
  dueHeading: 'Due Date',
  issuedDateLabel: 'Invoice Date',
  paymentDueLabel: 'Payment Due',
  issueDateLabel: 'Issue Date',
  showPayment: true,
};

export function quoteDocumentLabels(kind: 'quote' | 'estimate'): DocumentLabels {
  const title = kind === 'estimate' ? 'ESTIMATE' : 'QUOTE';
  return {
    title,
    titleUpper: title,
    detailsHeading: 'Details',
    informationHeading: 'Details',
    dueLabel: 'Valid until',
    dueShort: 'Valid until',
    dueHeading: 'Valid until',
    issuedDateLabel: 'Date',
    paymentDueLabel: 'Valid until',
    issueDateLabel: 'Date',
    showPayment: false,
  };
}

// Helper functions
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

function optionalText<T extends string | null | undefined>(value: T): T {
  if (value == null) return value;
  return escapeHtml(value) as T;
}

function finiteNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function currencyCode(currency: string | null | undefined): string {
  const code = (currency ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

function safeLogoUrl(url: string | null | undefined): string | null | undefined {
  if (url == null) return url;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return escapeHtml(trimmed);
}

function escapeInvoiceText(invoice: Invoice): Invoice {
  return {
    ...invoice,
    invoiceNumber: escapeHtml(invoice.invoiceNumber),
    customer: invoice.customer
      ? {
          ...invoice.customer,
          name: escapeHtml(invoice.customer.name),
          email: escapeHtml(invoice.customer.email),
          phone: optionalText(invoice.customer.phone),
          address: optionalText(invoice.customer.address),
          city: optionalText(invoice.customer.city),
          state: optionalText(invoice.customer.state),
          zip: optionalText(invoice.customer.zip),
          country: optionalText(invoice.customer.country),
        }
      : undefined,
    items: invoice.items.map((item) => ({
      ...item,
      description: escapeHtml(item.description),
      unit: escapeHtml(item.unit),
      quantity: finiteNumber(item.quantity),
    })),
    additionalChargesList: invoice.additionalChargesList?.map((charge) => ({
      ...charge,
      name: escapeHtml(charge.name),
    })),
    notes: optionalText(invoice.notes),
    terms: optionalText(invoice.terms),
    currency: currencyCode(invoice.currency),
    status: escapeHtml(invoice.status) as Invoice['status'],
  };
}

function escapeBusinessProfileText(profile?: BusinessProfile): BusinessProfile | undefined {
  if (!profile) return undefined;
  return {
    ...profile,
    name: escapeHtml(profile.name),
    email: escapeHtml(profile.email),
    phone: optionalText(profile.phone),
    address: optionalText(profile.address),
    city: optionalText(profile.city),
    state: optionalText(profile.state),
    zip: optionalText(profile.zip),
    country: optionalText(profile.country),
    taxId: optionalText(profile.taxId),
    logoUrl: safeLogoUrl(profile.logoUrl),
    website: optionalText(profile.website),
    defaultNotes: optionalText(profile.defaultNotes),
    defaultTerms: optionalText(profile.defaultTerms),
  };
}

const formatCurrency = (amount: number, currency: string): string => {
  const code = currencyCode(currency);
  const value = Number.isFinite(amount) ? amount : 0;
  if (!code) {
    return value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return formatMoney(value, code);
};

export function invoiceAmountDue(invoice: Pick<Invoice, 'balanceDue' | 'status' | 'total' | 'totalPaid'>): number {
  if (Number.isFinite(invoice.balanceDue)) {
    return Math.max(0, invoice.balanceDue ?? 0);
  }
  if (invoice.status === 'paid') {
    return 0;
  }
  return Math.max(0, invoice.total - (invoice.totalPaid ?? 0));
}

function invoiceTaxLabel(invoice: Invoice): string {
  const discount = invoice.discount ?? 0;
  const taxBase = invoice.taxInclusive ? invoice.subtotal : invoice.subtotal - discount;
  const taxRate = taxBase > 0 ? (invoice.taxAmount / taxBase) * 100 : 0;
  const roundedRate = Math.round(taxRate * 100) / 100;
  const label = invoice.currency.toUpperCase() === 'NZD' ? 'GST' : 'Tax';
  return roundedRate > 0 ? `${label} (${roundedRate.toLocaleString('en-NZ')}%):` : `${label}:`;
}

function renderInvoiceTotals(invoice: Invoice, labels: DocumentLabels = invoiceDocumentLabels): string {
  const currency = invoice.currency || 'NZD';
  const discount = invoice.discount ?? 0;
  const additionalCharges = invoice.additionalChargesTotal ?? invoice.additionalCharges ?? 0;

  return `
    <div data-invoice-totals="true">
      <div class="total-row">
        <span class="total-label">Subtotal:</span>
        <span class="total-value">${formatCurrency(invoice.subtotal, currency)}</span>
      </div>
      ${invoice.taxAmount > 0 ? `
        <div class="total-row">
          <span class="total-label">${invoiceTaxLabel(invoice)}</span>
          <span class="total-value">${formatCurrency(invoice.taxAmount, currency)}</span>
        </div>
      ` : ''}
      ${discount > 0 ? `
        <div class="total-row">
          <span class="total-label">Discount:</span>
          <span class="total-value discount-value" style="color: var(--inv-accent)">-${formatCurrency(discount, currency)}</span>
        </div>
      ` : ''}
      ${additionalCharges > 0 ? `
        <div class="total-row">
          <span class="total-label">Additional Charges:</span>
          <span class="total-value">${formatCurrency(additionalCharges, currency)}</span>
        </div>
      ` : ''}
      <div class="total-row">
        <span class="total-label">Total:</span>
        <span class="total-value">${formatCurrency(invoice.total, currency)}</span>
      </div>
      ${labels.showPayment ? `<div class="total-row grand-total">
        <span class="total-label">Amount Due:</span>
        <span class="total-value">${formatCurrency(invoiceAmountDue(invoice), currency)}</span>
      </div>` : ''}
    </div>
  `;
}

export function formatInvoiceDate(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateString ?? '').trim());
  if (!match) return 'Invalid date';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return 'Invalid date';
  }
  return date.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function statusFill(status: string): string {
  switch (status) {
    case 'paid': return 'var(--inv-accent)';
    case 'sent': return 'var(--inv-primary)';
    case 'overdue': return '#D92D20';
    default: return 'var(--inv-text-light)';
  }
}

function statusInk(status: string): string {
  switch (status) {
    case 'paid': return 'var(--inv-on-accent)';
    case 'sent': return 'var(--inv-on-primary)';
    case 'overdue': return '#FFFFFF';
    default: return 'var(--inv-on-text-light)';
  }
}

// Classic Template
function generateClassicHTML(invoice: Invoice, businessProfile?: BusinessProfile, labels: DocumentLabels = invoiceDocumentLabels): string {
  const companyName = businessProfile?.name || 'Your Business Name';
  const companyAddress = [
    businessProfile?.address,
    businessProfile?.city,
    businessProfile?.state,
    businessProfile?.zip,
    businessProfile?.country
  ].filter(Boolean).join(', ');
  const companyPhone = businessProfile?.phone || '';
  const companyEmail = businessProfile?.email || '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${labels.title} ${invoice.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 12px;
            line-height: 1.6;
            color: var(--inv-text);
            padding: 40px;
            background: var(--inv-surface);
          }
          .invoice-container { max-width: 800px; margin: 0 auto; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid var(--inv-secondary);
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          ${businessProfile?.logoUrl ? `
          .company-logo {
            width: 80px;
            height: 80px;
            object-fit: contain;
            margin-bottom: 10px;
          }
          ` : ''}
          .company-info h1 {
            font-size: 28px;
            color: var(--inv-primary);
            margin-bottom: 5px;
            font-weight: 700;
          }
          .company-info p { color: var(--inv-text-light); font-size: 14px; }
          .invoice-info { text-align: right; }
          .invoice-label {
            font-size: 14px;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
          }
          .invoice-number {
            font-size: 24px;
            font-weight: 700;
            color: var(--inv-primary);
            margin-bottom: 10px;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background-color: ${statusFill(invoice.status)};
            color: ${statusInk(invoice.status)};
          }
          .details-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
          }
          .detail-column { flex: 1; }
          .section-title {
            font-size: 12px;
            font-weight: 700;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
          }
          .customer-name {
            font-size: 16px;
            font-weight: 600;
            color: var(--inv-text);
            margin-bottom: 6px;
          }
          .customer-detail, .date-info {
            color: var(--inv-text-light);
            margin-bottom: 4px;
            font-size: 13px;
          }
          .date-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
          }
          .date-label { color: var(--inv-text-light); }
          .date-value { font-weight: 600; color: var(--inv-text); }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          thead { background-color: var(--inv-background); }
          th {
            padding: 12px;
            text-align: left;
            font-size: 12px;
            font-weight: 700;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          th:last-child, td:last-child { text-align: right; }
          tbody tr { border-bottom: 1px solid var(--inv-background); }
          td { padding: 12px; font-size: 13px; }
          .item-description { font-weight: 600; color: var(--inv-text); }
          .item-unit { color: var(--inv-text-light); font-size: 11px; }
          .totals-section {
            margin-left: auto;
            width: 300px;
            border-top: 2px solid var(--inv-border);
            padding-top: 20px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 14px;
          }
          .total-label { color: var(--inv-text-light); }
          .total-value { font-weight: 600; color: var(--inv-text); }
          .grand-total {
            border-top: 2px solid var(--inv-border);
            padding-top: 12px;
            margin-top: 12px;
          }
          .grand-total .total-label {
            font-size: 16px;
            font-weight: 700;
            color: var(--inv-text);
          }
          .grand-total .total-value {
            font-size: 20px;
            font-weight: 700;
            color: var(--inv-primary);
          }
          .notes-section, .terms-section {
            background-color: var(--inv-background);
            padding: 16px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          .notes-title, .terms-title {
            font-size: 12px;
            font-weight: 700;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
          }
          .notes-text, .terms-text {
            color: var(--inv-text);
            font-size: 13px;
            line-height: 1.6;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid var(--inv-border);
            color: var(--inv-text-light);
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="header">
            <div class="company-info">
              ${businessProfile?.logoUrl ? `<img src="${businessProfile.logoUrl}" alt="${companyName}" class="company-logo">` : ''}
              <h1>${companyName}</h1>
              ${companyAddress ? `<p>${companyAddress}</p>` : ''}
              ${companyPhone ? `<p>${companyPhone}</p>` : ''}
              ${companyEmail ? `<p>${companyEmail}</p>` : ''}
            </div>
            <div class="invoice-info">
              <div class="invoice-label">${labels.title}</div>
              <div class="invoice-number">${invoice.invoiceNumber}</div>
              <div class="status-badge">${invoice.status}</div>
            </div>
          </div>
          
          <div class="details-section">
            <div class="detail-column">
              <div class="section-title">Bill To:</div>
              <div class="customer-name">${invoice.customer?.name || 'N/A'}</div>
              ${invoice.customer?.email ? `<div class="customer-detail">${invoice.customer.email}</div>` : ''}
              ${invoice.customer?.phone ? `<div class="customer-detail">${invoice.customer.phone}</div>` : ''}
              ${invoice.customer?.address ? `
                <div class="customer-detail">
                  ${[
                    invoice.customer.address,
                    invoice.customer.city,
                    invoice.customer.state,
                    invoice.customer.zip,
                  ].filter(Boolean).join(', ')}
                </div>
              ` : ''}
            </div>
            
            <div class="detail-column">
              <div class="date-row">
                <span class="date-label">Date:</span>
                <span class="date-value">${formatInvoiceDate(invoice.date)}</span>
              </div>
              <div class="date-row">
                <span class="date-label">${labels.dueLabel}:</span>
                <span class="date-value">${formatInvoiceDate(invoice.dueDate)}</span>
              </div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: center; width: 80px;">Qty</th>
                <th style="text-align: right; width: 120px;">Rate</th>
                <th style="text-align: right; width: 120px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map(item => `
                <tr>
                  <td>
                    <div class="item-description">${item.description}</div>
                    <div class="item-unit">${item.unit}</div>
                  </td>
                  <td style="text-align: center;">${item.quantity}</td>
                  <td style="text-align: right;">${formatCurrency(item.rate, invoice.currency)}</td>
                  <td style="text-align: right;">${formatCurrency(item.total, invoice.currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals-section">
            ${renderInvoiceTotals(invoice, labels)}
          </div>
          
          ${invoice.notes ? `
            <div class="notes-section">
              <div class="notes-title">Notes:</div>
              <div class="notes-text">${invoice.notes}</div>
            </div>
          ` : ''}
          
          ${invoice.terms ? `
            <div class="terms-section">
              <div class="terms-title">${labels.showPayment ? 'Payment Terms:' : 'Terms:'}</div>
              <div class="terms-text">${invoice.terms}</div>
            </div>
          ` : ''}
          
          <div class="footer">
            Thank you for your business!
          </div>
        </div>
      </body>
    </html>
  `;
}

// Modern Template
function generateModernHTML(invoice: Invoice, businessProfile?: BusinessProfile, labels: DocumentLabels = invoiceDocumentLabels): string {
  const companyName = businessProfile?.name || 'Your Business Name';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${labels.title} ${invoice.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            line-height: 1.6;
            color: var(--inv-text);
            background: var(--inv-surface);
          }
          .invoice-container { max-width: 800px; margin: 0 auto; }
          .header {
            background: linear-gradient(135deg, var(--inv-primary) 0%, var(--inv-secondary) 100%);
            padding: 40px;
            color: var(--inv-on-gradient);
          }
          .header-content {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          ${businessProfile?.logoUrl ? `
          .company-logo {
            width: 60px;
            height: 60px;
            object-fit: contain;
            background: var(--inv-surface);
            padding: 8px;
            border-radius: 8px;
            margin-bottom: 10px;
          }
          ` : ''}
          .company-name {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .invoice-title {
            font-size: 36px;
            font-weight: 700;
            text-align: right;
          }
          .invoice-number {
            font-size: 18px;
            opacity: 0.9;
            text-align: right;
            margin-top: 5px;
          }
          .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            background-color: ${statusFill(invoice.status)};
            color: ${statusInk(invoice.status)};
            margin-top: 10px;
          }
          .content { padding: 40px; }
          .info-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            background: var(--inv-background);
            padding: 24px;
            border-radius: 12px;
          }
          .info-block h3 {
            font-size: 12px;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
          }
          .info-block p {
            font-size: 14px;
            color: var(--inv-text);
            margin-bottom: 4px;
          }
          .info-block .highlight {
            font-weight: 600;
            color: var(--inv-primary);
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          thead {
            background: var(--inv-primary);
            color: var(--inv-on-primary);
          }
          th {
            padding: 14px 12px;
            text-align: left;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          th:last-child, td:last-child { text-align: right; }
          tbody tr { border-bottom: 1px solid var(--inv-border); }
          tbody tr:hover { background-color: var(--inv-background); }
          td { padding: 14px 12px; font-size: 13px; }
          .item-description { font-weight: 600; color: var(--inv-text); }
          .item-unit { color: var(--inv-text-light); font-size: 11px; margin-top: 2px; }
          .totals-section {
            margin-left: auto;
            width: 320px;
            background: var(--inv-background);
            padding: 24px;
            border-radius: 12px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            font-size: 14px;
          }
          .total-label { color: var(--inv-text-light); }
          .total-value { font-weight: 600; color: var(--inv-text); }
          .grand-total {
            border-top: 2px solid var(--inv-primary);
            padding-top: 16px;
            margin-top: 16px;
          }
          .grand-total .total-label {
            font-size: 18px;
            font-weight: 700;
            color: var(--inv-text);
          }
          .grand-total .total-value {
            font-size: 24px;
            font-weight: 700;
            color: var(--inv-primary);
          }
          .notes-section, .terms-section {
            background: var(--inv-background);
            padding: 20px;
            border-radius: 12px;
            border: 1px solid var(--inv-border);
            margin-bottom: 20px;
          }
          .notes-title, .terms-title {
            font-size: 14px;
            font-weight: 700;
            color: var(--inv-text);
            margin-bottom: 10px;
          }
          .notes-text, .terms-text {
            color: var(--inv-text-light);
            font-size: 13px;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="header">
            <div class="header-content">
              <div>
                ${businessProfile?.logoUrl ? `<img src="${businessProfile.logoUrl}" alt="${companyName}" class="company-logo">` : ''}
                <div class="company-name">${companyName}</div>
              </div>
              <div>
                <div class="invoice-title">${labels.titleUpper}</div>
                <div class="invoice-number">#${invoice.invoiceNumber}</div>
                <div class="status-badge">${invoice.status}</div>
              </div>
            </div>
          </div>
          
          <div class="content">
            <div class="info-section">
              <div class="info-block">
                <h3>Bill To</h3>
                <p style="font-weight: 700; font-size: 16px; margin-bottom: 8px;">${invoice.customer?.name || 'N/A'}</p>
                ${invoice.customer?.email ? `<p>${invoice.customer.email}</p>` : ''}
                ${invoice.customer?.phone ? `<p>${invoice.customer.phone}</p>` : ''}
                ${invoice.customer?.address ? `
                  <p>${[invoice.customer.address, invoice.customer.city].filter(Boolean).join(', ')}</p>
                ` : ''}
              </div>
              
              <div class="info-block">
                <h3>${labels.detailsHeading}</h3>
                <p><span class="highlight">Date:</span> ${formatInvoiceDate(invoice.date)}</p>
                <p><span class="highlight">${labels.dueShort}:</span> ${formatInvoiceDate(invoice.dueDate)}</p>
                <p><span class="highlight">Currency:</span> ${invoice.currency}</p>
              </div>
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style="text-align: center; width: 80px;">Qty</th>
                  <th style="text-align: right; width: 120px;">Rate</th>
                  <th style="text-align: right; width: 120px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map(item => `
                  <tr>
                    <td>
                      <div class="item-description">${item.description}</div>
                      <div class="item-unit">${item.unit}</div>
                    </td>
                    <td style="text-align: center;">${item.quantity}</td>
                    <td style="text-align: right;">${formatCurrency(item.rate, invoice.currency)}</td>
                    <td style="text-align: right;">${formatCurrency(item.total, invoice.currency)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="totals-section">
              ${renderInvoiceTotals(invoice, labels)}
            </div>
            
            ${invoice.notes ? `
              <div class="notes-section">
                <div class="notes-title">Notes</div>
                <div class="notes-text">${invoice.notes}</div>
              </div>
            ` : ''}
            
            ${invoice.terms ? `
              <div class="terms-section">
                <div class="terms-title">${labels.showPayment ? 'Payment Terms' : 'Terms'}</div>
                <div class="terms-text">${invoice.terms}</div>
              </div>
            ` : ''}
          </div>
        </div>
      </body>
    </html>
  `;
}

// Minimal Template
function generateMinimalHTML(invoice: Invoice, businessProfile?: BusinessProfile, labels: DocumentLabels = invoiceDocumentLabels): string {
  const companyName = businessProfile?.name || 'Your Business Name';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${labels.title} ${invoice.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            line-height: 1.6;
            color: var(--inv-text);
            padding: 40px;
            background: var(--inv-surface);
          }
          .invoice-container { max-width: 700px; margin: 0 auto; }
          .header {
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--inv-secondary);
          }
          .invoice-title {
            font-size: 32px;
            font-weight: 300;
            color: var(--inv-text);
            margin-bottom: 8px;
          }
          .invoice-number {
            font-size: 16px;
            color: var(--inv-primary);
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-bottom: 40px;
          }
          .info-block h3 {
            font-size: 11px;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 12px;
            font-weight: 600;
          }
          .info-block p {
            font-size: 14px;
            color: var(--inv-text-light);
            margin-bottom: 4px;
          }
          .info-block .name {
            font-weight: 600;
            color: var(--inv-text);
            font-size: 15px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          thead {
            border-bottom: 2px solid var(--inv-border);
          }
          th {
            padding: 12px 8px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          th:last-child, td:last-child { text-align: right; }
          tbody tr { border-bottom: 1px solid var(--inv-background); }
          td { padding: 16px 8px; font-size: 14px; color: var(--inv-text-light); }
          .item-description { font-weight: 500; color: var(--inv-text); }
          .totals-section {
            margin-left: auto;
            width: 280px;
            padding-top: 20px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 14px;
          }
          .total-label { color: var(--inv-text-light); font-weight: 400; }
          .total-value { font-weight: 500; color: var(--inv-text); }
          .grand-total {
            border-top: 1px solid var(--inv-border);
            padding-top: 14px;
            margin-top: 14px;
          }
          .grand-total .total-label {
            font-size: 16px;
            font-weight: 600;
            color: var(--inv-text);
          }
          .grand-total .total-value {
            font-size: 20px;
            font-weight: 600;
            color: var(--inv-primary);
          }
          .notes-section {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid var(--inv-border);
          }
          .notes-title {
            font-size: 11px;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 10px;
            font-weight: 600;
          }
          .notes-text {
            color: var(--inv-text-light);
            font-size: 13px;
            line-height: 1.7;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="header">
            <div class="invoice-title">${labels.title}</div>
            <div class="invoice-number">${invoice.invoiceNumber}</div>
          </div>
          
          <div class="info-grid">
            <div class="info-block">
              <h3>From</h3>
              <p class="name">${companyName}</p>
              ${businessProfile?.email ? `<p>${businessProfile.email}</p>` : ''}
              ${businessProfile?.phone ? `<p>${businessProfile.phone}</p>` : ''}
            </div>
            
            <div class="info-block">
              <h3>To</h3>
              <p class="name">${invoice.customer?.name || 'N/A'}</p>
              ${invoice.customer?.email ? `<p>${invoice.customer.email}</p>` : ''}
              ${invoice.customer?.phone ? `<p>${invoice.customer.phone}</p>` : ''}
            </div>
            
            <div class="info-block">
              <h3>Date</h3>
              <p>${formatInvoiceDate(invoice.date)}</p>
            </div>
            
            <div class="info-block">
              <h3>${labels.dueHeading}</h3>
              <p>${formatInvoiceDate(invoice.dueDate)}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center; width: 80px;">Qty</th>
                <th style="text-align: right; width: 100px;">Rate</th>
                <th style="text-align: right; width: 120px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map(item => `
                <tr>
                  <td>
                    <div class="item-description">${item.description}</div>
                  </td>
                  <td style="text-align: center;">${item.quantity}</td>
                  <td style="text-align: right;">${formatCurrency(item.rate, invoice.currency)}</td>
                  <td style="text-align: right;">${formatCurrency(item.total, invoice.currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals-section">
            ${renderInvoiceTotals(invoice, labels)}
          </div>
          
          ${invoice.notes || invoice.terms ? `
            <div class="notes-section">
              ${invoice.notes ? `
                <div class="notes-title">Notes</div>
                <div class="notes-text">${invoice.notes}</div>
              ` : ''}
              ${invoice.terms ? `
                <div class="notes-title" style="margin-top: 20px;">Terms</div>
                <div class="notes-text">${invoice.terms}</div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </body>
    </html>
  `;
}

// Executive Template - Continued in next part due to length
function generateExecutiveHTML(invoice: Invoice, businessProfile?: BusinessProfile, labels: DocumentLabels = invoiceDocumentLabels): string {
  const companyName = businessProfile?.name || 'Your Business Name';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${labels.title} ${invoice.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 13px;
            line-height: 1.6;
            color: var(--inv-text);
            padding: 50px;
            background: var(--inv-surface);
          }
          .invoice-container { max-width: 750px; margin: 0 auto; }
          .header {
            text-align: center;
            margin-bottom: 50px;
            padding-bottom: 30px;
            border-bottom: 2px solid var(--inv-secondary);
          }
          .company-name {
            font-size: 28px;
            font-weight: 700;
            color: var(--inv-text);
            margin-bottom: 10px;
            letter-spacing: 2px;
          }
          .invoice-title {
            font-size: 16px;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 3px;
            margin-top: 15px;
          }
          .invoice-number {
            font-size: 20px;
            color: var(--inv-primary);
            font-weight: 600;
            margin-top: 8px;
          }
          .info-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 50px;
            background: var(--inv-background);
            padding: 30px;
            border-radius: 8px;
          }
          .info-block h3 {
            font-size: 12px;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 15px;
            font-weight: 600;
          }
          .info-block p {
            font-size: 14px;
            color: var(--inv-text-light);
            margin-bottom: 5px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .info-block .highlight {
            font-weight: 600;
            color: var(--inv-text);
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 40px;
          }
          thead {
            background: var(--inv-background);
            color: var(--inv-text-light);
          }
          th {
            padding: 16px 14px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          th:last-child, td:last-child { text-align: right; }
          tbody tr {
            border-bottom: 1px solid var(--inv-border);
          }
          td {
            padding: 16px 14px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .item-description {
            font-weight: 600;
            color: var(--inv-text);
          }
          .totals-section {
            margin-left: auto;
            width: 350px;
            background: var(--inv-background);
            padding: 25px;
            border-radius: 8px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .total-label { color: var(--inv-text-light); }
          .total-value { font-weight: 600; color: var(--inv-text); }
          .grand-total {
            border-top: 2px solid var(--inv-primary);
            padding-top: 18px;
            margin-top: 18px;
          }
          .grand-total .total-label {
            font-size: 18px;
            font-weight: 700;
            color: var(--inv-text);
          }
          .grand-total .total-value {
            font-size: 24px;
            font-weight: 700;
            color: var(--inv-primary);
          }
          .notes-section {
            background: var(--inv-background);
            padding: 25px;
            border-radius: 8px;
            margin-top: 30px;
          }
          .notes-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--inv-text-light);
            margin-bottom: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .notes-text {
            color: var(--inv-text-light);
            font-size: 13px;
            line-height: 1.7;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="header">
            <div class="company-name">${companyName}</div>
            <div class="invoice-title">${labels.title}</div>
            <div class="invoice-number">${invoice.invoiceNumber}</div>
          </div>
          
          <div class="info-section">
            <div class="info-block">
              <h3>Billed To</h3>
              <p class="highlight">${invoice.customer?.name || 'N/A'}</p>
              ${invoice.customer?.email ? `<p>${invoice.customer.email}</p>` : ''}
              ${invoice.customer?.phone ? `<p>${invoice.customer.phone}</p>` : ''}
              ${invoice.customer?.address ? `
                <p>${[invoice.customer.address, invoice.customer.city].filter(Boolean).join(', ')}</p>
              ` : ''}
            </div>
            
            <div class="info-block">
              <h3>${labels.detailsHeading}</h3>
              <p><span class="highlight">${labels.issuedDateLabel}:</span> ${formatInvoiceDate(invoice.date)}</p>
              <p><span class="highlight">${labels.dueLabel}:</span> ${formatInvoiceDate(invoice.dueDate)}</p>
              <p><span class="highlight">Status:</span> ${invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: center; width: 80px;">Quantity</th>
                <th style="text-align: right; width: 120px;">Rate</th>
                <th style="text-align: right; width: 120px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map(item => `
                <tr>
                  <td>
                    <div class="item-description">${item.description}</div>
                  </td>
                  <td style="text-align: center;">${item.quantity} ${item.unit}</td>
                  <td style="text-align: right;">${formatCurrency(item.rate, invoice.currency)}</td>
                  <td style="text-align: right;">${formatCurrency(item.total, invoice.currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals-section">
            ${renderInvoiceTotals(invoice, labels)}
          </div>
          
          ${invoice.notes || invoice.terms ? `
            <div class="notes-section">
              ${invoice.notes ? `
                <div class="notes-title">Notes</div>
                <div class="notes-text">${invoice.notes}</div>
              ` : ''}
              ${invoice.terms ? `
                <div class="notes-title" style="margin-top: 20px;">Terms & Conditions</div>
                <div class="notes-text">${invoice.terms}</div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </body>
    </html>
  `;
}

// Corporate Template
function generateCorporateHTML(invoice: Invoice, businessProfile?: BusinessProfile, labels: DocumentLabels = invoiceDocumentLabels): string {
  const companyName = businessProfile?.name || 'Your Business Name';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${labels.title} ${invoice.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            line-height: 1.6;
            color: var(--inv-text);
            background: var(--inv-surface);
          }
          .invoice-container { max-width: 850px; margin: 0 auto; }
          .header {
            background: linear-gradient(135deg, var(--inv-primary) 0%, var(--inv-secondary) 100%);
            color: var(--inv-on-gradient);
            padding: 50px 40px;
          }
          .header-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
          }
          .company-section h1 {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 15px;
          }
          .company-section p {
            opacity: 0.9;
            font-size: 14px;
          }
          .invoice-section {
            text-align: right;
          }
          .invoice-label {
            font-size: 14px;
            opacity: 0.8;
            margin-bottom: 8px;
          }
          .invoice-number {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 15px;
          }
          .status-badge {
            display: inline-block;
            padding: 8px 20px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            background-color: ${statusFill(invoice.status)};
            color: ${statusInk(invoice.status)};
          }
          .content { padding: 40px; }
          .details-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 30px;
            margin-bottom: 40px;
            background: var(--inv-background);
            padding: 30px;
            border-left: 4px solid var(--inv-primary);
          }
          .detail-block h3 {
            font-size: 11px;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 12px;
            font-weight: 700;
          }
          .detail-block p {
            font-size: 14px;
            color: var(--inv-text);
            margin-bottom: 4px;
          }
          .detail-block .name {
            font-weight: 700;
            font-size: 16px;
            color: var(--inv-text);
            margin-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border: 1px solid var(--inv-border);
          }
          thead {
            background: var(--inv-primary);
            color: var(--inv-on-primary);
          }
          th {
            padding: 16px;
            text-align: left;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          th:last-child, td:last-child { text-align: right; }
          tbody tr {
            border-bottom: 1px solid var(--inv-border);
            background: var(--inv-surface);
          }
          tbody tr:nth-child(even) {
            background: var(--inv-background);
          }
          td { padding: 16px; font-size: 14px; }
          .item-description {
            font-weight: 600;
            color: var(--inv-text);
            margin-bottom: 4px;
          }
          .item-unit {
            color: var(--inv-text-light);
            font-size: 12px;
          }
          .totals-section {
            margin-left: auto;
            width: 350px;
            background: var(--inv-background);
            padding: 30px;
            border: 1px solid var(--inv-border);
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 14px;
            font-size: 15px;
          }
          .total-label { color: var(--inv-text-light); font-weight: 500; }
          .total-value { font-weight: 600; color: var(--inv-text); }
          .grand-total {
            border-top: 2px solid var(--inv-primary);
            padding-top: 16px;
            margin-top: 16px;
          }
          .grand-total .total-label {
            font-size: 18px;
            font-weight: 700;
            color: var(--inv-text);
          }
          .grand-total .total-value {
            font-size: 26px;
            font-weight: 700;
            color: var(--inv-primary);
          }
          .notes-section {
            background: var(--inv-background);
            padding: 25px;
            border-left: 4px solid var(--inv-primary);
            margin-top: 30px;
          }
          .notes-title {
            font-size: 14px;
            font-weight: 700;
            color: var(--inv-text);
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .notes-text {
            color: var(--inv-text-light);
            font-size: 14px;
            line-height: 1.7;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="header">
            <div class="header-grid">
              <div class="company-section">
                <h1>${companyName}</h1>
                ${businessProfile?.email ? `<p>${businessProfile.email}</p>` : ''}
                ${businessProfile?.phone ? `<p>${businessProfile.phone}</p>` : ''}
                ${businessProfile?.address ? `<p>${businessProfile.address}</p>` : ''}
              </div>
              <div class="invoice-section">
                <div class="invoice-label">${labels.titleUpper}</div>
                <div class="invoice-number">${invoice.invoiceNumber}</div>
                <div class="status-badge">${invoice.status}</div>
              </div>
            </div>
          </div>
          
          <div class="content">
            <div class="details-grid">
              <div class="detail-block">
                <h3>Bill To</h3>
                <p class="name">${invoice.customer?.name || 'N/A'}</p>
                ${invoice.customer?.email ? `<p>${invoice.customer.email}</p>` : ''}
                ${invoice.customer?.phone ? `<p>${invoice.customer.phone}</p>` : ''}
                ${invoice.customer?.address ? `
                  <p>${[invoice.customer.address, invoice.customer.city].filter(Boolean).join(', ')}</p>
                ` : ''}
              </div>
              
              <div class="detail-block">
                <h3>${labels.informationHeading}</h3>
                <p><strong>Date Issued:</strong> ${formatInvoiceDate(invoice.date)}</p>
                <p><strong>${labels.paymentDueLabel}:</strong> ${formatInvoiceDate(invoice.dueDate)}</p>
                <p><strong>Currency:</strong> ${invoice.currency}</p>
              </div>
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style="text-align: center; width: 100px;">Quantity</th>
                  <th style="text-align: right; width: 120px;">Rate</th>
                  <th style="text-align: right; width: 120px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map(item => `
                  <tr>
                    <td>
                      <div class="item-description">${item.description}</div>
                      <div class="item-unit">${item.unit}</div>
                    </td>
                    <td style="text-align: center;">${item.quantity}</td>
                    <td style="text-align: right;">${formatCurrency(item.rate, invoice.currency)}</td>
                    <td style="text-align: right;">${formatCurrency(item.total, invoice.currency)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="totals-section">
              ${renderInvoiceTotals(invoice, labels)}
            </div>
            
            ${invoice.notes || invoice.terms ? `
              <div class="notes-section">
                ${invoice.notes ? `
                  <div class="notes-title">Notes</div>
                  <div class="notes-text">${invoice.notes}</div>
                ` : ''}
                ${invoice.terms ? `
                  <div class="notes-title" style="margin-top: 20px;">${labels.showPayment ? 'Payment Terms' : 'Terms'}</div>
                  <div class="notes-text">${invoice.terms}</div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </body>
    </html>
  `;
}

// Modern Pro Template
function generateModernProHTML(invoice: Invoice, businessProfile?: BusinessProfile, labels: DocumentLabels = invoiceDocumentLabels): string {
  const companyName = businessProfile?.name || 'Your Business Name';
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${labels.title} ${invoice.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            line-height: 1.6;
            color: var(--inv-text);
            background: var(--inv-background);
          }
          .invoice-container { max-width: 850px; margin: 0 auto; background: var(--inv-surface); }
          .header {
            background: linear-gradient(135deg, var(--inv-primary) 0%, var(--inv-secondary) 100%);
            padding: 60px 40px;
            color: var(--inv-on-gradient);
            position: relative;
            overflow: hidden;
          }
          .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%);
          }
          .header-content {
            position: relative;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          ${businessProfile?.logoUrl ? `
          .company-logo {
            width: 70px;
            height: 70px;
            object-fit: contain;
            background: var(--inv-surface);
            padding: 10px;
            border-radius: 12px;
            margin-bottom: 15px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          ` : ''}
          .company-name {
            font-size: 30px;
            font-weight: 700;
            margin-bottom: 8px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .company-info {
            opacity: 0.95;
            font-size: 14px;
          }
          .invoice-badge {
            text-align: right;
          }
          .invoice-title {
            font-size: 48px;
            font-weight: 700;
            margin-bottom: 5px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .invoice-number {
            font-size: 20px;
            opacity: 0.95;
            margin-bottom: 15px;
          }
          .status-badge {
            display: inline-block;
            padding: 10px 20px;
            border-radius: 25px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            background-color: ${statusFill(invoice.status)};
            color: ${statusInk(invoice.status)};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .content { padding: 40px; }
          .info-cards {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 40px;
          }
          .info-card {
            background: linear-gradient(135deg, var(--inv-background) 0%, var(--inv-background) 100%);
            padding: 25px;
            border-radius: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          }
          .info-card h3 {
            font-size: 11px;
            color: var(--inv-text-light);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 15px;
            font-weight: 700;
          }
          .info-card p {
            font-size: 14px;
            color: var(--inv-text-light);
            margin-bottom: 5px;
          }
          .info-card .name {
            font-size: 18px;
            font-weight: 700;
            color: var(--inv-text);
            margin-bottom: 10px;
          }
          .info-card .highlight {
            color: var(--inv-primary);
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          }
          thead {
            background: linear-gradient(135deg, var(--inv-primary) 0%, var(--inv-secondary) 100%);
            color: var(--inv-on-gradient);
          }
          th {
            padding: 18px 16px;
            text-align: left;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          th:last-child, td:last-child { text-align: right; }
          tbody tr {
            border-bottom: 1px solid var(--inv-border);
            transition: background 0.2s;
          }
          tbody tr:hover {
            background: var(--inv-background);
          }
          td { padding: 18px 16px; font-size: 14px; }
          .item-description {
            font-weight: 600;
            color: var(--inv-text);
            margin-bottom: 4px;
          }
          .item-unit {
            color: var(--inv-text-light);
            font-size: 12px;
          }
          .totals-section {
            margin-left: auto;
            width: 380px;
            background: linear-gradient(135deg, var(--inv-background) 0%, var(--inv-background) 100%);
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 14px;
            font-size: 15px;
          }
          .total-label { color: var(--inv-text-light); font-weight: 500; }
          .total-value { font-weight: 600; color: var(--inv-text); }
          .grand-total {
            background: linear-gradient(135deg, var(--inv-primary) 0%, var(--inv-secondary) 100%);
            color: var(--inv-on-gradient);
            margin: 20px -30px -30px -30px;
            padding: 25px 30px;
            border-radius: 0 0 16px 16px;
          }
          .grand-total .total-label {
            font-size: 18px;
            font-weight: 700;
            opacity: 0.95;
          }
          .grand-total .total-value {
            font-size: 32px;
            font-weight: 700;
          }
          .notes-section {
            background: linear-gradient(135deg, var(--inv-background) 0%, var(--inv-background) 100%);
            padding: 30px;
            border-radius: 16px;
            margin-top: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          }
          .notes-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--inv-text);
            margin-bottom: 12px;
          }
          .notes-text {
            color: var(--inv-text-light);
            font-size: 14px;
            line-height: 1.7;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="header">
            <div class="header-content">
              <div>
                ${businessProfile?.logoUrl ? `<img src="${businessProfile.logoUrl}" alt="${companyName}" class="company-logo">` : ''}
                <div class="company-name">${companyName}</div>
                ${businessProfile?.email ? `<div class="company-info">${businessProfile.email}</div>` : ''}
              </div>
              <div class="invoice-badge">
                <div class="invoice-title">${labels.titleUpper}</div>
                <div class="invoice-number">${invoice.invoiceNumber}</div>
                <div class="status-badge">${invoice.status}</div>
              </div>
            </div>
          </div>
          
          <div class="content">
            <div class="info-cards">
              <div class="info-card">
                <h3>Bill To</h3>
                <p class="name">${invoice.customer?.name || 'N/A'}</p>
                ${invoice.customer?.email ? `<p>${invoice.customer.email}</p>` : ''}
                ${invoice.customer?.phone ? `<p>${invoice.customer.phone}</p>` : ''}
                ${invoice.customer?.address ? `
                  <p>${[invoice.customer.address, invoice.customer.city].filter(Boolean).join(', ')}</p>
                ` : ''}
              </div>
              
              <div class="info-card">
                <h3>${labels.detailsHeading}</h3>
                <p><span class="highlight">${labels.issueDateLabel}:</span> ${formatInvoiceDate(invoice.date)}</p>
                <p><span class="highlight">${labels.dueLabel}:</span> ${formatInvoiceDate(invoice.dueDate)}</p>
                <p><span class="highlight">Currency:</span> ${invoice.currency}</p>
              </div>
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style="text-align: center; width: 100px;">Quantity</th>
                  <th style="text-align: right; width: 120px;">Rate</th>
                  <th style="text-align: right; width: 130px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map(item => `
                  <tr>
                    <td>
                      <div class="item-description">${item.description}</div>
                      <div class="item-unit">${item.unit}</div>
                    </td>
                    <td style="text-align: center;">${item.quantity}</td>
                    <td style="text-align: right;">${formatCurrency(item.rate, invoice.currency)}</td>
                    <td style="text-align: right;">${formatCurrency(item.total, invoice.currency)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="totals-section">
              ${renderInvoiceTotals(invoice, labels)}
            </div>
            
            ${invoice.notes || invoice.terms ? `
              <div class="notes-section">
                ${invoice.notes ? `
                  <div class="notes-title">Notes</div>
                  <div class="notes-text">${invoice.notes}</div>
                ` : ''}
                ${invoice.terms ? `
                  <div class="notes-title" style="margin-top: 20px;">Terms & Conditions</div>
                  <div class="notes-text">${invoice.terms}</div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </body>
    </html>
  `;
}

function getRawTemplateHTML(
  templateId: InvoiceTemplateId,
  invoice: Invoice,
  businessProfile: BusinessProfile | undefined,
  labels: DocumentLabels,
): string {
  switch (templateId) {
    case 'classic':
      return generateClassicHTML(invoice, businessProfile, labels);
    case 'modern':
      return generateModernHTML(invoice, businessProfile, labels);
    case 'minimal':
      return generateMinimalHTML(invoice, businessProfile, labels);
    case 'executive':
      return generateExecutiveHTML(invoice, businessProfile, labels);
    case 'corporate':
      return generateCorporateHTML(invoice, businessProfile, labels);
    case 'modernpro':
      return generateModernProHTML(invoice, businessProfile, labels);
    default:
      return generateClassicHTML(invoice, businessProfile, labels);
  }
}

/**
 * The single invoice document generator used by both the on-device preview and
 * Expo Print. Keeping the A4 viewport here makes the same HTML scale to the
 * WebView width and render at the requested PDF page size. Brand colours come
 * from the loaded business profile theme.
 */
export function generateInvoiceHTML(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic',
  labels: DocumentLabels = invoiceDocumentLabels,
): string {
  const themeCss = invoiceDocumentCss(resolveInvoiceTheme(businessProfile?.theme));
  return getRawTemplateHTML(
    templateId,
    escapeInvoiceText(invoice),
    escapeBusinessProfileText(businessProfile),
    labels,
  )
    .replace(
      /<meta\s+name="viewport"\s+content="[^"]*">/i,
      '<meta name="viewport" content="width=595, shrink-to-fit=yes, maximum-scale=5, user-scalable=yes">',
    )
    .replace('<style>', `<style>${themeCss}`);
}

/** @deprecated Use generateInvoiceHTML so preview and PDF cannot diverge. */
export function getTemplateHTML(
  templateId: InvoiceTemplateId,
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  labels: DocumentLabels = invoiceDocumentLabels,
): string {
  return generateInvoiceHTML(invoice, businessProfile, templateId, labels);
}
