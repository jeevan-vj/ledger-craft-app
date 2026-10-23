import { BankPaymentDetails } from '../BankPaymentDetails';
import { resolveDocumentLabels, type DocumentLabels } from '../documentLabels';
import React from 'react';
import { Invoice, BusinessTheme, DEFAULT_BUSINESS_THEME } from '@/types';
import { Card, CardContent } from "@/components/ui/card";
import { formatLineQuantity, showPositiveAmount } from '@/utils/invoiceLineDisplay';
import { formatCurrency, invoiceDiscountLabel } from '@/utils/invoiceUtils';
import { useIsMobile } from '@/hooks/use-mobile';

interface ModernTemplateProps {
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
  theme?: BusinessTheme;
  labels?: DocumentLabels;
}

const ModernTemplate = ({ 
  invoice, 
  companyName, 
  companyAddress, 
  companyPhone,
  bankAccountName,
  bankAccountNumber,
  clientName, 
  clientAddress, 
  taxRate, 
  tax,
  businessLogo,
  theme = DEFAULT_BUSINESS_THEME,
  labels,
}: ModernTemplateProps) => {
  const copy = resolveDocumentLabels(labels);
  const isMobile = useIsMobile();
  
  React.useEffect(() => {
    if (isMobile) {
      let meta = document.querySelector('meta[name="format-detection"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'format-detection');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', 'telephone=no, email=no');
    }
  }, [isMobile]);
  
  // Parse the client address into components
  const addressParts = clientAddress.split(',').map(part => part.trim());
  const country = addressParts.length > 0 ? addressParts[addressParts.length - 1] : '';
  
  // Parse the company address
  const companyAddressParts = companyAddress.split(',').map(part => part.trim());
  const companyCountry = companyAddressParts.length > 0 ? companyAddressParts[companyAddressParts.length - 1] : '';
  
  return (
    <div className="w-full print-template p-3">
      {/* Header with Invoice Title */}
      <div className="p-3 sm:p-4 print:p-0">
        <h3 className="text-xl sm:text-2xl font-bold" style={{ color: theme.text }}>{copy.title === 'INVOICE' ? 'Invoice' : copy.title}</h3>
      </div>
      
      {/* Company Header - Themed Background */}
      <div 
        className="text-white p-3 sm:p-4 rounded-lg mb-4 flex flex-wrap" 
        style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`, color: 'white' }}
      >
        <div className="w-1/2">
          {businessLogo && (
            <img 
              src={businessLogo} 
              alt={companyName}
              className="h-16 w-16 object-cover rounded-full mb-2"
              style={{ maxHeight: '64px', maxWidth: '64px' }}
            />
          )}
        </div>
        <div className="w-1/2 text-right">
          <p className="font-semibold text-sm sm:text-base" style={{ color: 'white' }}>{companyName}</p>
          <p className="text-xs sm:text-sm no-underline no-autolink" style={{ color: 'white' }}>{companyAddressParts.join(', ')}</p>
          {companyPhone && (
            isMobile ? (
              <span className="text-xs mt-1 no-autolink" style={{ color: 'white' }}>{companyPhone}</span>
            ) : (
              <p className="text-xs mt-1" style={{ color: 'white' }}>{companyPhone}</p>
            )
          )}
        </div>
      </div>
      
      {/* Client and Invoice Info */}
      <div className="flex flex-wrap mb-4">
        {/* Bill To Section */}
        <div className="w-1/2 pr-2">
          <p className="font-semibold text-sm sm:text-base mb-1" style={{ color: theme.text }}>Bill To</p>
          <p className="text-sm font-medium" style={{ color: theme.text }}>{clientName}</p>
          <p className="text-xs sm:text-sm no-underline no-autolink" style={{ color: theme.textLight }}>{addressParts.join(', ')}</p>
          {invoice.customer?.phone && (
            isMobile ? (
              <span className="text-xs sm:text-sm no-autolink" style={{ color: theme.textLight }}>{invoice.customer.phone}</span>
            ) : (
              <p className="text-xs sm:text-sm" style={{ color: theme.textLight }}>{invoice.customer.phone}</p>
            )
          )}
          {invoice.customer?.email && (
            isMobile ? (
              <span className="text-xs sm:text-sm no-autolink" style={{ color: theme.textLight }}>{invoice.customer.email}</span>
            ) : (
              <p className="text-xs sm:text-sm" style={{ color: theme.textLight }}>{invoice.customer.email}</p>
            )
          )}
        </div>
        
        {/* Invoice Details */}
        <div className="w-1/2">
          <div className="text-xs sm:text-sm">
            <div className="flex justify-between mb-1">
              <span className="font-semibold" style={{ color: theme.text }}>{copy.numberLabel}:</span>
              <span style={{ color: theme.text }}>{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="font-semibold" style={{ color: theme.text }}>{copy.dateLabel}:</span>
              <span style={{ color: theme.text }}>{new Date(invoice.date).toLocaleDateString('en-US', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric'
              })}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="font-semibold" style={{ color: theme.text }}>{copy.dueLabel}:</span>
              <span style={{ color: theme.text }}>{new Date(invoice.dueDate).toLocaleDateString('en-US', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric'
              })}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Items Table */}
      <div className="w-full overflow-hidden rounded-lg mb-4">
        <table className="w-full text-xs sm:text-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-white" style={{ backgroundColor: theme.primary }}>
              <th className="py-2 px-2 text-left" style={{ padding: '8px', textAlign: 'left', color: 'white' }}>Items</th>
              <th className="py-2 px-1 text-right" style={{ padding: '8px', textAlign: 'right', color: 'white' }}>Quantity</th>
              <th className="py-2 px-1 text-right" style={{ padding: '8px', textAlign: 'right', color: 'white' }}>Price</th>
              <th className="py-2 px-2 text-right" style={{ padding: '8px', textAlign: 'right', color: 'white' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={index} className="border-b" style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td className="py-2 px-2 text-left" style={{ padding: '8px', textAlign: 'left', color: theme.text }}>
                  {item.description}
                  {/* Only render details section if it exists as a property in the item */}
                  {(item as any).details && (
                    <div className="text-xs break-words" style={{ fontSize: '10px', color: theme.textLight }}>
                      {(item as any).details}
                    </div>
                  )}
                </td>
                <td className="py-2 px-1 text-right" style={{ padding: '8px', textAlign: 'right', color: theme.text }}>{formatLineQuantity(item.quantity, item.unit)}</td>
                <td className="py-2 px-1 text-right" style={{ padding: '8px', textAlign: 'right', color: theme.text }}>{formatCurrency(item.rate, invoice.currency)}</td>
                <td className="py-2 px-2 text-right" style={{ padding: '8px', textAlign: 'right', color: theme.text }}>{formatCurrency(item.quantity * item.rate, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Totals */}
      <div className="flex justify-end mt-4">
        <div className="w-full sm:w-1/2 text-xs sm:text-sm">
          <div className="flex justify-between py-1">
            <span className="font-semibold" style={{ color: theme.text }}>Subtotal:</span>
            <span style={{ color: theme.text }}>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
          </div>
          
          {showPositiveAmount(tax) && (
            <div className="flex justify-between py-1">
              <span className="font-semibold" style={{ color: theme.text }}>Tax ({taxRate}%):</span>
              <span style={{ color: theme.text }}>{formatCurrency(tax, invoice.currency)}</span>
            </div>
          )}
          
          {/* Individual Additional Charges */}
          {invoice.additionalChargesList && invoice.additionalChargesList.length > 0 ? (
            <>
              {invoice.additionalChargesList.map((charge, index) => {
                if (!charge.isActive) return null;
                const chargeAmount = charge.calculationType === 'percentage' 
                  ? (invoice.subtotal * charge.amount) / 100
                  : charge.amount;
                if (!showPositiveAmount(chargeAmount)) return null;
                
                return (
                  <div key={index} className="flex justify-between py-1">
                    <span className="font-semibold" style={{ color: theme.text }}>{charge.label}:</span>
                    <span style={{ color: theme.text }}>{formatCurrency(chargeAmount, invoice.currency)}</span>
                  </div>
                );
              })}
            </>
          ) : (
            /* Fallback to legacy additional charges */
            showPositiveAmount(invoice.additionalCharges) && (
              <div className="flex justify-between py-1">
                <span className="font-semibold" style={{ color: theme.text }}>Additional Charges:</span>
                <span style={{ color: theme.text }}>{formatCurrency(invoice.additionalCharges, invoice.currency)}</span>
              </div>
            )
          )}
          
          {showPositiveAmount(invoice.discount) && (
            <div className="flex justify-between py-1">
              <span className="font-semibold" style={{ color: theme.text }}>{invoiceDiscountLabel(invoice)}:</span>
              <span style={{ color: theme.accent }}>-{formatCurrency(invoice.discount, invoice.currency)}</span>
            </div>
          )}
          
          <div className="flex justify-between py-1 font-bold">
            <span style={{ color: theme.text }}>Total:</span>
            <span style={{ color: theme.primary }}>{formatCurrency(invoice.total, invoice.currency)}</span>
          </div>
        </div>
      </div>
      
      {copy.showPayment ? <BankPaymentDetails bankAccountName={bankAccountName} bankAccountNumber={bankAccountNumber} /> : null}
      {/* Notes */}
      {invoice.notes && (
        <div className="mt-4 notes-section">
          <h4 className="font-semibold text-sm mb-1" style={{ color: theme.text }}>Notes:</h4>
          <p className="text-xs sm:text-sm whitespace-pre-wrap break-words" style={{ color: theme.textLight }}>{invoice.notes}</p>
        </div>
      )}
      
      {/* Terms */}
      {invoice.terms && (
        <div className="mt-4 terms-section">
          <h4 className="font-semibold text-sm mb-1" style={{ color: theme.text }}>Terms:</h4>
          <p className="text-xs sm:text-sm whitespace-pre-wrap break-words" style={{ color: theme.textLight }}>{invoice.terms}</p>
        </div>
      )}
    </div>
  );
};

export default ModernTemplate;
