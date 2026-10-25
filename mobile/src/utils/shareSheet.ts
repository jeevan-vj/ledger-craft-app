const DISMISSAL_CODES = new Set([
  'ERR_SHARING_CANCELLED',
  'ERR_CANCELLED',
  'ERR_CANCELED',
  'E_SHARE_CANCELLED',
  'E_SHARE_CANCELED',
  'E_CANCELLED',
  'E_CANCELED',
]);

export function isShareSheetDismissal(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  if (DISMISSAL_CODES.has(code)) return true;
  const message = error instanceof Error ? error.message : '';
  return /did not share|share was cancelled|share was canceled|share cancelled|share canceled|dismissed the share sheet/i.test(message);
}
