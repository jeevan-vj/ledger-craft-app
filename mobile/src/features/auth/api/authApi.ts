import { z } from 'zod';
import { apiFetch, apiRequest, AuthApiError, clearSessionCookies, rejectFailedResponse } from './http';

export { AuthApiError };

const meResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1),
  }),
  organisation: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
  }),
  membership: z.object({
    role: z.enum(['owner', 'admin', 'accountant', 'member', 'read_only']),
  }),
  permissions: z.array(z.string()).default([]),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export function authErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (
      message.includes('supabase.co') ||
      message.includes('Headers') ||
      message.trim().startsWith('{') ||
      message.includes('_bodyInit')
    ) {
      return "Couldn't reach the account service. Make sure the API is running on port 3001.";
    }
    return message;
  }
  return 'Something went wrong.';
}

export async function getMe(): Promise<MeResponse | null> {
  const response = await apiFetch('/api/me', { method: 'GET' });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    await rejectFailedResponse(response);
  }
  return meResponseSchema.parse(await response.json());
}

export async function signUpEmail(input: {
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  await apiRequest('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function signInEmail(input: { email: string; password: string }): Promise<void> {
  await apiRequest('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function signOutSession(): Promise<void> {
  try {
    // apiFetch always sends Content-Type: application/json, and Better Auth parses the body as
    // JSON whenever that header is set. An empty body is rejected with 400 "Invalid JSON in
    // request body", so send an empty JSON object to get the session revoked on the server.
    await apiRequest('/api/auth/sign-out', { method: 'POST', body: '{}' });
  } finally {
    await clearSessionCookies();
  }
}
