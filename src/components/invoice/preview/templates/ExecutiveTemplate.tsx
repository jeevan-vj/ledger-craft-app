import './ExecutiveTemplate.css';
import { BankPaymentDetails } from '../BankPaymentDetails';
import React from 'react';
import { formatCurrency, invoiceDiscountLabel } from '@/utils/invoiceUtils';
import { Invoice, LineItem, BusinessTheme, DEFAULT_BUSINESS_THEME } from '@/types';
import { PDFCard, PDFCardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';

interface ExecutiveTemplateProps {
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
}

const ExecutiveTemplate = ({
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
  theme = DEFAULT_BUSINESS_THEME
}: ExecutiveTemplateProps) => {
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
    <div className="executive-invoice p-3 sm:p-8 max-w-4xl mx-auto" style={{ backgroundColor: theme.surface, color: theme.text }}>
      {/* Header */}
      <div className="border-b-2 pb-4 sm:pb-6 mb-4 sm:mb-6" style={{ borderColor: theme.textLight + '40' }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            {businessLogo && (
              <div className="mb-2">
                <img 
                  src={businessLogo} 
                  alt={companyName} 
                  className="h-20 w-20 sm:h-14 sm:w-14 object-contain rounded-full" 
                />
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-light tracking-wider mb-1" style={{ color: theme.text }}>INVOICE</h1>
            <p className="text-base sm:text-lg font-semibold break-words" style={{ color: theme.primary }}>#{invoice.invoiceNumber}</p>
          </div>
          <div className="min-w-0 sm:text-right">
            <h2 className="text-lg sm:text-xl font-bold" style={{ color: theme.text }}>{companyName}</h2>
            <p className="text-xs sm:text-sm whitespace-pre-line no-underline no-autolink" style={{ color: theme.textLight }}>{companyAddress}</p>
            {companyPhone && (
              isMobile ? (
                <span className="text-xs sm:text-sm no-autolink" style={{ color: theme.textLight }}>{companyPhone}</span>
              ) : (
                <p className="text-xs sm:text-sm" style={{ color: theme.textLight }}>{companyPhone}</p>
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
      </div>

      {/* Client & Invoice Info */}
      <div className="grid grid-cols-2 gap-4 sm:gap-8 mb-6 sm:mb-8">
        <div>
          <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-wider mb-1 sm:mb-2" style={{ color: theme.textLight }}>Billed To</h3>
          <h4 className="text-base sm:text-lg font-bold mb-1" style={{ color: theme.text }}>{clientName}</h4>
          <p className="text-xs sm:text-sm whitespace-pre-line no-underline no-autolink" style={{ color: theme.textLight }}>{clientAddress}</p>
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
        <div className="text-right">
          <div className="mb-2 sm:mb-3">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: theme.textLight }}>Invoice Date</p>
            <p className="text-sm sm:text-lg" style={{ color: theme.text }}>{new Date(invoice.date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: theme.textLight }}>Due Date</p>
            <p className="text-sm sm:text-lg" style={{ color: theme.text }}>{new Date(invoice.dueDate).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Items */}
      <PDFCard className="mb-6 sm:mb-8">
        <PDFCardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="executive-items w-full">
              <thead className="text-left" style={{ backgroundColor: theme.background }}>
                <tr>
                  <th className="py-3 sm:py-4 px-3 sm:px-6 font-semibold uppercase tracking-wider text-xs" style={{ color: theme.textLight }}>Description</th>
                  <th className="py-3 sm:py-4 px-2 sm:px-6 font-semibold uppercase tracking-wider text-xs" style={{ color: theme.textLight }}>Qty</th>
                  <th className="py-3 sm:py-4 px-2 sm:px-6 font-semibold uppercase tracking-wider text-xs" style={{ color: theme.textLight }}>Rate</th>
                  <th className="py-3 sm:py-4 px-3 sm:px-6 font-semibold uppercase tracking-wider text-xs text-right" style={{ color: theme.textLight }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item: LineItem, index: number) => (
                  <tr key={item.id} style={{ backgroundColor: index % 2 === 0 ? theme.surface : theme.background }}>
                    <td className="py-2 sm:py-3 px-3 sm:px-6 border-t" style={{ borderColor: theme.textLight + '30', color: theme.text }}>
                      {item.description}
                      {/* Only render details if it exists */}
                      {('details' in item && typeof item.details === 'string') && (
                        <div className="text-xs break-words" style={{ color: theme.textLight }}>
                          {item.details}
                        </div>
                      )}
                    </td>
                    <td className="py-2 sm:py-3 px-2 sm:px-6 border-t" style={{ borderColor: theme.textLight + '30', color: theme.text }}><span className="item-mobile-label">Qty</span>{item.quantity} {item.unit}</td>
                    <td className="py-2 sm:py-3 px-2 sm:px-6 border-t" style={{ borderColor: theme.textLight + '30', color: theme.text }}><span className="item-mobile-label">Rate</span>{formatCurrency(item.rate, invoice.currency)}<wbr />/{item.rateUnit || item.unit}</td>
                    <td className="py-2 sm:py-3 px-3 sm:px-6 border-t text-right" style={{ borderColor: theme.textLight + '30', color: theme.text }}><span className="item-mobile-label">Amount</span>{formatCurrency(item.total || item.quantity * item.rate, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PDFCardContent>
      </PDFCard>

      {/* Summary */}
      <div className="flex justify-end mb-6 sm:mb-8">
        <div className="w-36 sm:w-64">
          <div className="flex justify-between py-1 sm:py-2 text-xs sm:text-sm">
            <span className="font-medium" style={{ color: theme.text }}>Subtotal:</span>
            <span style={{ color: theme.text }}>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
          </div>
          <div className="flex justify-between py-1 sm:py-2 text-xs sm:text-sm">
            <span className="font-medium" style={{ color: theme.text }}>Tax ({taxRate}%):</span>
            <span style={{ color: theme.text }}>{formatCurrency(tax, invoice.currency)}</span>
          </div>
          
          {/* Individual Additional Charges */}
          {invoice.additionalChargesList && invoice.additionalChargesList.length > 0 ? (
            <>
              {invoice.additionalChargesList.map((charge, index) => {
                if (!charge.isActive) return null;
                const chargeAmount = charge.calculationType === 'percentage' 
                  ? (invoice.subtotal * charge.amount) / 100
                  : charge.amount;
                
                return (
                  <div key={index} className="flex justify-between py-1 sm:py-2 text-xs sm:text-sm">
                    <span className="font-medium" style={{ color: theme.text }}>{charge.label}:</span>
                    <span style={{ color: theme.text }}>{formatCurrency(chargeAmount, invoice.currency)}</span>
                  </div>
                );
              })}
            </>
          ) : (
            /* Fallback to legacy additional charges */
            invoice.additionalCharges && invoice.additionalCharges > 0 && (
              <div className="flex justify-between py-1 sm:py-2 text-xs sm:text-sm">
                <span className="font-medium" style={{ color: theme.text }}>Additional Charges:</span>
                <span style={{ color: theme.text }}>{formatCurrency(invoice.additionalCharges, invoice.currency)}</span>
              </div>
            )
          )}
          
          {invoice.discount && invoice.discount > 0 && (
            <div className="flex justify-between py-1 sm:py-2 text-xs sm:text-sm">
              <span className="font-medium" style={{ color: theme.text }}>{invoiceDiscountLabel(invoice)}:</span>
              <span style={{ color: theme.accent }}>-{formatCurrency(invoice.discount, invoice.currency)}</span>
            </div>
          )}
          <div className="flex justify-between py-2 sm:py-3 border-t-2 mt-1 text-xs sm:text-sm" style={{ borderColor: theme.textLight + '50' }}>
            <span className="font-bold" style={{ color: theme.text }}>Total:</span>
            <span className="font-bold" style={{ color: theme.primary }}>{formatCurrency(invoice.total, invoice.currency)}</span>
          </div>
        </div>
      </div>
      
      <BankPaymentDetails bankAccountName={bankAccountName} bankAccountNumber={bankAccountNumber} />
      {/* Notes & Terms */}
      {(invoice.notes || invoice.terms) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mt-4 sm:mt-6 border-t pt-4 sm:pt-6" style={{ borderColor: theme.textLight + '40' }}>
          {invoice.notes && (
            <div>
              <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider mb-1 sm:mb-2" style={{ color: theme.textLight }}>Notes</h4>
              <p className="text-xs sm:text-sm whitespace-pre-line notes-section" style={{ color: theme.text }}>{invoice.notes}</p>
            </div>
          )}
          {invoice.terms && (
            <div>
              <h4 className="text-xs sm:text-sm font-semibold uppercase tracking-wider mb-1 sm:mb-2" style={{ color: theme.textLight }}>Terms & Conditions</h4>
              <p className="text-xs sm:text-sm whitespace-pre-line" style={{ color: theme.text }}>{invoice.terms}</p>
            </div>
          )}
        </div>
      )}
      
      {/* Footer */}
      <div className="border-t mt-6 sm:mt-8 pt-4 sm:pt-6 text-center text-xs sm:text-sm" style={{ borderColor: theme.textLight + '40', color: theme.textLight }}>
        <p>Thank you for your business</p>
      </div>
    </div>
  );
};

export default ExecutiveTemplate;
