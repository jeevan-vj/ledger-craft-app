import { BankPaymentDetails } from '../BankPaymentDetails';
import { resolveDocumentLabels, type DocumentLabels } from '../documentLabels';
import React from 'react';
import { Invoice } from '@/types';
import { formatLineQuantity, showPositiveAmount } from '@/utils/invoiceLineDisplay';
import { formatCurrency, invoiceDiscountLabel } from '@/utils/invoiceUtils';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface ClassicTemplateProps {
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
  labels?: DocumentLabels;
}

const ClassicTemplate = ({ 
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
  labels,
}: ClassicTemplateProps) => {
  const copy = resolveDocumentLabels(labels);
  const isMobile = useIsMobile();
  
  // Add meta tag to disable auto-linking on mobile
  React.useEffect(() => {
    if (isMobile) {
      let meta = document.querySelector('meta[name="format-detection"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'format-detection');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', 'telephone=no, email=no');
      return () => {
        // Optionally clean up if needed
        // meta.remove();
      };
    }
  }, [isMobile]);
  
  // Parse the client address into components
  const addressParts = clientAddress.split(',').map(part => part.trim());
  const country = addressParts.length > 0 ? addressParts[addressParts.length - 1] : '';
  
  // Parse the company address
  const companyAddressParts = companyAddress.split(',').map(part => part.trim());
  const companyCountry = companyAddressParts.length > 0 ? companyAddressParts[companyAddressParts.length - 1] : '';
  
  return (
    <div className="w-full print-template mb-4">
      {/* Header */}
      <div className="p-3 sm:p-4">
        <div className="flex justify-between items-start">
          <div>
            {businessLogo && (
              <div className="mb-2">
                <img 
                  src={businessLogo} 
                  alt={companyName} 
                  className="h-40 w-40 object-contain rounded-full"
                />
              </div>
            )}
            <h1 className={cn("text-xl sm:text-2xl font-bold text-gray-800", businessLogo ? "mt-1" : "")}>
              {copy.title}
            </h1>
            <p className="text-sm sm:text-base text-gray-600">#{invoice.invoiceNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-sm sm:text-base font-semibold">{companyName}</p>
            <p className="text-xs sm:text-sm text-gray-600 no-underline no-autolink">{companyAddressParts.join(', ')}</p>
            {companyPhone && (
              isMobile ? (
                <span className="text-xs sm:text-sm text-gray-600 no-autolink">{companyPhone}</span>
              ) : (
                <p className="text-xs sm:text-sm text-gray-600">{companyPhone}</p>
              )
            )}
          </div>
        </div>
      </div>

      {/* Client Info */}
      <div className="flex flex-wrap mt-4 px-3 sm:px-4">
        <div className="w-1/2">
          <p className="font-semibold text-sm sm:text-base mb-1">Bill To:</p>
          <p className="text-sm font-medium">{clientName}</p>
          <p className="text-xs sm:text-sm no-underline no-autolink">{addressParts.join(', ')}</p>
          {invoice.customer?.phone && (
            isMobile ? (
              <span className="text-xs sm:text-sm no-autolink">{invoice.customer.phone}</span>
            ) : (
              <p className="text-xs sm:text-sm">{invoice.customer.phone}</p>
            )
          )}
          {/* Add line break after phone for mobile if email exists */}
          {isMobile && invoice.customer?.phone && invoice.customer?.email && <br />}
          {invoice.customer?.email && (
            isMobile ? (
              <span className="text-xs sm:text-sm no-autolink">{invoice.customer.email}</span>
            ) : (
              <p className="text-xs sm:text-sm">{invoice.customer.email}</p>
            )
          )}
        </div>
        
        {/* Invoice Details */}
        <div className="w-1/2">
          <div className="text-xs sm:text-sm">
            <div className="flex justify-between mb-1">
              <span className="font-semibold">{copy.numberLabel}:</span>
              <span>{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="font-semibold">{copy.dateLabel}:</span>
              <span>{new Date(invoice.date).toLocaleDateString('en-US', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric'
              })}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="font-semibold">{copy.dueLabel}:</span>
              <span>{new Date(invoice.dueDate).toLocaleDateString('en-US', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric'
              })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="w-full overflow-hidden px-3 sm:px-4 mt-4">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-2 px-2 text-left font-semibold">Item</th>
              <th className="py-2 px-1 text-right font-semibold">Quantity</th>
              <th className="py-2 px-1 text-right font-semibold">Price</th>
              <th className="py-2 px-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={index} className="border-b">
                <td className="py-2 px-2 text-left">
                  {item.description}
                  {/* Only render details section if it exists as a property in the item */}
                  {(item as any).details && (
                    <div className="text-xs text-gray-500 break-words">
                      {(item as any).details}
                    </div>
                  )}
                </td>
                <td className="py-2 px-1 text-right">{formatLineQuantity(item.quantity, item.unit)}</td>
                <td className="py-2 px-1 text-right">{formatCurrency(item.rate, invoice.currency)}</td>
                <td className="py-2 px-2 text-right">{formatCurrency(item.quantity * item.rate, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mt-4 px-3 sm:px-4">
        <div className="w-full sm:w-1/2 text-xs sm:text-sm">
          <div className="flex justify-between py-1">
            <span className="font-semibold">Subtotal:</span>
            <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
          </div>
          
          {showPositiveAmount(tax) && (
            <div className="flex justify-between py-1">
              <span className="font-semibold">Tax ({taxRate}%):</span>
              <span>{formatCurrency(tax, invoice.currency)}</span>
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
                    <span className="font-semibold">{charge.label}:</span>
                    <span>{formatCurrency(chargeAmount, invoice.currency)}</span>
                  </div>
                );
              })}
            </>
          ) : (
            /* Fallback to legacy additional charges */
            showPositiveAmount(invoice.additionalCharges) && (
              <div className="flex justify-between py-1">
                <span className="font-semibold">Additional Charges:</span>
                <span>{formatCurrency(invoice.additionalCharges, invoice.currency)}</span>
              </div>
            )
          )}
          
              {showPositiveAmount(invoice.discount) && (
            <div className="flex justify-between py-1">
              <span className="font-semibold">{invoiceDiscountLabel(invoice)}:</span>
              <span>-{formatCurrency(invoice.discount, invoice.currency)}</span>
            </div>
          )}
          
          <div className="flex justify-between py-1 font-bold">
            <span>Total:</span>
            <span>{formatCurrency(invoice.total, invoice.currency)}</span>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4">
        {copy.showPayment ? <BankPaymentDetails bankAccountName={bankAccountName} bankAccountNumber={bankAccountNumber} /> : null}
      </div>
      {/* Notes */}
      {invoice.notes && (
        <div className="mt-4 px-3 sm:px-4">
          <h4 className="font-semibold text-sm mb-1">Notes:</h4>
          <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">{invoice.notes}</p>
        </div>
      )}
      
      {/* Terms */}
      {invoice.terms && (
        <div className="mt-4 px-3 sm:px-4">
          <h4 className="font-semibold text-sm mb-1">Terms:</h4>
          <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">{invoice.terms}</p>
        </div>
      )}
    </div>
  );
};

export default ClassicTemplate;
