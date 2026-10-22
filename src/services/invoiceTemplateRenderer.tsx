import React from 'react';
import { createRoot } from 'react-dom/client';
import { Invoice, BusinessProfile, DEFAULT_BUSINESS_THEME } from '@/types';
import { invoiceDisplayTaxRate } from '@/utils/invoiceUtils';
import { invoiceDocumentLabels, resolveDocumentLabels, type DocumentLabels } from '@/components/invoice/preview/documentLabels';
import { InvoiceTemplateId } from '../components/invoice/templates/InvoiceTemplates';
import ClassicTemplate from '../components/invoice/preview/templates/ClassicTemplate';
import ModernTemplate from '../components/invoice/preview/templates/ModernTemplate';
import MinimalTemplate from '../components/invoice/preview/templates/MinimalTemplate';
import ExecutiveTemplate from '../components/invoice/preview/templates/ExecutiveTemplate';
import CorporateTemplate from '../components/invoice/preview/templates/CorporateTemplate';
import ModernInvoiceTemplate from '../components/invoice/preview/templates/ModernInvoiceTemplate';

interface TemplateData {
  invoice: Invoice;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  clientName: string;
  clientAddress: string;
  taxRate: string;
  tax: number;
  businessLogo?: string;
  theme?: any;
  labels: DocumentLabels;
}

export const createTemplateData = (
  invoice: Invoice,
  businessProfile?: BusinessProfile | null,
  labels?: DocumentLabels,
): TemplateData => {
  return {
    invoice,
    companyName: businessProfile?.name || 'Business Name',
    companyAddress: [
      businessProfile?.address,
      businessProfile?.city,
      businessProfile?.state,
      businessProfile?.zip,
      businessProfile?.country
    ].filter(Boolean).join(', ') || '',
    companyPhone: businessProfile?.phone || '',
    bankAccountName: businessProfile?.bankAccountName,
    bankAccountNumber: businessProfile?.bankAccountNumber,
    clientName: invoice.customer?.name || 'Client Name',
    clientAddress: [
      invoice.customer?.address,
      invoice.customer?.city,
      invoice.customer?.state,
      invoice.customer?.zip,
      invoice.customer?.country
    ].filter(Boolean).join(', ') || '',
    taxRate: invoiceDisplayTaxRate(invoice),
    tax: invoice.taxAmount,
    businessLogo: businessProfile?.logoUrl || '',
    theme: businessProfile?.theme || DEFAULT_BUSINESS_THEME,
    labels: resolveDocumentLabels(labels),
  };
};

export const renderTemplateComponent = (selectedTemplate: InvoiceTemplateId, templateData: TemplateData): React.ReactElement => {
  switch (selectedTemplate) {
    case 'classic':
      return <ClassicTemplate {...templateData} />;
    case 'modern':
      return <ModernTemplate {...templateData} />;
    case 'minimal':
      return <MinimalTemplate {...templateData} />;
    case 'executive':
      return <ExecutiveTemplate {...templateData} />;
    case 'corporate':
      return <CorporateTemplate {...templateData} />;
    case 'modernpro':
      return <ModernInvoiceTemplate {...templateData} />;
    default:
      return <ClassicTemplate {...templateData} />;
  }
};

// Wrapper component for email rendering
const EmailInvoiceTemplate: React.FC<{
  selectedTemplate: InvoiceTemplateId;
  templateData: TemplateData;
}> = ({ selectedTemplate, templateData }) => {
  return (
    <div 
      style={{ 
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#ffffff',
        color: '#000000',
        maxWidth: '794px',
        margin: '0 auto',
        padding: '20px'
      }}
    >
      {renderTemplateComponent(selectedTemplate, templateData)}
    </div>
  );
};

