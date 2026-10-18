import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { Invoice, BusinessProfile } from '@/types/invoice';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { getTemplateHTML } from './invoiceTemplates';

export async function generateInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic'
): Promise<string | null> {
  try {
    const html = generateInvoiceHTML(invoice, businessProfile, templateId);
    
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    return uri;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

export async function shareInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic'
): Promise<void> {
  try {
    const uri = await generateInvoicePDF(invoice, businessProfile, templateId);
    
    if (!uri) {
      throw new Error('Failed to generate PDF');
    }

    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();
    
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${invoice.invoiceNumber}`,
        UTI: 'com.adobe.pdf',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }
  } catch (error) {
    console.error('Error sharing PDF:', error);
    throw error;
  }
}

export async function downloadInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic'
): Promise<string> {
  try {
    const uri = await generateInvoicePDF(invoice, businessProfile, templateId);
    
    if (!uri) {
      throw new Error('Failed to generate PDF');
    }

    // Create a more permanent location for the PDF
    const fileName = `${invoice.invoiceNumber.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    const downloadPath = `${FileSystem.documentDirectory}${fileName}`;
    
    // Copy the file to a permanent location
    await FileSystem.copyAsync({
      from: uri,
      to: downloadPath,
    });

    return downloadPath;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw error;
  }
}

function generateInvoiceHTML(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic'
): string {
  // Use the new template system
  return getTemplateHTML(templateId, invoice, businessProfile);
}

// Legacy function kept for backward compatibility
function generateInvoiceHTMLLegacy(invoice: Invoice): string {
  const formatCurrency = (amount: number, currency: string) => {
    const symbol = currency === 'NZD' ? '$' : currency;
    return `${symbol}${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#10b981';
      case 'sent': return '#3b82f6';
      case 'draft': return '#6b7280';
      case 'overdue': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Invoice ${invoice.invoiceNumber}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 12px;
            line-height: 1.6;
            color: #0f172a;
            padding: 40px;
            background: white;
          }
          
          .invoice-container {
            max-width: 800px;
            margin: 0 auto;
          }
          
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid #33415C;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          
          .company-info h1 {
            font-size: 28px;
            color: #33415C;
            margin-bottom: 5px;
            font-weight: 700;
          }
          
          .company-info p {
            color: #64748b;
            font-size: 14px;
          }
          
          .invoice-info {
            text-align: right;
          }
          
          .invoice-label {
            font-size: 14px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
          }
          
          .invoice-number {
            font-size: 24px;
            font-weight: 700;
            color: #33415C;
            margin-bottom: 10px;
          }
          
          .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            color: white;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background-color: ${getStatusColor(invoice.status)};
          }
          
          .details-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
          }
          
          .detail-column {
            flex: 1;
          }
          
          .section-title {
            font-size: 12px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
          }
          
          .customer-name {
            font-size: 16px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 6px;
          }
          
          .customer-detail,
          .date-info {
            color: #64748b;
            margin-bottom: 4px;
            font-size: 13px;
          }
          
          .date-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
          }
          
          .date-label {
            color: #64748b;
          }
          
          .date-value {
            font-weight: 600;
            color: #0f172a;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          
          thead {
            background-color: #f1f5f9;
          }
          
          th {
            padding: 12px;
            text-align: left;
            font-size: 12px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          th:last-child,
          td:last-child {
            text-align: right;
          }
          
          tbody tr {
            border-bottom: 1px solid #f1f5f9;
          }
          
          td {
            padding: 12px;
            font-size: 13px;
          }
          
          .item-description {
            font-weight: 600;
            color: #0f172a;
          }
          
          .item-unit {
            color: #64748b;
            font-size: 11px;
          }
          
          .totals-section {
            margin-left: auto;
            width: 300px;
            border-top: 2px solid #e2e8f0;
            padding-top: 20px;
          }
          
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 14px;
          }
          
          .total-label {
            color: #64748b;
          }
          
          .total-value {
            font-weight: 600;
            color: #0f172a;
          }
          
          .grand-total {
            border-top: 2px solid #e2e8f0;
            padding-top: 12px;
            margin-top: 12px;
          }
          
          .grand-total .total-label {
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
          }
          
          .grand-total .total-value {
            font-size: 20px;
            font-weight: 700;
            color: #33415C;
          }
          
          .notes-section,
          .terms-section {
            background-color: #f8fafc;
            padding: 16px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          
          .notes-title,
          .terms-title {
            font-size: 12px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
          }
          
          .notes-text,
          .terms-text {
            color: #0f172a;
            font-size: 13px;
            line-height: 1.6;
          }
          
          .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #64748b;
            font-style: italic;
          }
          
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <!-- Header -->
          <div class="header">
            <div class="company-info">
              <h1>Your Business Name</h1>
              <p>Professional Invoice</p>
            </div>
            <div class="invoice-info">
              <div class="invoice-label">Invoice</div>
              <div class="invoice-number">${invoice.invoiceNumber}</div>
              <div class="status-badge">${invoice.status}</div>
            </div>
          </div>
          
          <!-- Details Section -->
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
                <span class="date-value">${formatDate(invoice.date)}</span>
              </div>
              <div class="date-row">
                <span class="date-label">Due Date:</span>
                <span class="date-value">${formatDate(invoice.dueDate)}</span>
              </div>
            </div>
          </div>
          
          <!-- Line Items Table -->
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
          
          <!-- Totals -->
          <div class="totals-section">
            <div class="total-row">
              <span class="total-label">Subtotal:</span>
              <span class="total-value">${formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            ${invoice.taxAmount > 0 ? `
              <div class="total-row">
                <span class="total-label">Tax:</span>
                <span class="total-value">${formatCurrency(invoice.taxAmount, invoice.currency)}</span>
              </div>
            ` : ''}
            ${invoice.discount && invoice.discount > 0 ? `
              <div class="total-row">
                <span class="total-label">Discount:</span>
                <span class="total-value">-${formatCurrency(invoice.discount, invoice.currency)}</span>
              </div>
            ` : ''}
            ${invoice.additionalCharges && invoice.additionalCharges > 0 ? `
              <div class="total-row">
                <span class="total-label">Additional Charges:</span>
                <span class="total-value">${formatCurrency(invoice.additionalCharges, invoice.currency)}</span>
              </div>
            ` : ''}
            <div class="total-row grand-total">
              <span class="total-label">Total:</span>
              <span class="total-value">${formatCurrency(invoice.total, invoice.currency)}</span>
            </div>
          </div>
          
          <!-- Notes -->
          ${invoice.notes ? `
            <div class="notes-section">
              <div class="notes-title">Notes:</div>
              <div class="notes-text">${invoice.notes}</div>
            </div>
          ` : ''}
          
          <!-- Terms -->
          ${invoice.terms ? `
            <div class="terms-section">
              <div class="terms-title">Payment Terms:</div>
              <div class="terms-text">${invoice.terms}</div>
            </div>
          ` : ''}
          
          <!-- Footer -->
          <div class="footer">
            Thank you for your business!
          </div>
        </div>
      </body>
    </html>
  `;
}

