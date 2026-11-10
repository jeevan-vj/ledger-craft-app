import { ZodError } from 'zod';
import { AuthApiError } from '@/features/auth/api/http';

export type AssistantFailure = {
  code: string;
  message: string;
};

const fallback = 'The assistant could not finish. Nothing was saved.';

export function readAssistantFailure(error: unknown): AssistantFailure | null {
  if (error instanceof Error && error.name === 'AbortError') return null;
  if (error instanceof ZodError) {
    return { code: 'ASSISTANT_OUTPUT_INVALID', message: 'The assistant returned an unusable response. Nothing was saved.' };
  }
  if (error instanceof AuthApiError) {
    return { code: error.code ?? 'REQUEST_FAILED', message: error.message || fallback };
  }
  return { code: 'REQUEST_FAILED', message: error instanceof Error && error.message ? error.message : fallback };
}
