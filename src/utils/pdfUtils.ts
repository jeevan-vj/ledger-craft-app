import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Invoice } from '@/types';
import type { InvoiceTemplateId } from '@/components/invoice/templates/InvoiceTemplates';

/** Embed bounded, origin-clean images so a remote logo cannot taint the PDF. */
async function prepareImages(element: HTMLElement): Promise<void> {
  await Promise.all(Array.from(element.querySelectorAll('img')).map(async (image) => {
    try {
      const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
        const source = new Image();
        const timeout = window.setTimeout(() => reject(new Error('Image timed out')), 8000);
        source.crossOrigin = 'anonymous';
        source.onload = () => { clearTimeout(timeout); resolve(source); };
        source.onerror = () => { clearTimeout(timeout); reject(new Error('Image unavailable')); };
        source.src = image.currentSrc || image.src;
      });
      const scale = Math.min(1, 600 / Math.max(loaded.naturalWidth, loaded.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(loaded.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(loaded.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image canvas unavailable');
      context.drawImage(loaded, 0, 0, canvas.width, canvas.height);
      image.removeAttribute('srcset');
      image.src = canvas.toDataURL('image/png');
      canvas.width = canvas.height = 0;
    } catch {
      // Optional branding must not prevent the recipient from downloading an invoice.
      image.remove();
    }
  }));
}

export const generatePdfFromElement = async (
  element: HTMLElement,
  fileName = 'invoice.pdf',
  _template: InvoiceTemplateId = 'classic',
  _businessLogoUrl?: string,
  subject = 'Invoice',
): Promise<void> => {
  const clone = element.cloneNode(true) as HTMLElement;
  const captureId = `pdf-capture-${crypto.randomUUID()}`;
  clone.id = captureId;
  const width = 794;
  Object.assign(clone.style, {
    position: 'absolute', left: '-10000px', top: '0', width: `${width}px`,
    maxWidth: 'none', margin: '0', padding: '24px', background: '#fff',
    boxSizing: 'border-box', overflow: 'visible', height: 'auto',
  });
  document.body.appendChild(clone);
  try {
    await document.fonts?.ready;
    await prepareImages(clone);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const margin = 10;
    const contentWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
    const pixelsPerPage = Math.floor(pageHeight * width / contentWidth);
    let totalHeight = Math.max(1, clone.scrollHeight);

    // Render one A4 page at a time: a tall full-invoice canvas exceeds iOS limits.
    for (let y = 0, page = 0; y < totalHeight; page++) {
      let captureHeight = pixelsPerPage;
      const canvas = await html2canvas(clone, {
        scale: 1.5, useCORS: true, allowTaint: false, backgroundColor: '#fff',
        logging: false, imageTimeout: 8000, width, get height() { return captureHeight; }, y,
        windowWidth: 1024, windowHeight: 1400, scrollX: 0, scrollY: 0,
        onclone: (document) => {
          const capture = document.getElementById(captureId);
          if (!capture) throw new Error('Invoice capture missing');
          // Measure in the desktop capture viewport, not the phone's wrapped layout.
          capture.querySelectorAll<HTMLElement>('.overflow-x-auto').forEach(node => { node.style.overflow = 'visible'; });
          const bounds = capture.getBoundingClientRect();
          totalHeight = Math.max(1, Math.ceil(bounds.height));
          let end = Math.min(y + pixelsPerPage, totalHeight);
          for (const row of capture.querySelectorAll('tr, p')) {
            const box = row.getBoundingClientRect();
            const top = Math.floor(box.top - bounds.top);
            const bottom = Math.ceil(box.bottom - bounds.top);
            if (top > y + 64 && top < end && bottom > end) end = top;
          }
          captureHeight = Math.max(1, end - y);
        },
      });
      try {
        if (!canvas.width || !canvas.height) throw new Error('Invoice capture is empty');
        if (page > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, canvas.height * contentWidth / canvas.width, undefined, 'FAST');
      } finally {
        canvas.width = canvas.height = 0;
      }
      y += captureHeight;
    }
    pdf.setProperties({ title: fileName.replace(/\.pdf$/i, ''), subject, creator: 'LedgerCraft' });
    await pdf.save(fileName, { returnPromise: true });
  } catch (error) {
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clone.remove();
  }
};

export const generateInvoicePdf = async (
  invoice: Invoice,
  element: HTMLElement,
  template: InvoiceTemplateId = 'classic',
  businessLogoUrl?: string,
  options?: { fileName?: string; subject?: string },
): Promise<void> => {
  await generatePdfFromElement(
    element,
    options?.fileName ?? `Invoice-${invoice.invoiceNumber}.pdf`,
    template,
    businessLogoUrl,
    options?.subject ?? 'Invoice',
  );
};
