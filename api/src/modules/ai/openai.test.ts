import { describe, expect, it } from 'vitest';
import { createOpenAiReceiptScanner } from './openai';

const successBody = { choices: [{ message: { content: JSON.stringify({ items: [], confidence: 80 }) } }] };

describe('AI provider environment bindings', () => {
  it('uses the Worker OpenAI binding as the primary provider', async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const scanner = createOpenAiReceiptScanner({
      env: { OPENAI_API_KEY: 'openai-test-key', XAI_API_KEY: 'xai-test-key' },
      fetchImpl: async (input, init) => {
        request = { url: String(input), init };
        return Response.json(successBody);
      },
    });
    await scanner.scan({ imageBase64: 'abc', contentType: 'image/png' });
    expect(request?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(new Headers(request?.init?.headers).get('authorization')).toBe('Bearer openai-test-key');
  });

  it('uses the optional xAI Worker binding only when no OpenAI key is set', async () => {
    let url = '';
    const scanner = createOpenAiReceiptScanner({
      env: { XAI_API_KEY: 'xai-test-key' },
      fetchImpl: async (input) => { url = String(input); return Response.json(successBody); },
    });
    await scanner.scan({ imageBase64: 'abc' });
    expect(url).toBe('https://api.x.ai/v1/chat/completions');
  });
});
