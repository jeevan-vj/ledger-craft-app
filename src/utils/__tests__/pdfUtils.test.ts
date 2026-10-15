import { beforeEach, describe, expect, it, vi } from 'vitest';
import html2canvas from 'html2canvas';
import { generatePdfFromElement } from '../pdfUtils';
const pdf = vi.hoisted(() => ({ addImage: vi.fn(), addPage: vi.fn(), setProperties: vi.fn(), save: vi.fn(), internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } } }));
vi.mock('jspdf', () => ({ jsPDF: vi.fn(function () { return pdf; }) }));
vi.mock('html2canvas', () => ({ default: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2500);
  vi.mocked(html2canvas).mockImplementation(async (_element, options) => ({ width: 1191, height: (options?.height ?? 2500) * 1.5, toDataURL: () => `data:image/png;base64,page-${options?.y ?? 0}` }) as HTMLCanvasElement);
});
describe('invoice PDF capture', () => {
  it('captures bounded, distinct pages with a desktop viewport and prevents tainted canvases', async () => {
    const invoice = document.createElement('div'); invoice.textContent = 'Invoice'; document.body.append(invoice);
    await generatePdfFromElement(invoice);
    const calls = vi.mocked(html2canvas).mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    expect(new Set(calls.map(([, options]) => options?.y)).size).toBe(calls.length);
    for (const [, options] of calls) {
      expect(options?.allowTaint).toBe(false);
      expect(options?.windowWidth).toBeGreaterThanOrEqual(794);
      expect((options?.width ?? 0) * (options?.height ?? 0) * (options?.scale ?? 1) ** 2).toBeLessThan(3000000);
    }
    expect(pdf.addPage).toHaveBeenCalledTimes(calls.length - 1);
    expect(document.body.children).toHaveLength(1);
  });
  it('removes the temporary invoice when rendering fails', async () => {
    const invoice = document.createElement('div'); document.body.append(invoice);
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error('capture failed'));
    await expect(generatePdfFromElement(invoice)).rejects.toThrow('capture failed');
    expect(document.body.children).toHaveLength(1);
  });
});

it('does not let an unavailable external logo prevent a download', async () => {
  const invoice = document.createElement('div');
  invoice.innerHTML = '<img src="https://logo.invalid/logo.png" alt="Business logo">';
  document.body.append(invoice);
  const OriginalImage = globalThis.Image;
  globalThis.Image = class {
    onerror?: () => void;
    set src(_src: string) { queueMicrotask(() => this.onerror?.()); }
  } as unknown as typeof Image;
  try {
    await generatePdfFromElement(invoice);
    expect(pdf.save).toHaveBeenCalled();
    expect(vi.mocked(html2canvas).mock.calls[0][0].querySelector('img')).toBeNull();
    expect(invoice.querySelector('img')).not.toBeNull();
  } finally { globalThis.Image = OriginalImage; }
});

it('uses the capture viewport height and stops after the last content page', async () => {
  const invoice = document.createElement('div'); document.body.append(invoice);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 2000, width: 794, top: 0, bottom: 2000 } as DOMRect);
  vi.mocked(html2canvas).mockImplementation(async (_element, options) => {
    await options?.onclone?.(document, _element);
    return { width: 1191, height: options!.height! * 1.5, toDataURL: () => 'data:image/png;base64,test' } as HTMLCanvasElement;
  });
  await generatePdfFromElement(invoice);
  expect(html2canvas).toHaveBeenCalledTimes(2);
  const calls = vi.mocked(html2canvas).mock.calls;
  expect(calls.reduce((height, [, options]) => height + options!.height!, 0)).toBe(2000);
});
