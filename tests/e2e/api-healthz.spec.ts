import { expect, test } from '@playwright/test';

test.describe('API health through Vite proxy', () => {
  test('GET /api/healthz returns ok when the API is running', async ({ request }) => {
    const response = await request.get('/api/healthz');
    if (response.status() === 502 || response.status() === 503) {
      test.skip(true, 'Hono API is not running on :3001; start with pnpm dev:api');
    }

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers()['x-request-id']).toMatch(/^req_/);
  });
});
