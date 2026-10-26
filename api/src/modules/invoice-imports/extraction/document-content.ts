const MAX_DOCUMENT_TEXT = 30_000;

function unescapePdfString(value: string): string {
  return value
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

export function extractPdfText(bytes: Uint8Array): string {
  const source = new TextDecoder('latin1').decode(bytes);
  const parts: string[] = [];
  for (const stream of source.matchAll(/stream\s*([\s\S]*?)\s*endstream/g)) {
    for (const text of stream[1]!.matchAll(/\(((?:\\.|[^()])*)\)\s*Tj/g)) {
      parts.push(unescapePdfString(text[1]!));
    }
  }
  return parts.join('\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, MAX_DOCUMENT_TEXT);
}

export function documentContent(file: { bytes: Uint8Array; mimeType: string }): string | { dataUrl: string } {
  if (file.mimeType === 'application/pdf') return extractPdfText(file.bytes);
  return { dataUrl: `data:${file.mimeType};base64,${Buffer.from(file.bytes).toString('base64')}` };
}

