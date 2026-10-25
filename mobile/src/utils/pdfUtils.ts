import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { BusinessProfile, Invoice } from '@/types/invoice';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { generateInvoiceHTML, type DocumentLabels } from '@/utils/invoiceTemplates';
import { isShareSheetDismissal } from '@/utils/shareSheet';

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

export interface DocumentFileOptions {
  labels?: DocumentLabels;
  filePrefix?: string;
}

export function invoiceFileName(invoiceNumber: string, filePrefix = 'Invoice'): string {
  const safeNumber = invoiceNumber
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return `${filePrefix}-${safeNumber || 'Draft'}.pdf`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function documentNoun(options?: DocumentFileOptions): string {
  const prefix = options?.filePrefix?.trim();
  return prefix ? prefix.toLowerCase() : 'invoice';
}

async function moveToNamedDocument(uri: string, invoice: Invoice, filePrefix = 'Invoice'): Promise<string> {
  if (!FileSystem.documentDirectory) {
    return uri;
  }

  const destination = `${FileSystem.documentDirectory}${invoiceFileName(invoice.invoiceNumber, filePrefix)}`;
  const existing = await FileSystem.getInfoAsync(destination);
  if (existing.exists) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: uri, to: destination });
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  return destination;
}

export async function generateInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic',
  options?: DocumentFileOptions,
): Promise<string> {
  try {
    const { uri } = await Print.printToFileAsync({
      html: generateInvoiceHTML(invoice, businessProfile, templateId, options?.labels),
      width: A4_WIDTH,
      height: A4_HEIGHT,
      base64: false,
    });
    return await moveToNamedDocument(uri, invoice, options?.filePrefix);
  } catch (error) {
    throw new Error(`Could not generate the ${documentNoun(options)} PDF: ${errorMessage(error)}`);
  }
}

export async function printInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic',
  options?: DocumentFileOptions,
): Promise<void> {
  try {
    await Print.printAsync({
      html: generateInvoiceHTML(invoice, businessProfile, templateId, options?.labels),
      width: A4_WIDTH,
      height: A4_HEIGHT,
    });
  } catch (error) {
    throw new Error(`Could not print the ${documentNoun(options)}: ${errorMessage(error)}`);
  }
}

export async function shareInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic',
  options?: DocumentFileOptions,
): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device');
    }

    const uri = await generateInvoicePDF(invoice, businessProfile, templateId, options);
    const noun = documentNoun(options);
    try {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: noun === 'invoice' ? `Share ${invoice.invoiceNumber}` : `Share ${options?.filePrefix} ${invoice.invoiceNumber}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      if (isShareSheetDismissal(error)) return;
      throw error;
    }
  } catch (error) {
    if (isShareSheetDismissal(error)) return;
    if (
      error instanceof Error &&
      (error.message === 'Sharing is not available on this device' ||
        error.message.startsWith('Could not generate the '))
    ) {
      throw error;
    }
    throw new Error(`Could not share the ${documentNoun(options)} PDF: ${errorMessage(error)}`);
  }
}

export async function downloadInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic',
  options?: DocumentFileOptions,
): Promise<string | null> {
  const uri = await generateInvoicePDF(invoice, businessProfile, templateId, options);
  const fileName = invoiceFileName(invoice.invoiceNumber, options?.filePrefix);

  if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return null;
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const destination = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      fileName,
      'application/pdf',
    );
    await FileSystem.writeAsStringAsync(destination, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return destination;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Saving is not available on this device');
  }
  try {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: documentNoun(options) === 'invoice'
        ? `Save ${invoice.invoiceNumber} PDF`
        : `Save ${options?.filePrefix} ${invoice.invoiceNumber} PDF`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    if (isShareSheetDismissal(error)) return null;
    throw error;
  }
  return uri;
}
