import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import type { Invoice } from '@/types/invoice';
import type { BusinessProfile } from '@/services/businessProfileService';
import { formatLineQuantity, showPositiveAmount } from '@/utils/invoiceLineDisplay';

interface InvoicePreviewProps {
  invoice: Invoice;
  businessProfile?: BusinessProfile | null;
}

export default function InvoicePreview({ invoice, businessProfile }: InvoicePreviewProps) {
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.invoiceContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.businessInfoContainer}>
            {businessProfile?.logoUrl && (
              <Image
                source={{ uri: businessProfile.logoUrl }}
                style={styles.logo}
                resizeMode="contain"
              />
            )}
            <Text style={styles.companyName}>
              {businessProfile?.name || 'Your Business Name'}
            </Text>
            <Text style={styles.headerText}>Professional Invoice</Text>
            {businessProfile?.email && (
              <Text style={styles.businessDetail}>{businessProfile.email}</Text>
            )}
            {businessProfile?.phone && (
              <Text style={styles.businessDetail}>{businessProfile.phone}</Text>
            )}
            {businessProfile?.address && (
              <Text style={styles.businessDetail}>
                {[
                  businessProfile.address,
                  businessProfile.city,
                  businessProfile.state,
                  businessProfile.zip,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
            )}
          </View>
          <View style={styles.invoiceNumberContainer}>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
          </View>
        </View>

        {/* Bill To & Dates */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailColumn}>
            <Text style={styles.sectionTitle}>Bill To:</Text>
            <Text style={styles.customerName}>{invoice.customer?.name}</Text>
            {invoice.customer?.email && (
              <Text style={styles.customerDetail}>{invoice.customer.email}</Text>
            )}
            {invoice.customer?.phone && (
              <Text style={styles.customerDetail}>{invoice.customer.phone}</Text>
            )}
            {invoice.customer?.address && (
              <Text style={styles.customerDetail}>
                {[
                  invoice.customer.address,
                  invoice.customer.city,
                  invoice.customer.state,
                  invoice.customer.zip,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
            )}
          </View>

          <View style={styles.detailColumn}>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Date:</Text>
              <Text style={styles.dateValue}>{formatDate(invoice.date)}</Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Due Date:</Text>
              <Text style={styles.dateValue}>{formatDate(invoice.dueDate)}</Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Status:</Text>
              <Text style={[styles.dateValue, styles.status]}>
                {invoice.status.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Line Items Table */}
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.descriptionColumn]}>Description</Text>
            <Text style={[styles.tableHeaderText, styles.qtyColumn]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.rateColumn]}>Rate</Text>
            <Text style={[styles.tableHeaderText, styles.amountColumn]}>Amount</Text>
          </View>

          {invoice.items.map((item, index) => (
            <View key={item.id} style={styles.tableRow}>
              <View style={styles.descriptionColumn}>
                <Text style={styles.itemDescription}>{item.description}</Text>
              </View>
              <Text style={[styles.tableCellText, styles.qtyColumn]}>{formatLineQuantity(item.quantity, item.unit)}</Text>
              <Text style={[styles.tableCellText, styles.rateColumn]}>
                {formatCurrency(item.rate, invoice.currency)}
              </Text>
              <Text style={[styles.tableCellText, styles.amountColumn]}>
                {formatCurrency(item.total, invoice.currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal:</Text>
            <Text style={styles.totalValue}>{formatCurrency(invoice.subtotal, invoice.currency)}</Text>
          </View>

          {showPositiveAmount(invoice.taxAmount) && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax:</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.taxAmount, invoice.currency)}</Text>
            </View>
          )}

          {showPositiveAmount(invoice.discount) && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount:</Text>
              <Text style={styles.totalValue}>-{formatCurrency(Number(invoice.discount), invoice.currency)}</Text>
            </View>
          )}

          {showPositiveAmount(invoice.additionalCharges) && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Additional Charges:</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(Number(invoice.additionalCharges), invoice.currency)}
              </Text>
            </View>
          )}

          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Total:</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(invoice.total, invoice.currency)}</Text>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesTitle}>Notes:</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Terms */}
        {invoice.terms && (
          <View style={styles.termsContainer}>
            <Text style={styles.termsTitle}>Payment Terms:</Text>
            <Text style={styles.termsText}>{invoice.terms}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Thank you for your business!</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
  },
  invoiceContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: '#33415C',
    paddingBottom: 16,
    marginBottom: 20,
  },
  businessInfoContainer: {
    flex: 1,
    marginRight: 16,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 12,
    borderRadius: 8,
  },
  companyName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#33415C',
    marginBottom: 4,
  },
  headerText: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  businessDetail: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  invoiceNumberContainer: {
    alignItems: 'flex-end',
  },
  invoiceLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#33415C',
  },
  detailsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  detailColumn: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  customerDetail: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 2,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  status: {
    color: '#10b981',
    textTransform: 'uppercase',
  },
  tableContainer: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  descriptionColumn: {
    flex: 3,
  },
  qtyColumn: {
    flex: 1,
    textAlign: 'center',
  },
  rateColumn: {
    flex: 1.5,
    textAlign: 'right',
  },
  amountColumn: {
    flex: 1.5,
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  itemDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  tableCellText: {
    fontSize: 14,
    color: '#0f172a',
  },
  totalsContainer: {
    alignItems: 'flex-end',
    marginBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '50%',
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  grandTotalRow: {
    borderTopWidth: 2,
    borderTopColor: '#e2e8f0',
    marginTop: 8,
    paddingTop: 12,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#33415C',
  },
  notesContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
  },
  notesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  notesText: {
    fontSize: 13,
    color: '#0f172a',
    lineHeight: 18,
  },
  termsContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
  },
  termsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  termsText: {
    fontSize: 13,
    color: '#0f172a',
    lineHeight: 18,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
  },
});

