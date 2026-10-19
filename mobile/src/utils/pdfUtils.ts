import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { BusinessProfile, Invoice } from '@/types/invoice';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { generateInvoiceHTML } from '@/utils/invoiceTemplates';

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

export function invoiceFileName(invoiceNumber: string): string {
  const safeNumber = invoiceNumber
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return `Invoice-${safeNumber || 'Draft'}.pdf`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function moveToNamedDocument(uri: string, invoice: Invoice): Promise<string> {
  if (!FileSystem.documentDirectory) {
    return uri;
  }

  const destination = `${FileSystem.documentDirectory}${invoiceFileName(invoice.invoiceNumber)}`;
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
): Promise<string> {
  try {
    const { uri } = await Print.printToFileAsync({
      html: generateInvoiceHTML(invoice, businessProfile, templateId),
      width: A4_WIDTH,
      height: A4_HEIGHT,
      base64: false,
    });
    return await moveToNamedDocument(uri, invoice);
  } catch (error) {
    throw new Error(`Could not generate the invoice PDF: ${errorMessage(error)}`);
  }
}

export async function printInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic',
): Promise<void> {
  try {
    await Print.printAsync({
      html: generateInvoiceHTML(invoice, businessProfile, templateId),
      width: A4_WIDTH,
      height: A4_HEIGHT,
    });
  } catch (error) {
    throw new Error(`Could not print the invoice: ${errorMessage(error)}`);
  }
}

export async function shareInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic',
): Promise<void> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device');
    }

    const uri = await generateInvoicePDF(invoice, businessProfile, templateId);
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${invoice.invoiceNumber}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Sharing is not available on this device' ||
        error.message.startsWith('Could not generate the invoice PDF'))
    ) {
      throw error;
    }
    throw new Error(`Could not share the invoice PDF: ${errorMessage(error)}`);
  }
}

export async function downloadInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic',
): Promise<string | null> {
  const uri = await generateInvoicePDF(invoice, businessProfile, templateId);
  const fileName = invoiceFileName(invoice.invoiceNumber);

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
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Save ${invoice.invoiceNumber} PDF`,
    UTI: 'com.adobe.pdf',
  });
  return uri;
}
