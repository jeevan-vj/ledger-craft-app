import type { TaxReturnDto } from '@ledgercraft/contracts';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { isShareSheetDismissal } from '@/utils/shareSheet';
import { buildGstReturnHtml } from './gstReturnHtml';
export { buildGstReturnHtml } from './gstReturnHtml';
export async function shareGstReturn(saved: TaxReturnDto): Promise<void> {
 if (!await Sharing.isAvailableAsync()) throw new Error('PDF sharing is not available on this device.');
 const document = await Print.printToFileAsync({ html: buildGstReturnHtml(saved), width: 595, height: 842 });
 if (!document?.uri) throw new Error('The GST PDF could not be created. Try again.');
 try { await Sharing.shareAsync(document.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Share GST ${saved.periodStart} to ${saved.periodEnd}` }); }
 catch (error) { if (!isShareSheetDismissal(error)) throw error; }
}
