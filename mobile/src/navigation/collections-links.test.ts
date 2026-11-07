import { expect, it } from '@jest/globals';
import { getStateFromPath } from '@react-navigation/native';
import { mobileLinking, moreMenuSections } from './links';
it('makes statements and reminder settings reachable from More and deep links', () => {
 const screens=moreMenuSections.flatMap(section=>section.rows.map(row=>row.screen));
 expect(screens).toContain('CustomerStatements');expect(screens).toContain('PaymentReminders');
 expect(JSON.stringify(getStateFromPath('customer-statements?customerId=customer-1', mobileLinking.config))).toContain('CustomerStatements');
 expect(JSON.stringify(getStateFromPath('settings/payment-reminders', mobileLinking.config))).toContain('PaymentReminders');
});

it('links banking detail/import and recurring management to existing server-backed screens', () => {
 expect(JSON.stringify(getStateFromPath('banking/accounts/account-1', mobileLinking.config))).toContain('BankAccountDetail');
 expect(JSON.stringify(getStateFromPath('banking/accounts/account-1/import', mobileLinking.config))).toContain('BankStatementImport');
 expect(JSON.stringify(getStateFromPath('settings/recurring', mobileLinking.config))).toContain('RecurringSchedules');
});
