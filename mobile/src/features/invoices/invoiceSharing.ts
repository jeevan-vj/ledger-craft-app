const DEFAULT_WEB_ORIGIN = 'https://easybiz.iamjeevan.com';

export function publicInvoicePath(shareToken: string): string {
  return `shared/invoice/${encodeURIComponent(shareToken)}`;
}

export function buildPublicInvoiceUrl(shareToken: string): string {
  const origin = (process.env.EXPO_PUBLIC_WEB_URL ?? DEFAULT_WEB_ORIGIN).replace(/\/$/, '');
  return `${origin}/${publicInvoicePath(shareToken)}`;
}

export function buildInvoiceShareMessage(input: {
  invoiceNumber: string;
  businessName?: string | null;
  url: string;
}): string {
  const sender = input.businessName?.trim();
  const title = sender
    ? `Invoice ${input.invoiceNumber} from ${sender}`
    : `Invoice ${input.invoiceNumber}`;
  return `${title}\n${input.url}`;
}
