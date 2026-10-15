import type { ReceiptScanResultDto, ScanReceiptRequest } from '@ledgercraft/contracts';
import { receiptScanResultSchema } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';

export type ReceiptScanner = {
  scan(input: ScanReceiptRequest): Promise<ReceiptScanResultDto>;
};

export async function scanReceiptForUser(
  db: Database,
  userId: string,
  scanner: ReceiptScanner | undefined,
  input: ScanReceiptRequest,
): Promise<ReceiptScanResultDto> {
  return withOrganisationTx(db, userId, async () => {
    if (!scanner) {
      throw apiError(503, 'AI_UNAVAILABLE', 'Receipt scanning is not configured');
    }
    const result = await scanner.scan(input);
    return receiptScanResultSchema.parse(result);
  });
}
