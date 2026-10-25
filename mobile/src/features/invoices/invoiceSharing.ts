const DEFAULT_WEB_ORIGIN = 'https://easybiz.iamjeevan.com';

export function publicInvoicePath(shareToken: string): string {
  return `shared/invoice/${encodeURIComponent(shareToken)}`;
}

export function buildPublicInvoiceUrl(shareToken: string): string {
  const origin = (process.env.EXPO_PUBLIC_WEB_URL ?? DEFAULT_WEB_ORIGIN).replace(/\/$/, '');
  return `${origin}/${publicInvoicePath(shareToken)}`;
}

export function formatShareCreated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function shareViewLabel(count: number): string {
  const views = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return views === 1 ? '1 view' : `${views} views`;
}

export function shareLinkSummary(share: {
  templateName: string;
  createdAt: string;
  accessCount: number;
}): string {
  return `${share.templateName} · Created ${formatShareCreated(share.createdAt)} · ${shareViewLabel(share.accessCount)}`;
}

export function invoiceReminderRequest(invoiceNumber: string): {
  subject: string;
  html: string;
  reminderType: 'gentle';
} {
  return {
    subject: `Payment reminder for invoice ${invoiceNumber}`,
    html: `<p>Please pay invoice ${invoiceNumber}.</p>`,
    reminderType: 'gentle',
  };
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
