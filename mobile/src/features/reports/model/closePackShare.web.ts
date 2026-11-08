import { fetchClosePack } from './closePackDownload';
export async function shareClosePack(from: string, to: string) {
  const file = await fetchClosePack(from, to);
  const url = URL.createObjectURL(new Blob([file.bytes], { type: 'application/zip' }));
  try { const link = document.createElement('a'); link.href = url; link.download = file.filename; link.click(); }
  finally { URL.revokeObjectURL(url); }
}
