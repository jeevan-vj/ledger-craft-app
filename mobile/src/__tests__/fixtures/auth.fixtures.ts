export const TEST_USER_CREDENTIALS = {
  email: 'test@ledgercraft.com',
  password: 'Test123!@#',
};

type AuthUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  created_at?: string;
  updated_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  aud?: string;
  role?: string;
};

type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: AuthUser;
};

export const mockUser: Partial<AuthUser> = {
  id: 'test-user-id-123',
  email: TEST_USER_CREDENTIALS.email,
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {
    full_name: 'Test User',
  },
  aud: 'authenticated',
  role: 'authenticated',
};

export const mockSession: Partial<AuthSession> = {
  access_token: 'mock-access-token-123',
  refresh_token: 'mock-refresh-token-456',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  user: mockUser as AuthUser,
};

export const mockAuthResponse = {
  data: {
    user: mockUser as AuthUser,
    session: mockSession as AuthSession,
  },
  error: null,
};

export const mockAuthError = {
  data: {
    user: null,
    session: null,
  },
  error: {
    message: 'Invalid login credentials',
    status: 400,
  },
};
