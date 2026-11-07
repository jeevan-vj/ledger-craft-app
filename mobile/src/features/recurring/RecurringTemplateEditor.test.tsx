import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecurringTemplateEditor } from './RecurringTemplateEditor';
jest.mock('@/features/auth/api/http', () => ({ apiRequest: jest.fn().mockResolvedValue({ customers: [], vendors: [], accounts: [], bankAccounts: [] }) }));
const template = { id: 'template', name: 'Existing automatic invoice', kind: 'invoice', payload: { kind: 'invoice', input: { customerId: '11111111-1111-4111-8111-111111111111', date: '2027-01-31', dueDate: '2027-02-10', items: [{ description: 'Retainer', quantity: '1', rate: '115.00' }] }, send: { mode: 'auto', whenEmailUnavailable: 'draft' } }, schedule: { frequency: 'monthly', interval: 1, startDate: '2027-01-31', timezone: 'Pacific/Auckland', localTime: '09:00' }, status: 'active', nextRunAt: null, lastRunAt: null, occurrencesCreated: 0, createdAt: '', updatedAt: '' };
it('allows disabling an existing automatic delivery choice while email is unavailable', () => {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
 const result = render(<QueryClientProvider client={client}><RecurringTemplateEditor value={template as never} emailAvailable={false} onClose={() => undefined} /></QueryClientProvider>);
 const control = screen.getByLabelText('Automatically send invoices');
 expect(control.props.value).toBe(true); expect(control.props.disabled).toBe(false);
 fireEvent(control, 'valueChange', false); expect(screen.getByLabelText('Automatically send invoices').props.value).toBe(false);
 result.unmount(); client.clear();
});
