import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { InvoiceImportDraftResponse } from '@ledgercraft/contracts';
import { InvoiceImportReview } from './InvoiceImportReview';

const confidence = (value: number, label: 'High' | 'Check' | 'Missing') => ({ value, label });

function review(overrides: Partial<InvoiceImportDraftResponse> = {}): InvoiceImportDraftResponse {
  return {
    documentId: '11111111-1111-4111-8111-111111111111',
    status: 'needs_review',
    direction: null,
    thirdPartyIssued: false,
    contactId: null,
    provider: 'openai',
    mock: false,
    validationIssues: [],
    duplicateWarnings: [],
    contactSuggestions: [],
    draft: {
      issuerName: 'Cleancorp Ltd', issuerGstNumber: '123-456-789',
      recipientName: 'Crystal Touch Cleaning', recipientGstNumber: null,
      documentNumber: 'BC-1001', issueDate: '2026-10-26', dueDate: '2026-11-09',
      currency: 'NZD', net: '200.00', gst: '30.00', total: '230.00',
      suggestedDirection: 'SALES', suggestedDirectionReason: 'Recipient is the organisation',
      thirdPartyIssued: false, provider: 'openai', mock: false,
      lineItems: [{ description: 'Cleaning services', quantity: '2', unitPrice: '100.00', amount: '200.00', gstRate: '15' }],
      confidence: {
        issuerName: confidence(0.98, 'High'), issuerGstNumber: confidence(0.9, 'High'),
        recipientName: confidence(0.98, 'High'), recipientGstNumber: confidence(0, 'Missing'),
        documentNumber: confidence(0.96, 'High'), issueDate: confidence(0.9, 'High'),
        dueDate: confidence(0.9, 'High'), currency: confidence(0.99, 'High'),
        lineItems: [confidence(0.9, 'High')], net: confidence(0.97, 'High'),
        gst: confidence(0.97, 'High'), total: confidence(0.99, 'High'),
        suggestedDirection: confidence(0.9, 'High'), thirdPartyIssued: confidence(0.9, 'High'),
      },
    },
    ...overrides,
  };
}

const defaultProps = {
  filename: 'cleancorp.pdf',
  mimeType: 'application/pdf' as const,
  previewUrl: 'blob:preview',
  organisationName: 'Crystal Touch Cleaning',
  contacts: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Cleancorp Ltd', type: 'customer' as const }],
  onChange: vi.fn(),
  onCommit: vi.fn(),
  onDownload: vi.fn(),
  committing: false,
};

describe('InvoiceImportReview', () => {
  it('requires an explicit direction and has no default selection', () => {
    render(<InvoiceImportReview {...defaultProps} review={review()} />);
    expect(screen.getByRole('radio', { name: /money in/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /money out/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /choose sales or purchase/i })).toBeDisabled();
    expect(screen.getByText('Suggested: Sales')).toBeInTheDocument();
  });

  it('requires duplicate acknowledgement before commit', async () => {
    const user = userEvent.setup();
    render(<InvoiceImportReview {...defaultProps} review={review({
      direction: 'SALES',
      contactId: '22222222-2222-4222-8222-222222222222',
      duplicateWarnings: [{ kind: 'issuer_number', recordType: 'invoice', recordId: '33333333-3333-4333-8333-333333333333', message: 'Invoice BC-1001 may already exist' }],
    })} />);
    const button = screen.getByRole('button', { name: 'Create draft invoice' });
    expect(button).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /reviewed.*duplicate/i }));
    expect(button).toBeEnabled();
  });

  it('blocks commit for totals mismatch', () => {
    render(<InvoiceImportReview {...defaultProps} review={review({
      direction: 'PURCHASE',
      validationIssues: [{ code: 'totals_mismatch', path: 'total', message: 'Line total 115.00 does not match stated total 0.00', blocking: true, expected: '115.00', actual: '0.00' }],
    })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/lines.*stated total/i);
    expect(screen.getByRole('button', { name: 'Create draft bill' })).toBeDisabled();
  });

  it('flags low-confidence fields with a score', () => {
    const data = review();
    data.draft.confidence.documentNumber = confidence(0.54, 'Check');
    render(<InvoiceImportReview {...defaultProps} review={data} />);
    expect(screen.getByText('Check this · 54%')).toBeInTheDocument();
  });

  it('labels deterministic mock extraction', () => {
    render(<InvoiceImportReview {...defaultProps} review={review({ provider: 'mock', mock: true })} />);
    expect(screen.getByText('Mock extraction — demo data')).toBeInTheDocument();
  });

  it('warns when the draft was scanned with Workers AI', () => {
    const data = review({ provider: 'workers-ai', mock: false });
    data.draft.provider = 'workers-ai';
    render(<InvoiceImportReview {...defaultProps} review={data} />);
    expect(screen.getByText('Scanned with Cloudflare Workers AI, check carefully')).toBeInTheDocument();
  });

  it('keeps the document preview content-sized instead of stretching a dark empty panel', () => {
    render(<InvoiceImportReview {...defaultProps} review={review()} />);
    expect(screen.getByRole('region', { name: 'Original document preview' })).toHaveClass('self-start');
  });

  it('keeps the line GST field visible inside the review panel', () => {
    render(<InvoiceImportReview {...defaultProps} review={review()} />);
    expect(screen.getByRole('textbox', { name: 'Line 1 GST rate' })).toHaveClass('min-w-0');
  });
});

