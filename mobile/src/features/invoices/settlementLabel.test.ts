import { invoiceSettlementLabel } from './settlementLabel';
it('distinguishes full credit from cash payment without treating credits as receipts', () => {
 expect(invoiceSettlementLabel({ status: 'paid', totalCreditedText: '1150.00', totalPaidText: '0.00', balanceDueText: '0.00' })).toBe('Credited');
 expect(invoiceSettlementLabel({ status: 'paid', totalCreditedText: '230.00', totalPaidText: '920.00', balanceDueText: '0.00' })).toBe('Settled');
 expect(invoiceSettlementLabel({ status: 'paid', totalCreditedText: '0.00', totalPaidText: '1150.00', balanceDueText: '0.00' })).toBe('Paid');
 expect(invoiceSettlementLabel({ status: 'sent', totalCreditedText: '230.00', totalPaidText: '0.00', balanceDueText: '920.00' })).toBe('Sent');
});
