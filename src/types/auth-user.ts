export type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string | null;
};

export type AuthSession = {
  user: AuthUser;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
};
