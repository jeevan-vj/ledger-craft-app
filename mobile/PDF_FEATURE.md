# Mobile invoice preview and PDF

Invoice detail exposes **Preview invoice** as both a native header action and a
prominent bottom action. The full-screen preview supports all invoice templates,
fits the 595 × 842 A4 document to the device width, and provides loading,
accessible error/retry, and PDF sharing states.

`src/utils/invoiceTemplates.ts` owns the single HTML document generator used by
both the WebView preview and `expo-print`. Its shared totals block displays the
authoritative subtotal, GST/tax, discount, additional charges, total, and amount
due with the invoice currency.

`src/utils/pdfUtils.ts` provides:

- `generateInvoicePDF` — creates a non-base64 A4 PDF and moves it to a readable
  `Invoice-<number>.pdf` name when document storage is available.
- `printInvoicePDF` — opens the native print flow with the same HTML and A4 size.
- `shareInvoicePDF` — checks native sharing availability and shares with PDF MIME
  type and `com.adobe.pdf` UTI.
- `downloadInvoicePDF` — returns the named local PDF URI.

Focused HTML generator coverage lives in
`src/utils/__tests__/invoiceHtml.test.ts`.
