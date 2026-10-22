export interface DocumentLabels {
  title: string;
  numberLabel: string;
  dateLabel: string;
  dueLabel: string;
  showPayment: boolean;
}

/** Default copy. Invoice templates keep their current wording when this is used. */
export const invoiceDocumentLabels: DocumentLabels = {
  title: 'INVOICE',
  numberLabel: 'Invoice Number',
  dateLabel: 'Invoice Date',
  dueLabel: 'Due Date',
  showPayment: true,
};

export function quoteDocumentLabels(kind: 'quote' | 'estimate'): DocumentLabels {
  const noun = kind === 'estimate' ? 'Estimate' : 'Quote';
  return {
    title: noun.toUpperCase(),
    numberLabel: `${noun} Number`,
    dateLabel: `${noun} Date`,
    dueLabel: 'Valid until',
    showPayment: false,
  };
}

export function resolveDocumentLabels(labels?: DocumentLabels | null): DocumentLabels {
  return labels ?? invoiceDocumentLabels;
}
