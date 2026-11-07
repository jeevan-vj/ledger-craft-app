import type { ReceiptScanResult } from '@/types/receipt';
export type ReceiptInboxStatus = 'uploading' | 'scanning' | 'needs_review' | 'saved' | 'failed';
export type ReceiptInboxItem = { id: string; name: string; contentType: string; status: ReceiptInboxStatus; receiptUrl?: string; receiptHash?: string; proposal: ReceiptScanResult | null; error?: string; expenseId?: string; saveKey?: string; saveSignature?: string };
type Dependencies = { upload(file: File): Promise<{ url: string; path: string } | null>; scan(file: File): Promise<ReceiptScanResult>; hash(file: File): Promise<string> };
export async function processReceipt(file: File, available: boolean, dependencies: Dependencies, update: (item: ReceiptInboxItem) => void, previous?: ReceiptInboxItem): Promise<ReceiptInboxItem> {
 let item: ReceiptInboxItem = { id: previous?.id ?? crypto.randomUUID(), name: file.name, contentType: file.type, status: 'uploading', proposal: null, receiptUrl: previous?.receiptUrl, receiptHash: previous?.receiptHash };
 const publish = (patch: Partial<ReceiptInboxItem>) => { item = { ...item, ...patch }; update(item); };
 try {
  if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP or PDF receipt.');
  if (file.size > 1_048_576) throw new Error('Choose a receipt up to 1 MiB.');
  publish({ status: 'uploading' });
  item.receiptHash ??= await dependencies.hash(file);
  if (!item.receiptUrl) { const uploaded = await dependencies.upload(file); if (!uploaded) throw new Error('Receipt upload failed. Retry the upload before saving.'); item.receiptUrl = uploaded.url; }
  if (available) { publish({ status: 'scanning' }); const proposal = await dependencies.scan(file); publish({ proposal, status: 'needs_review' }); }
  else publish({ status: 'needs_review' });
 } catch (error) { publish({ status: 'failed', error: error instanceof Error ? error.message : "Couldn't read this receipt" }); }
 return item;
}
const normalizedAmount = (value: string | number | undefined) => String(value ?? '').replace(/^0+(?=\d)/,'').replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
export function isDuplicateReceipt(item: ReceiptInboxItem, existing: Array<{ receiptHash?: string | null; vendorName?: string | null; expenseDate?: string; amount?: string | number }>): boolean {
 return existing.some(value => (item.receiptHash && value.receiptHash === item.receiptHash) || (item.proposal?.merchantName?.trim() && item.proposal.date && item.proposal.total && value.vendorName?.trim().toLowerCase() === item.proposal.merchantName.trim().toLowerCase() && value.expenseDate === item.proposal.date && normalizedAmount(value.amount) === normalizedAmount(item.proposal.total)));
}
