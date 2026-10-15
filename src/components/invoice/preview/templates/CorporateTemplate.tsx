import { BankPaymentDetails } from '../BankPaymentDetails';
import React from 'react';
import { formatCurrency, invoiceDiscountLabel } from '@/utils/invoiceUtils';
import { Invoice, LineItem, BusinessTheme, DEFAULT_BUSINESS_THEME } from '@/types';
import { PDFCard, PDFCardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';

interface CorporateTemplateProps {
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

const CorporateTemplate = ({
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
}: CorporateTemplateProps) => {
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

  // Get status color
  const getStatusColor = () => {
    switch (invoice.status) {
      case 'paid': return { backgroundColor: theme.accent + '20', color: theme.accent };
      case 'overdue': return { backgroundColor: '#fecaca', color: '#dc2626' };
      case 'sent': return { backgroundColor: theme.primary + '20', color: theme.primary };
      default: return { backgroundColor: theme.textLight + '20', color: theme.textLight };
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto" style={{ backgroundColor: theme.surface, color: theme.text }}>
      {/* Header with accent color */}
      <div className="text-white p-4 sm:p-6 mb-4 sm:mb-8 rounded-lg" style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }}>
        <div className="flex justify-between items-start">
          {businessLogo && (
            <div className="mb-2">
              <img 
                src={businessLogo} 
                alt={companyName} 
                className="h-20 w-20 sm:h-12 sm:w-12 object-contain rounded-full"
              />
            </div>
          )}
          <div>
            <h1 className="text-xl sm:text-3xl font-bold mb-1">INVOICE</h1>
            <p className="text-sm sm:text-lg">#{invoice.invoiceNumber}</p>
          </div>
          <div className="text-right">
            {/* <span className="inline-block px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold capitalize" style={getStatusColor()}>
              {invoice.status}
            </span> */}
            {invoice.customer?.email && (
              isMobile ? (
                <span className="text-xs sm:text-sm no-autolink text-white">{invoice.customer.email}</span>
              ) : (
                <p className="text-xs sm:text-sm text-white">{invoice.customer.email}</p>
              )
            )}
          </div>
        </div>
      </div>

      {/* Company & Client Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-4 sm:mb-8">
        <div>
          <div className="mb-4 sm:mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-1 sm:mb-2" style={{ color: theme.textLight }}>From</h3>
            <h4 className="text-lg sm:text-xl font-bold mb-1" style={{ color: theme.text }}>{companyName}</h4>
            <p className="text-xs sm:text-sm whitespace-pre-line no-underline no-autolink" style={{ color: theme.textLight }}>{companyAddress}</p>
            {companyPhone && (
              isMobile ? (
                <span className="text-xs sm:text-sm no-autolink" style={{ color: theme.textLight }}>{companyPhone}</span>
              ) : (
                <p className="text-xs sm:text-sm" style={{ color: theme.textLight }}>{companyPhone}</p>
              )
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-1 sm:mb-2" style={{ color: theme.textLight }}>To</h3>
            <h4 className="text-lg sm:text-xl font-bold mb-1" style={{ color: theme.text }}>{clientName}</h4>
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
        </div>
        <div className="p-3 sm:p-6 rounded-lg" style={{ backgroundColor: theme.background }}>
          <div className="mb-3 sm:mb-4">
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5 sm:mb-1" style={{ color: theme.textLight }}>Invoice Number</p>
            <p className="text-sm sm:text-lg font-medium" style={{ color: theme.text }}>{invoice.invoiceNumber}</p>
          </div>
          <div className="mb-3 sm:mb-4">
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5 sm:mb-1" style={{ color: theme.textLight }}>Invoice Date</p>
            <p className="text-sm sm:text-lg font-medium" style={{ color: theme.text }}>{new Date(invoice.date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5 sm:mb-1" style={{ color: theme.textLight }}>Due Date</p>
            <p className="text-sm sm:text-lg font-medium" style={{ color: theme.text }}>{new Date(invoice.dueDate).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Items */}
      <PDFCard className="mb-4 sm:mb-8 border rounded-lg overflow-hidden" style={{ borderColor: theme.textLight + '30' }}>
        <PDFCardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-white text-left" style={{ backgroundColor: theme.primary }}>
                <tr>
                  <th className="py-3 sm:py-4 px-3 sm:px-6 font-bold uppercase tracking-wider text-xs">Item</th>
                  <th className="py-3 sm:py-4 px-2 sm:px-6 font-bold uppercase tracking-wider text-xs">Qty</th>
                  <th className="py-3 sm:py-4 px-2 sm:px-6 font-bold uppercase tracking-wider text-xs">Rate</th>
                  <th className="py-3 sm:py-4 px-3 sm:px-6 font-bold uppercase tracking-wider text-xs text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item: LineItem, index: number) => (
                  <tr key={item.id} style={{ backgroundColor: index % 2 === 0 ? theme.surface : theme.background }}>
                    <td className="py-2 sm:py-4 px-3 sm:px-6 border-t" style={{ borderColor: theme.textLight + '30', color: theme.text }}>
                      {item.description}
                      {/* Only render details if it exists */}
                      {(item as any).details && (
                        <div className="text-xs break-words" style={{ color: theme.textLight }}>
                          {(item as any).details}
                        </div>
                      )}
                    </td>
                    <td className="py-2 sm:py-4 px-2 sm:px-6 border-t" style={{ borderColor: theme.textLight + '30', color: theme.text }}>{item.quantity} {item.unit}</td>
                    <td className="py-2 sm:py-4 px-2 sm:px-6 border-t" style={{ borderColor: theme.textLight + '30', color: theme.text }}>{formatCurrency(item.rate, invoice.currency)}/{item.rateUnit || item.unit}</td>
                    <td className="py-2 sm:py-4 px-3 sm:px-6 border-t text-right" style={{ borderColor: theme.textLight + '30', color: theme.text }}>{formatCurrency(item.total || item.quantity * item.rate, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PDFCardContent>
      </PDFCard>

      {/* Summary */}
      <div className="flex justify-end mb-4 sm:mb-8">
        <div className="w-48 sm:w-72 p-3 sm:p-6 rounded-lg" style={{ backgroundColor: theme.background }}>
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
          <div className="flex justify-between py-2 sm:py-3 border-t mt-1" style={{ borderColor: theme.textLight + '50' }}>
            <span className="text-sm sm:text-lg font-bold" style={{ color: theme.text }}>Total:</span>
            <span className="text-sm sm:text-lg font-bold" style={{ color: theme.primary }}>{formatCurrency(invoice.total, invoice.currency)}</span>
          </div>
        </div>
      </div>
      
      <BankPaymentDetails bankAccountName={bankAccountName} bankAccountNumber={bankAccountNumber} />
      {/* Notes & Terms */}
      {(invoice.notes || invoice.terms) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mt-4 sm:mt-6 border-t pt-4 sm:pt-6" style={{ borderColor: theme.textLight + '40' }}>
          {invoice.notes && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-1 sm:mb-2" style={{ color: theme.textLight }}>Notes</h4>
              <p className="text-xs sm:text-sm whitespace-pre-line notes-section" style={{ color: theme.text }}>{invoice.notes}</p>
            </div>
          )}
          {invoice.terms && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-1 sm:mb-2" style={{ color: theme.textLight }}>Terms & Conditions</h4>
              <p className="text-xs sm:text-sm whitespace-pre-line" style={{ color: theme.text }}>{invoice.terms}</p>
            </div>
          )}
        </div>
      )}
      
      {/* Footer */}
      <div className="border-t mt-6 sm:mt-8 pt-4 sm:pt-6 text-center" style={{ borderColor: theme.textLight + '40' }}>
        <p className="text-xs sm:text-sm" style={{ color: theme.textLight }}>Payment is due within {getDaysDifference(invoice.date, invoice.dueDate)} days of issue</p>
      </div>
    </div>
  );
};

// Helper function to calculate days between dates
const getDaysDifference = (startDate: string, endDate: string): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export default CorporateTemplate;
