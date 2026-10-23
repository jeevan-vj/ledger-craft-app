import { BankPaymentDetails } from '../BankPaymentDetails';
import { resolveDocumentLabels, type DocumentLabels } from '../documentLabels';
import React from 'react';
import { formatLineQuantity, showPositiveAmount } from '@/utils/invoiceLineDisplay';
import { formatCurrency, invoiceDiscountLabel } from '@/utils/invoiceUtils';
import { Invoice, LineItem, BusinessTheme, DEFAULT_BUSINESS_THEME } from '@/types';
import { PDFCard, PDFCardContent } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';

interface ModernInvoiceTemplateProps {
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

const ModernInvoiceTemplate = ({
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
}: ModernInvoiceTemplateProps) => {
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

  // Status color
  const getStatusColor = () => {
    switch (invoice.status) {
      case 'paid': return 'bg-green-50 text-green-700 border-green-300';
      case 'overdue': return 'bg-red-50 text-red-700 border-red-300';
      case 'sent': return 'bg-blue-50 text-blue-700 border-blue-300';
      default: return 'bg-gray-50 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-10 flex justify-center items-center" style={{ backgroundColor: theme.background }}>
      <div className="w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden border" style={{ backgroundColor: theme.surface, borderColor: theme.textLight + '20' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center px-8 py-8 text-white" style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }}>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            {businessLogo && (
              <img src={businessLogo} alt={companyName} className="h-16 w-16 object-contain rounded-xl bg-white bg-opacity-20 shadow-md" />
            )}
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{companyName}</h1>
              <p className="text-xs opacity-80 whitespace-pre-line">{companyAddress}</p>
              {companyPhone && (
                isMobile ? (
                  <span className="text-xs opacity-80 no-autolink">{companyPhone}</span>
                ) : (
                  <p className="text-xs opacity-80">{companyPhone}</p>
                )
              )}
            </div>
          </div>
          <div className="mt-6 sm:mt-0 text-right w-full sm:w-auto">
            {/* <span className={`inline-block px-4 py-1 rounded-full border font-semibold text-sm mb-2 ${getStatusColor()}`}>{invoice.status}</span> */}
            {copy.title !== 'INVOICE' ? (
              <div className="text-lg font-extrabold tracking-wide">{copy.title}</div>
            ) : null}
            <div className="text-xs opacity-80">
              <span>{copy.title === 'INVOICE' ? 'Invoice #' : copy.numberLabel}</span> <span className="font-bold">{invoice.invoiceNumber}</span>
            </div>
            <div className="text-xs opacity-80">
              <span>{copy.title === 'INVOICE' ? 'Date: ' : `${copy.dateLabel}: `}</span>{new Date(invoice.date).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Client & Invoice Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 px-8 py-6 border-b" style={{ backgroundColor: theme.surface, borderColor: theme.textLight + '30' }}>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.textLight }}>Billed To</h3>
            <div className="font-semibold text-lg" style={{ color: theme.text }}>{clientName}</div>
            <div className="text-xs whitespace-pre-line mb-1" style={{ color: theme.textLight }}>{clientAddress}</div>
            {invoice.customer?.email && (
              <div className="text-xs" style={{ color: theme.textLight }}>{invoice.customer.email}</div>
            )}
            {invoice.customer?.phone && (
              <div className="text-xs" style={{ color: theme.textLight }}>{invoice.customer.phone}</div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div>
              <span className="text-xs font-bold" style={{ color: theme.textLight }}>{copy.dateLabel}: </span>
              <span className="text-sm font-medium" style={{ color: theme.text }}>{new Date(invoice.date).toLocaleDateString()}</span>
            </div>
            <div>
              <span className="text-xs font-bold" style={{ color: theme.textLight }}>{copy.dueLabel}: </span>
              <span className="text-sm font-medium" style={{ color: theme.text }}>{new Date(invoice.dueDate).toLocaleDateString()}</span>
            </div>
            <div>
              <span className="text-xs font-bold" style={{ color: theme.textLight }}>Currency: </span>
              <span className="text-sm font-medium" style={{ color: theme.text }}>{invoice.currency}</span>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="px-4 sm:px-8 py-6" style={{ backgroundColor: theme.surface }}>
          <div className="overflow-x-auto rounded-lg shadow-sm">
            <table className="w-full text-sm text-left border-separate border-spacing-y-2">
              <thead>
                <tr style={{ background: `linear-gradient(to right, ${theme.primary}20, ${theme.secondary}20)` }}>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs" style={{ color: theme.textLight }}>Item</th>
                  <th className="px-2 py-3 font-bold uppercase tracking-wider text-xs" style={{ color: theme.textLight }}>Qty</th>
                  <th className="px-2 py-3 font-bold uppercase tracking-wider text-xs" style={{ color: theme.textLight }}>Rate</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-right" style={{ color: theme.textLight }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item: LineItem, idx: number) => (
                  <tr key={item.id} className="shadow rounded-lg" style={{ backgroundColor: theme.surface }}>
                    <td className="px-4 py-3 font-medium align-top" style={{ color: theme.text }}>
                      {item.description}
                      {(item as any).details && (
                        <div className="text-xs mt-1" style={{ color: theme.textLight }}>{(item as any).details}</div>
                      )}
                    </td>
                    <td className="px-2 py-3 align-top" style={{ color: theme.text }}>
                      {formatLineQuantity(item.quantity, item.unit)}
                    </td>
                    <td className="px-2 py-3 align-top" style={{ color: theme.text }}>
                      {formatCurrency(item.rate, invoice.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold align-top" style={{ color: theme.text }}>{formatCurrency(item.total || item.quantity * item.rate, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="flex flex-col items-end px-8 pb-6" style={{ backgroundColor: theme.surface }}>
          <div className="w-full sm:w-80 rounded-xl p-6 shadow border" style={{ 
            background: `linear-gradient(to right, ${theme.primary}15, ${theme.secondary}15)`,
            borderColor: theme.textLight + '30'
          }}>
            <div className="flex justify-between py-1 text-sm">
              <span className="font-medium" style={{ color: theme.textLight }}>Subtotal</span>
              <span className="font-semibold" style={{ color: theme.text }}>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            {showPositiveAmount(tax) && (
            <div className="flex justify-between py-1 text-sm">
              <span className="font-medium" style={{ color: theme.textLight }}>Tax ({taxRate}%)</span>
              <span className="font-semibold" style={{ color: theme.text }}>{formatCurrency(tax, invoice.currency)}</span>
            </div>
            )}
            {/* Individual Additional Charges */}
            {invoice.additionalChargesList && invoice.additionalChargesList.length > 0 && (
              <>
                {invoice.additionalChargesList.map((charge, index) => {
                  if (!charge.isActive) return null;
                  const chargeAmount = charge.calculationType === 'percentage' 
                    ? (invoice.subtotal * charge.amount) / 100
                    : charge.amount;
                  if (!showPositiveAmount(chargeAmount)) return null;
                  
                  return (
                    <div key={index} className="flex justify-between py-1 text-sm">
                      <span className="font-medium" style={{ color: theme.textLight }}>{charge.label}</span>
                      <span className="font-semibold" style={{ color: theme.text }}>{formatCurrency(chargeAmount, invoice.currency)}</span>
                    </div>
                  );
                })}
              </>
            )}
            
            {/* Fallback to legacy additional charges if no structured charges */}
            {(!invoice.additionalChargesList || invoice.additionalChargesList.length === 0) && showPositiveAmount(invoice.additionalCharges) && (
              <div className="flex justify-between py-1 text-sm">
                <span className="font-medium" style={{ color: theme.textLight }}>Additional Charges</span>
                <span className="font-semibold" style={{ color: theme.text }}>{formatCurrency(invoice.additionalCharges, invoice.currency)}</span>
              </div>
            )}
            
            {showPositiveAmount(invoice.discount) && (
              <div className="flex justify-between py-1 text-sm">
                <span className="font-medium" style={{ color: theme.textLight }}>{invoiceDiscountLabel(invoice)}</span>
                <span className="font-semibold" style={{ color: theme.accent }}>-{formatCurrency(invoice.discount, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-t mt-2 text-lg" style={{ borderColor: theme.textLight + '30' }}>
              <span className="font-bold" style={{ color: theme.text }}>Total</span>
              <span className="font-bold" style={{ color: theme.primary }}>{formatCurrency(invoice.total, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {copy.showPayment ? <BankPaymentDetails bankAccountName={bankAccountName} bankAccountNumber={bankAccountNumber} /> : null}
        {/* Notes & Terms */}
        {(invoice.notes || invoice.terms) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 px-8 pb-8" style={{ backgroundColor: theme.surface }}>
            {invoice.notes && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.textLight }}>Notes</h4>
                <p className="text-xs whitespace-pre-line" style={{ color: theme.text }}>{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.textLight }}>Terms & Conditions</h4>
                <p className="text-xs whitespace-pre-line" style={{ color: theme.text }}>{invoice.terms}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-4 text-center border-t" style={{ 
          background: `linear-gradient(to right, ${theme.primary}10, ${theme.secondary}10)`,
          borderColor: theme.textLight + '30'
        }}>
          <p className="text-xs" style={{ color: theme.textLight }}>Payment is due within {getDaysDifference(invoice.date, invoice.dueDate)} days of issue</p>
        </div>
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

export default ModernInvoiceTemplate; 