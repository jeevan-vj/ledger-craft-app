import type { InvoiceImportExtractionDraft } from '@ledgercraft/contracts';

export type ExtractionFile = {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  sha256: string;
};

export type ExtractionContext = {
  organisationName: string;
  gstNumber?: string;
};

export interface InvoiceImportExtractionProvider {
  extractDocument(file: ExtractionFile, context: ExtractionContext): Promise<InvoiceImportExtractionDraft>;
}

