import type { FxRevaluationPreviewRequest, FxRevaluationRequest, FxRevaluationResponse } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
import { currencyApi } from '@/features/currency/currencyApi';
export const fxRevaluationApi = {
  async rates() { return (await currencyApi.get()).rates; },
  preview(input: FxRevaluationPreviewRequest): Promise<FxRevaluationResponse> { return apiRequest('/api/fx-revaluations/preview', { method: 'POST', body: JSON.stringify(input) }); },
  post(input: FxRevaluationRequest): Promise<FxRevaluationResponse> { return apiRequest('/api/fx-revaluations', { method: 'POST', body: JSON.stringify(input) }); },
};
