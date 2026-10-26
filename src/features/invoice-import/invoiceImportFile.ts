const accepted = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export function validateInvoiceImportFile(file: File): string | null {
  if (!accepted.has(file.type)) return 'Choose a PDF, JPG or PNG file.';
  if (file.size === 0) return 'The selected file is empty.';
  if (file.size > 1024 * 1024) return 'The selected file must be 1 MB or smaller.';
  return null;
}
