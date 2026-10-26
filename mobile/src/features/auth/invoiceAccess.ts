export function canWriteInvoices(permissions: readonly string[] | undefined): boolean {
  return Boolean(permissions?.includes('invoices.write'));
}

export function canImportInvoices(permissions: readonly string[] | undefined): boolean {
  return Boolean(permissions?.includes('invoices.import'));
}
