import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BusinessProfile, Invoice } from '@/types';
import { createTemplateData, renderTemplateComponent } from '@/services/invoiceTemplateRenderer';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

/**
 * Tailwind is not generated in jsdom. These are the same utility colours the
 * Classic template and the other templates' headers use in the built app.
 * They are inserted before `src/index.css` because jsdom lets source order beat
 * the dark-mode rule's real specificity. In Safari the rule still wins, and
 * `color: initial` becomes a light CanvasText on the white paper.
 */
const UTILITY_COLOURS = `
.text-gray-800 { color: rgb(31, 41, 55); }
.text-gray-600 { color: rgb(75, 85, 99); }
.text-gray-500 { color: rgb(107, 114, 128); }
.text-white { color: rgb(255, 255, 255); }
.bg-gray-100 { background-color: rgb(243, 244, 246); }
.dark { color-scheme: dark; color: rgb(245, 245, 250); }
`;

beforeAll(() => {
  const utilities = document.createElement('style');
  utilities.setAttribute('data-invoice-preview-utilities', 'true');
  utilities.textContent = UTILITY_COLOURS;
  const production = document.createElement('style');
  production.setAttribute('data-invoice-preview-css', 'true');
  production.textContent = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  document.head.append(utilities, production);
});

afterEach(cleanup);

const invoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV-2026-0042',
  customerId: 'buyer',
  customer: {
    id: 'buyer',
    name: 'Buyer Ltd',
    email: 'buyer@example.test',
    phone: '021 555 0199',
    address: '12 Cuba Street',
    city: 'Wellington',
    state: null,
    zip: '6011',
    country: 'NZ',
  },
  date: '2026-10-01',
  dueDate: '2026-10-31',
  currency: 'NZD',
  status: 'sent',
  subtotal: 100,
  taxAmount: 15,
  total: 115,
  notes: 'Thanks for the Halloween order',
  terms: 'Due on receipt',
  items: [{ id: 'line', description: 'Consulting', quantity: 2, unit: 'hr', rate: 50, rateUnit: 'hr', total: 100 }],
} as Invoice;

const profile = {
  name: 'Kauri Studio',
  address: '1 Queen Street',
  city: 'Auckland',
  country: 'NZ',
  phone: '09 555 0101',
  bankAccountName: 'Kauri Studio Ltd',
  bankAccountNumber: '01-0123-0000123-00',
} as BusinessProfile;

function mountPreview(options: { theme: 'dark' | 'light'; logo?: string; pdfClone?: boolean }) {
  const data = createTemplateData(invoice, {
    ...profile,
    logoUrl: options.logo,
  });
  const paper = (testId: string) => (
    <div className="print-template-wrapper" data-testid={testId}>
      {renderTemplateComponent('classic', data)}
      <div className="text-white" style={{ background: 'linear-gradient(to right, #1e3a8a, #1d4ed8)' }}>
        <h2>Coloured header</h2>
      </div>
    </div>
  );

  return render(
    <div className={options.theme === 'dark' ? 'dark' : 'light'}>
      <div className="invoice-preview-container bg-white text-black">
        {paper('screen-paper')}
      </div>
      {options.pdfClone ? paper('pdf-paper') : null}
    </div>,
  );
}

function channels(color: string): [number, number, number] {
  const match = color.replace(/\s/g, '').match(/^rgba?\((\d+),(\d+),(\d+)/i);
  if (!match) throw new Error(`expected an rgb colour, got ${color}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function expectColour(element: Element, expected: string, label: string) {
  expect(getComputedStyle(element).color, label).toBe(expected);
}

function expectDarkInk(element: Element, label: string) {
  const actual = getComputedStyle(element).color;
  expect(actual, `${label} should be a concrete dark colour`).toMatch(/^rgb/i);
  const [red, green, blue] = channels(actual);
  expect(red + green + blue, `${label} should be dark ink, got ${actual}`).toBeLessThan(200);
}

describe('Classic invoice preview ink', () => {
  it.each([
    { logo: undefined, label: 'without a logo' },
    { logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', label: 'with a round logo' },
  ])('stays legible on the white paper in dark mode $label', ({ logo }) => {
    mountPreview({ theme: 'dark', logo, pdfClone: true });

    const screenPaper = screen.getByTestId('screen-paper');
    const title = within(screenPaper).getByRole('heading', { name: 'INVOICE' });
    expectColour(title, 'rgb(31, 41, 55)', 'Classic title uses its gray utility');
    expectDarkInk(within(screenPaper).getByText('Kauri Studio'), 'company name');
    expectDarkInk(within(screenPaper).getByText('Buyer Ltd'), 'bill to');
    expectDarkInk(within(screenPaper).getByText('Consulting'), 'line item');
    expectDarkInk(within(screenPaper).getByText('Total:'), 'total');
    expectDarkInk(within(screenPaper).getByText('Thanks for the Halloween order'), 'notes');
    expectDarkInk(within(screenPaper).getByText('Due on receipt'), 'terms');
    expectDarkInk(within(screenPaper).getByText('Payment details'), 'payment details');
    expect(getComputedStyle(screenPaper.querySelector('thead') as Element).backgroundColor).toBe('rgb(243, 244, 246)');
    expectColour(within(screenPaper).getByRole('heading', { name: 'Coloured header' }), 'rgb(255, 255, 255)', 'other templates keep white header type');

    if (logo) {
      expect(screenPaper.querySelector('img')).toHaveAttribute('alt', 'Kauri Studio');
    }

    const pdfPaper = screen.getByTestId('pdf-paper');
    const pdfTitle = pdfPaper.querySelector('h1');
    const pdfCompany = Array.from(pdfPaper.querySelectorAll('p')).find((node) => node.textContent === 'Kauri Studio');
    expect(pdfTitle).toBeTruthy();
    expect(pdfCompany).toBeTruthy();
    expectColour(pdfTitle as Element, 'rgb(31, 41, 55)', 'PDF title');
    expectDarkInk(pdfCompany as Element, 'PDF company name');
    expectDarkInk(pdfPaper.querySelector('td') as Element, 'PDF line item');
  });

  it('keeps the same dark ink in light mode', () => {
    mountPreview({ theme: 'light' });
    expectColour(screen.getByRole('heading', { name: 'INVOICE' }), 'rgb(31, 41, 55)', 'light-mode title');
    expectDarkInk(screen.getByText('Kauri Studio'), 'light-mode company');
    expect(screen.getByText('Consulting')).toBeInTheDocument();
  });
});
