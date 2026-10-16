import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { BusinessProfile, Invoice } from '@/types/invoice';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { generateInvoiceHTML } from '@/utils/invoiceTemplates';

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

function invoiceFileName(invoiceNumber: string): string {
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
  await FileSystem.moveAsync({ from: uri, to: destination });
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
    if (error instanceof Error && error.message === 'Sharing is not available on this device') {
      throw error;
    }
    throw new Error(`Could not share the invoice PDF: ${errorMessage(error)}`);
  }
}

export async function downloadInvoicePDF(
  invoice: Invoice,
  businessProfile?: BusinessProfile,
  templateId: InvoiceTemplateId = 'classic',
): Promise<string> {
  return generateInvoicePDF(invoice, businessProfile, templateId);
}
