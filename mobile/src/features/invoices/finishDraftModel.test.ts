import {
  addedLineError,
  buildDraftLineUpdate,
  dueDateError,
  lineTotal,
  preservedTaxRate,
  showFinishDraft,
} from './finishDraftModel';
import type { Invoice, LineItem } from '@/types/invoice';

function line(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: 'line-1',
    description: 'Logo design',
    quantity: 1,
    unit: 'each',
    rate: 80,
    total: 80,
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-0001',
    customerId: 'cust-1',
    date: '2026-11-04',
    dueDate: '2026-12-04',
    items: [line({ taxes: [{ id: 'default', name: 'GST', rate: 15 }] })],
    subtotal: 80,
    taxAmount: 12,
    total: 92,
    status: 'draft',
    currency: 'NZD',
    taxInclusive: false,
    ...overrides,
  };
}

describe('finish draft', () => {
  it('shows the short editor only for a draft the user can change', () => {
    expect(showFinishDraft('draft', true)).toBe(true);
    expect(showFinishDraft('draft', false)).toBe(false);
    expect(showFinishDraft('sent', true)).toBe(false);
  });

  it('rejects a due date before the invoice date', () => {
    expect(dueDateError('2026-11-04', '2026-11-03')).toBe("Due date can't be before the invoice date.");
    expect(dueDateError('2026-11-04', '2026-11-04')).toBeNull();
    expect(dueDateError('2026-11-04', '04/11/2026')).toBe('Choose a due date.');
  });

  it('checks the new line before it is saved', () => {
    expect(addedLineError('A', '1', '10')).toBe('Describe what you are charging for.');
    expect(addedLineError('Hosting', '0', '10')).toBe('Enter a quantity greater than zero.');
    expect(addedLineError('Hosting', '2', '0')).toBe('Enter an amount greater than zero.');
    expect(addedLineError('Hosting', '2', '40.50')).toBeNull();
    expect(lineTotal('2', '40.50')).toBe(81);
  });

  it('copies the invoice GST onto the new line', () => {
    const update = buildDraftLineUpdate(invoice(), {
      description: 'Hosting',
      quantity: '2',
      amount: '40.50',
    });

    expect(update).toEqual({
      taxInclusive: false,
      taxRate: '15',
      items: [
        {
          description: 'Logo design',
          quantity: '1',
          unit: 'each',
          rate: '80',
          rateUnit: 'each',
          taxes: [{ id: 'default', name: 'GST', rate: '15' }],
        },
        {
          description: 'Hosting',
          quantity: '2',
          unit: 'each',
          rate: '40.5',
          rateUnit: 'each',
          taxes: [{ id: 'default', name: 'GST', rate: '15' }],
        },
      ],
    });
    expect(preservedTaxRate(invoice())).toBe('15');
  });

  it('keeps GST off when the draft was created without it', () => {
    const untaxed = invoice({
      taxAmount: 0,
      total: 80,
      items: [line()],
    });

    expect(buildDraftLineUpdate(untaxed, {
      description: 'Hosting',
      quantity: '1',
      amount: '20',
    })).toMatchObject({
      taxRate: '0',
      items: [
        { description: 'Logo design', taxes: [] },
        { description: 'Hosting', taxes: [] },
      ],
    });
  });

  it('derives one header rate when the saved lines have no tax list', () => {
    const derived = invoice({ items: [line()] });
    expect(preservedTaxRate(derived)).toBe('15');
    expect(buildDraftLineUpdate(derived, {
      description: 'Hosting',
      quantity: '1',
      amount: '10',
    })?.items?.[1]).not.toHaveProperty('taxes');
  });

  it('keeps an exempt line exempt when another line already has GST', () => {
    const mixed = invoice({
      items: [
        line({ taxes: [{ id: 'default', name: 'GST', rate: 15 }] }),
        line({ id: 'line-2', description: 'Exempt supply', rate: 40, total: 40, taxes: [] }),
      ],
      subtotal: 120,
      taxAmount: 12,
      total: 132,
    });

    expect(buildDraftLineUpdate(mixed, {
      description: 'Hosting',
      quantity: '1',
      amount: '20',
    })).toMatchObject({
      taxRate: '15',
      items: [
        { description: 'Logo design', taxes: [{ id: 'default', name: 'GST', rate: '15' }] },
        { description: 'Exempt supply', taxes: [] },
        { description: 'Hosting', taxes: [{ id: 'default', name: 'GST', rate: '15' }] },
      ],
    });
  });

  it('sends the draft version so a newer save is not overwritten', () => {
    const versioned = invoice({ updatedAt: '2026-11-05T01:02:03.000Z' });
    expect(buildDraftLineUpdate(versioned, {
      description: 'Hosting',
      quantity: '1',
      amount: '20',
    })?.expectedUpdatedAt).toBe('2026-11-05T01:02:03.000Z');
  });
});
