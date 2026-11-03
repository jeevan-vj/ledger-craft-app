import { apiError } from '../../http-error';

export type WorkersAiBinding = {
  run(model: string, input: unknown): Promise<unknown>;
  toMarkdown?(document: {
    name: string;
    blob: Blob;
  }, options?: {
    conversionOptions?: { pdf?: { metadata?: boolean } };
  }): Promise<{
    format: 'markdown' | 'text' | 'error';
    data?: string;
    error?: string;
  } | Array<{
    format: 'markdown' | 'text' | 'error';
    data?: string;
    error?: string;
  }>>;
};

export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const DEFAULT_WORKERS_AI_TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const LIMIT_MESSAGE = 'Cloudflare Workers AI daily free limit reached (10,000 neurons/day). Try again after 00:00 UTC, upgrade to Workers Paid, or configure OPENAI_API_KEY.';

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const code = 'code' in error ? String((error as Error & { code?: unknown }).code ?? '') : '';
    return `${error.message} ${code}`;
  }
  if (typeof error === 'object' && error !== null) {
    try { return JSON.stringify(error); } catch { return String(error); }
  }
  return String(error);
}

export function isWorkersAiLimitError(error: unknown): boolean {
  return /(3036|daily free allocation|neurons|rate limit|capacity|\b429\b|too many requests)/i.test(errorText(error));
}

const LICENCE_MESSAGE = 'The configured Cloudflare Workers AI model requires a one-time licence acceptance (error 5016). Accept it in the Cloudflare account, or set WORKERS_AI_MODEL to a model without a licence step.';

export function isWorkersAiLicenceError(error: unknown): boolean {
  return /\b5016\b|must submit the prompt 'agree'/i.test(errorText(error));
}

export function workersAiRunError(error: unknown): never {
  if (isWorkersAiLicenceError(error)) {
    throw apiError(503, 'EXTRACTION_PROVIDER_UNAVAILABLE', LICENCE_MESSAGE);
  }
  if (isWorkersAiLimitError(error)) {
    throw apiError(429, 'EXTRACTION_PROVIDER_LIMIT', LIMIT_MESSAGE);
  }
  throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Cloudflare Workers AI extraction failed');
}

export function parseWorkersAiJson(response: unknown): unknown {
  const value = (response as { response?: unknown } | null)?.response;
  if (typeof value === 'object' && value !== null) return value;
  if (typeof value !== 'string') throw new Error('Workers AI returned no response');
  const unfenced = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Workers AI returned invalid JSON');
  return JSON.parse(unfenced.slice(start, end + 1));
}