// Create email-compatible HTML for invoice
export const createEmailCompatibleInvoiceHtml = (
  invoice: Invoice,
  businessProfile?: BusinessProfile | null,
  labels?: DocumentLabels,
): string => {
  const templateData = createTemplateData(invoice, businessProfile, labels);
  const copy = templateData.labels ?? invoiceDocumentLabels;
  const escapeBankValue = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  const bankRows = [
    ['Account name:', businessProfile?.bankAccountName?.trim()],
    ['Account number:', businessProfile?.bankAccountNumber?.trim()],
  ].filter(([, value]) => value).map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;">${label}</td><td style="overflow-wrap:anywhere;">${escapeBankValue(value!)}</td></tr>`).join('');

  
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; background-color: #ffffff;">
      <!-- Header -->
      <tr>
        <td style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px 20px; color: white;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                ${businessProfile?.logoUrl ? `<img src="${businessProfile.logoUrl}" alt="${templateData.companyName}" style="height: 40px; margin-bottom: 10px;">` : ''}
                <h1 style="margin: 0; font-size: 32px; font-weight: bold;">${copy.title}</h1>
                <p style="margin: 5px 0 0 0; font-size: 18px; opacity: 0.9;">#${invoice.invoiceNumber}</p>
              </td>
              <td style="text-align: right; vertical-align: top;">
                <p style="margin: 0; font-size: 14px; opacity: 0.9;">${templateData.companyName}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Company and Customer Info -->
      <tr>
        <td style="padding: 30px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" style="vertical-align: top;">
                <h3 style="margin: 0 0 10px 0; color: #374151; font-size: 16px;">From</h3>
                <p style="margin: 0; color: #111827; font-weight: bold; font-size: 16px;">${templateData.companyName}</p>
                ${templateData.companyAddress ? `<p style="margin: 5px 0; color: #6b7280; font-size: 14px;">${templateData.companyAddress}</p>` : ''}
                ${templateData.companyPhone ? `<p style="margin: 5px 0; color: #6b7280; font-size: 14px;">${templateData.companyPhone}</p>` : ''}
              </td>
              <td width="50%" style="vertical-align: top;">
                <h3 style="margin: 0 0 10px 0; color: #374151; font-size: 16px;">To</h3>
                <p style="margin: 0; color: #111827; font-weight: bold; font-size: 16px;">${templateData.clientName}</p>
                ${templateData.clientAddress ? `<p style="margin: 5px 0; color: #6b7280; font-size: 14px;">${templateData.clientAddress}</p>` : ''}
                ${invoice.customer?.email ? `<p style="margin: 5px 0; color: #059669; font-size: 14px;"><a href="mailto:${invoice.customer.email}" style="color: #059669; text-decoration: none;">${invoice.customer.email}</a></p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Invoice Details -->
      <tr>
        <td style="padding: 0 20px 30px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="33%" style="vertical-align: top;">
                <h4 style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">${copy.numberLabel}</h4>
                <p style="margin: 0; color: #111827; font-weight: bold;">${invoice.invoiceNumber}</p>
              </td>
              <td width="33%" style="vertical-align: top;">
                <h4 style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">${copy.dateLabel}</h4>
                <p style="margin: 0; color: #111827; font-weight: bold;">${new Date(invoice.date).toLocaleDateString()}</p>
              </td>
              <td width="33%" style="vertical-align: top;">
                <h4 style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">${copy.dueLabel}</h4>
                <p style="margin: 0; color: #111827; font-weight: bold;">${new Date(invoice.dueDate).toLocaleDateString()}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Line Items -->
      <tr>
        <td style="padding: 0 20px;">
          <table width="100%" cellpadding="12" cellspacing="0" style="border-collapse: collapse;">
            <!-- Header -->
            <tr style="background-color: #059669;">
              <th style="color: white; text-align: left; padding: 15px 12px; font-size: 14px; font-weight: bold;">Item</th>
              <th style="color: white; text-align: center; padding: 15px 12px; font-size: 14px; font-weight: bold;">Qty</th>
              <th style="color: white; text-align: right; padding: 15px 12px; font-size: 14px; font-weight: bold;">Rate</th>
              <th style="color: white; text-align: right; padding: 15px 12px; font-size: 14px; font-weight: bold;">Amount</th>
            </tr>
            <!-- Items -->
            ${invoice.items.map((item, index) => `
              <tr style="background-color: ${index % 2 === 0 ? '#f8fafc' : '#ffffff'};">
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #111827;">${item.description}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #111827;">${item.quantity}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #111827;">${invoice.currency}${item.rate.toFixed(2)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #111827; font-weight: bold;">${invoice.currency}${item.total.toFixed(2)}</td>
              </tr>
            `).join('')}
          </table>
        </td>
      </tr>
      
      <!-- Totals -->
      <tr>
        <td style="padding: 30px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="60%"></td>
              <td width="40%">
                <table width="100%" cellpadding="5" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Subtotal:</td>
                    <td style="padding: 8px 0; text-align: right; color: #111827; font-weight: bold;">${invoice.currency}${invoice.subtotal.toFixed(2)}</td>
                  </tr>
                  ${invoice.taxAmount > 0 ? `
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Tax (${templateData.taxRate}%):</td>
                      <td style="padding: 8px 0; text-align: right; color: #111827; font-weight: bold;">${invoice.currency}${invoice.taxAmount.toFixed(2)}</td>
                    </tr>
                  ` : ''}
                  ${invoice.discount > 0 ? `
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Discount:</td>
                      <td style="padding: 8px 0; text-align: right; color: #dc2626; font-weight: bold;">-${invoice.currency}${invoice.discount.toFixed(2)}</td>
                    </tr>
                  ` : ''}
                  ${invoice.additionalChargesTotal > 0 ? `
                    <tr>
                      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Additional Charges:</td>
                      <td style="padding: 8px 0; text-align: right; color: #111827; font-weight: bold;">${invoice.currency}${invoice.additionalChargesTotal.toFixed(2)}</td>
                    </tr>
                  ` : ''}
                  <tr style="border-top: 2px solid #059669;">
                    <td style="padding: 15px 0 8px 0; color: #059669; font-size: 18px; font-weight: bold;">Total:</td>
                    <td style="padding: 15px 0 8px 0; text-align: right; color: #059669; font-size: 18px; font-weight: bold;">${invoice.currency}${invoice.total.toFixed(2)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      ${copy.showPayment && bankRows ? `<tr><td style="padding:20px;"><h4>Payment details</h4><table>${bankRows}</table></td></tr>` : ''}
      <!-- Notes -->
      ${invoice.notes ? `
        <tr>
          <td style="padding: 30px 20px; background-color: #f8fafc;">
            <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 16px;">Notes</h4>
            <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">${invoice.notes}</p>
          </td>
        </tr>
      ` : ''}
      
      <!-- Terms -->
      ${invoice.terms ? `
        <tr>
          <td style="padding: 30px 20px; background-color: #f8fafc;">
            <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 16px;">Terms & Conditions</h4>
            <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">${invoice.terms}</p>
          </td>
        </tr>
      ` : ''}
    </table>
  `;
};

export const renderTemplateToHtml = async (
  invoice: Invoice,
  selectedTemplate: InvoiceTemplateId,
  businessProfile?: BusinessProfile | null
): Promise<string> => {
  // For email, use the email-compatible version
  return createEmailCompatibleInvoiceHtml(invoice, businessProfile);
};

export const createTemplateElement = (
  invoice: Invoice,
  selectedTemplate: InvoiceTemplateId,
  businessProfile?: BusinessProfile | null
): HTMLDivElement => {
  // Create a temporary container
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.top = '-9999px';
  tempContainer.style.left = '-9999px';
  tempContainer.style.width = '794px'; // A4 width
  tempContainer.style.backgroundColor = '#ffffff';
  tempContainer.style.color = '#000000';
  tempContainer.style.fontFamily = 'Arial, sans-serif';
  tempContainer.style.padding = '20px';
  
  // Create template data
  const templateData = createTemplateData(invoice, businessProfile);

  // Create root and render component
  const root = createRoot(tempContainer);
  root.render(
    <EmailInvoiceTemplate 
      selectedTemplate={selectedTemplate} 
      templateData={templateData} 
    />
  );

  // Add cleanup function to the element
  (tempContainer as any).cleanup = () => {
    root.unmount();
    if (tempContainer.parentNode) {
      tempContainer.parentNode.removeChild(tempContainer);
    }
  };

  return tempContainer;
};