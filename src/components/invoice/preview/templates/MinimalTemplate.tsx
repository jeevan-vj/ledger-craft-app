import { BankPaymentDetails } from '../BankPaymentDetails';
import { resolveDocumentLabels, type DocumentLabels } from '../documentLabels';
import React from 'react';
import { Invoice, BusinessTheme, DEFAULT_BUSINESS_THEME } from '@/types';
import { Card, CardContent } from "@/components/ui/card";
import { formatLineQuantity, showPositiveAmount } from '@/utils/invoiceLineDisplay';
import { formatCurrency, invoiceDiscountLabel } from '@/utils/invoiceUtils';
import { useIsMobile } from '@/hooks/use-mobile';

interface MinimalTemplateProps {
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

const MinimalTemplate = ({ 
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
}: MinimalTemplateProps) => {
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
  
  return (
    <Card className="p-4 sm:p-8 minimal-invoice-template print-template" style={{ backgroundColor: theme.surface }}>
      <CardContent className="p-0">
        <div className="w-full mx-auto space-y-4 sm:space-y-6">
          {/* Header with Logo */}
          <div className="text-center mb-4 sm:mb-8">
            {businessLogo && (
              <div className="flex justify-center mb-3 sm:mb-4">
                <img 
                  src={businessLogo} 
                  alt={companyName} 
                  className="max-h-10 sm:max-h-12 object-contain rounded-full invoice-logo"
                  crossOrigin="anonymous"
                />
              </div>
            )}
            <h1 className="text-xl sm:text-2xl font-light tracking-wide" style={{ color: theme.text }}>{copy.title}</h1>
            <p className="mt-1 sm:mt-2 text-sm sm:text-base" style={{ color: theme.primary }}>#{invoice.invoiceNumber}</p>
            {copy.title === 'INVOICE' ? null : (
              <p className="mt-1 text-xs sm:text-sm" style={{ color: theme.textLight }}>
                {copy.dueLabel}: {new Date(invoice.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Company and Client Info */}
          <div className="flex justify-between text-sm invoice-parties">
            <div className="w-1/2 pr-4">
              <p className="font-medium mb-1" style={{ color: theme.text }}>{companyName}</p>
              <p className="text-xs sm:text-sm whitespace-pre-wrap no-underline no-autolink" style={{ color: theme.textLight }}>{companyAddress}</p>
              {companyPhone && (
                isMobile ? (
                  <span className="text-xs sm:text-sm no-autolink" style={{ color: theme.textLight }}>{companyPhone}</span>
                ) : (
                  <p className="text-xs sm:text-sm" style={{ color: theme.textLight }}>{companyPhone}</p>
                )
              )}
            </div>
            <div className="w-1/2 text-right">
              <p className="font-medium mb-1" style={{ color: theme.text }}>{clientName}</p>
              <p className="text-xs sm:text-sm whitespace-pre-wrap no-underline no-autolink" style={{ color: theme.textLight }}>{clientAddress}</p>
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
          </div>

          {/* Invoice Details */}
          <div className="mt-8 sm:mt-12 invoice-items-table">
            <table className="w-full text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: theme.textLight + '30' }}>
                  <th className="py-2 text-left font-medium" style={{ color: theme.text }}>Description</th>
                  <th className="py-2 text-right font-medium" style={{ color: theme.text }}>Qty</th>
                  <th className="py-2 text-right font-medium" style={{ color: theme.text }}>Rate</th>
                  <th className="py-2 text-right font-medium" style={{ color: theme.text }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={index} className="border-b last:border-b-0" style={{ borderColor: theme.textLight + '20' }}>
                    <td className="py-2 sm:py-3" style={{ color: theme.text }}>
                      {item.description}
                      {/* Cast item to any and check for details */}
                      {((item as any).details) && (
                        <div className="text-xs break-words" style={{ color: theme.textLight }}>
                          {(item as any).details}
                        </div>
                      )}
                    </td>
                    <td className="py-2 sm:py-3 text-right" style={{ color: theme.text }}>{formatLineQuantity(item.quantity, item.unit)}</td>
                    <td className="py-2 sm:py-3 text-right" style={{ color: theme.text }}>{formatCurrency(item.rate, invoice.currency)}</td>
                    <td className="py-2 sm:py-3 text-right" style={{ color: theme.text }}>{formatCurrency(item.quantity * item.rate, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-6 sm:mt-8 invoice-totals">
            <div className="flex flex-col items-end space-y-1 sm:space-y-2">
              <div className="flex justify-between w-36 sm:w-48">
                <span className="text-xs sm:text-sm" style={{ color: theme.textLight }}>Subtotal</span>
                <span className="text-xs sm:text-sm" style={{ color: theme.text }}>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              {showPositiveAmount(tax) && (
              <div className="flex justify-between w-36 sm:w-48">
                <span className="text-xs sm:text-sm" style={{ color: theme.textLight }}>Tax ({taxRate}%)</span>
                <span className="text-xs sm:text-sm" style={{ color: theme.text }}>{formatCurrency(tax, invoice.currency)}</span>
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
                      <div key={index} className="flex justify-between w-36 sm:w-48">
                        <span className="text-xs sm:text-sm" style={{ color: theme.textLight }}>{charge.label}</span>
                        <span className="text-xs sm:text-sm" style={{ color: theme.text }}>{formatCurrency(chargeAmount, invoice.currency)}</span>
                      </div>
                    );
                  })}
                </>
              ) : (
                /* Fallback to legacy additional charges */
                showPositiveAmount(invoice.additionalCharges) && (
                  <div className="flex justify-between w-36 sm:w-48">
                    <span className="text-xs sm:text-sm" style={{ color: theme.textLight }}>Additional Charges</span>
                    <span className="text-xs sm:text-sm" style={{ color: theme.text }}>{formatCurrency(invoice.additionalCharges, invoice.currency)}</span>
                  </div>
                )
              )}
              
              {showPositiveAmount(invoice.discount) && (
                <div className="flex justify-between w-36 sm:w-48">
                  <span className="text-xs sm:text-sm" style={{ color: theme.textLight }}>{invoiceDiscountLabel(invoice)}</span>
                  <span className="text-xs sm:text-sm" style={{ color: theme.accent }}>-{formatCurrency(invoice.discount, invoice.currency)}</span>
                </div>
              )}
              
              <div className="flex justify-between w-36 sm:w-48 font-medium border-t pt-1 sm:pt-2 mt-1 sm:mt-2" style={{ borderColor: theme.textLight + '30' }}>
                <span className="text-sm sm:text-base" style={{ color: theme.text }}>Total</span>
                <span className="text-sm sm:text-base" style={{ color: theme.primary }}>{formatCurrency(invoice.total, invoice.currency)}</span>
              </div>
            </div>
          </div>

          {copy.showPayment ? <BankPaymentDetails bankAccountName={bankAccountName} bankAccountNumber={bankAccountNumber} /> : null}
          {/* Notes */}
          {invoice.notes && (
            <div className="mt-8 sm:mt-12 pt-4 sm:pt-6 border-t text-xs sm:text-sm notes-section" style={{ borderColor: theme.textLight + '30' }}>
              <h2 className="font-medium mb-1 sm:mb-2" style={{ color: theme.text }}>Notes</h2>
              <p className="whitespace-pre-wrap" style={{ color: theme.textLight }}>{invoice.notes}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MinimalTemplate;
