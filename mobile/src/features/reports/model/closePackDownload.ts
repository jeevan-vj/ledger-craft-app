import { financialReportQuerySchema } from '@ledgercraft/contracts';
import { apiFetch, rejectFailedResponse } from '@/features/auth/api/http';
export async function fetchClosePack(from: string, to: string): Promise<{ filename: string; bytes: ArrayBuffer }> {
  const period = financialReportQuerySchema.parse({ from, to, basis: 'accrual', baseCurrency: 'NZD' });
  const response = await apiFetch(`/api/reports/close-pack?${new URLSearchParams({ from: period.from, to: period.to })}`, { method: 'GET' });
  if (!response.ok) await rejectFailedResponse(response);
  if (!response.headers.get('content-type')?.includes('application/zip')) throw new Error('The close pack response was not a ZIP archive. Try again.');
  const bytes = await response.arrayBuffer(); const signature = new Uint8Array(bytes);
  if (signature.length < 4 || signature[0] !== 80 || signature[1] !== 75 || signature[2] !== 3 || signature[3] !== 4) throw new Error('The close pack ZIP could not be verified. Try again.');
  return { filename: `Close-pack-${period.from}-${period.to}.zip`, bytes };
}
