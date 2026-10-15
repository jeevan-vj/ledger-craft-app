import { Page } from '@playwright/test';

export interface MockUser {
  id: string;
  email: string;
  fullName?: string;
  emailConfirmed?: boolean;
}

export interface MockAuthOptions {
  user?: MockUser;
  hasSession?: boolean;
  hasBusinessProfile?: boolean;
  needsEmailConfirmation?: boolean;
}

/**
 * Comprehensive authentication mocking utility for Playwright tests
 */
export class AuthMocker {
  private mockState: {
    user: Record<string, unknown> | null;
    session: Record<string, unknown> | null;
    hasBusinessProfile: boolean;
    needsEmailConfirmation: boolean;
  } = {
    user: null,
    session: null,
    hasBusinessProfile: false,
    needsEmailConfirmation: false,
  };

  constructor(private page: Page) {}

  /**
   * Set up authentication mocking before page navigation
   */
  async setupAuthMocking(options: MockAuthOptions = {}) {
    const {
      user = {
        id: 'test-user-id',
        email: 'test@example.com',
        fullName: 'Test User',
        emailConfirmed: true
      },
      hasSession = true,
      hasBusinessProfile = false,
      needsEmailConfirmation = false
    } = options;

    // Mock the Supabase client in the browser context
    await this.page.addInitScript(({ user, hasSession, hasBusinessProfile, needsEmailConfirmation }) => {
      // Create mock session data
      const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({
        sub: user.id,
        email: user.email,
        role: 'authenticated',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }));
      const accessToken = `${header}.${payload}.test`;

      const mockUser = {
        id: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: user.email,
        user_metadata: { full_name: user.fullName },
        app_metadata: { provider: 'email' },
        email_confirmed_at: user.emailConfirmed ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      };

      const mockSession = hasSession ? {
        access_token: accessToken,
        refresh_token: 'mock-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: mockUser,
      } : null;

      if (hasSession && mockSession) {
        const persistableSession = {
          access_token: mockSession.access_token,
          refresh_token: mockSession.refresh_token,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: mockSession.user,
        };
        localStorage.setItem(
          'sb-viqckjmborlqaemavrzu-auth-token',
          JSON.stringify(persistableSession)
        );
      }

      (window as any).__mockAuthData = {
        user: mockUser,
        session: mockSession,
        hasBusinessProfile,
        needsEmailConfirmation
      };
    }, { user, hasSession, hasBusinessProfile, needsEmailConfirmation });

    this.mockState = {
      user: {
        id: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: user.email,
        user_metadata: { full_name: user.fullName },
        app_metadata: { provider: 'email' },
        email_confirmed_at: user.emailConfirmed ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      },
      session: hasSession
        ? {
            access_token: `${btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${btoa(JSON.stringify({
              sub: user.id,
              email: user.email,
              role: 'authenticated',
              aud: 'authenticated',
              exp: Math.floor(Date.now() / 1000) + 3600,
            }))}.test`,
            refresh_token: 'mock-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: user.id,
              email: user.email,
            },
          }
        : null,
      hasBusinessProfile,
      needsEmailConfirmation,
    };

    // Set up route interceptions
    await this.setupRouteInterceptions();
    
    // Also mock the session endpoint for better compatibility
    await this.page.route('**/auth/v1/session', async route => {
      if (this.mockState.session) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(this.mockState.session)
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'No session' })
        });
      }
    });
  }

  /**
   * Set up all necessary route interceptions for auth
   */
  private async setupRouteInterceptions() {
    // Mock auth session endpoint
    await this.page.route('**/auth/v1/user', async route => {
      if (this.mockState.session) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(this.mockState.user)
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unauthorized' })
        });
      }
    });

    // Mock sign-up endpoint
    await this.page.route('**/auth/v1/signup', async route => {
      const mockData = this.mockState;
      
      const response = {
        user: {
          id: (mockData.user as { id?: string } | null)?.id,
          email: (mockData.user as { email?: string } | null)?.email,
          user_metadata: (mockData.user as { user_metadata?: unknown } | null)?.user_metadata,
          email_confirmed_at: mockData.needsEmailConfirmation ? null : new Date().toISOString()
        },
        session: mockData.needsEmailConfirmation ? null : mockData.session
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response)
      });
    });

    // Mock sign-in endpoint
    await this.page.route('**/auth/v1/token**', async route => {
      const mockData = this.mockState;
      
      if (route.request().url().includes('grant_type=password')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            user: mockData.user
          })
        });
      } else {
        await route.continue();
      }
    });

    // Mock business profile endpoint
    await this.page.route('**/rest/v1/business_profiles**', async route => {
      const mockUser = this.mockState.user as { id?: string; email?: string } | null;
      const now = new Date().toISOString();
      const profile = {
        id: 'business-profile-id',
        name: 'Test Business',
        email: mockUser?.email || 'business@test.com',
        country: 'New Zealand',
        phone: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        tax_id: null,
        logo_url: null,
        website: null,
        default_tax_rate: 15,
        default_terms: null,
        default_notes: null,
        bank_info: null,
        theme: null,
        user_id: mockUser?.id || 'test-user-id',
        invoice_number_format: 'INV-{YYYY}-{SEQ}',
        invoice_number_sequence: 1,
        created_at: now,
        updated_at: now,
      };

      if (route.request().method() === 'GET') {
        if (this.mockState.hasBusinessProfile) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
              'content-range': '0-0/1',
              'content-profile': 'public',
            },
            body: JSON.stringify(profile),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
              'content-range': '*/0',
              'content-profile': 'public',
            },
            body: JSON.stringify([]),
          });
        }
      } else if (route.request().method() === 'POST' || route.request().method() === 'PATCH' || route.request().method() === 'PUT') {
        this.mockState.hasBusinessProfile = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          headers: {
            'content-range': '0-0/1',
            'content-profile': 'public',
          },
          body: JSON.stringify({ ...profile, id: 'new-business-profile-id' }),
        });
      } else {
        await route.continue();
      }
    });
  }

  /**
   * Mock immediate authentication (no email confirmation)
   */
  async mockImmediateAuth(user?: Partial<MockUser>) {
    await this.setupAuthMocking({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        fullName: 'Test User',
        emailConfirmed: true,
        ...user
      },
      hasSession: true,
      hasBusinessProfile: false,
      needsEmailConfirmation: false
    });
  }

  /**
   * Mock email confirmation required
   */
  async mockEmailConfirmationRequired(user?: Partial<MockUser>) {
    await this.setupAuthMocking({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        fullName: 'Test User',
        emailConfirmed: false,
        ...user
      },
      hasSession: false,
      hasBusinessProfile: false,
      needsEmailConfirmation: true
    });
  }

  /**
   * Mock authenticated user with completed onboarding
   */
  async mockCompletedOnboarding(user?: Partial<MockUser>) {
    await this.setupAuthMocking({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        fullName: 'Test User',
        emailConfirmed: true,
        ...user
      },
      hasSession: true,
      hasBusinessProfile: true,
      needsEmailConfirmation: false
    });
  }
}