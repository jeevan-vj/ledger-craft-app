import { AuthApiError } from '@/features/auth/api/http';
import { setupFailureAlert } from './setupFailure';

describe('setup failure copy', () => {
  it('uses the connection message only when the request never reached the API', () => {
    expect(setupFailureAlert(new AuthApiError('Failed to fetch', 0))).toEqual({
      title: 'Couldn’t finish setup',
      message: 'Check your connection and try again. Your answers are still here.',
    });
  });

  it('shows the server message for validation and other API failures', () => {
    const validation = setupFailureAlert(new AuthApiError('theme.background: Required', 400));
    expect(validation.title).toBe('Couldn’t finish setup');
    expect(validation.message).toBe('theme.background: Required. Your answers are still here.');
    expect(validation.message).not.toContain('Check your connection');

    const unavailable = setupFailureAlert(new AuthApiError('Service temporarily unavailable. Please try again later.', 503));
    expect(unavailable.message).toContain('Service temporarily unavailable');
    expect(unavailable.message).not.toContain('Check your connection');
  });

  it('does not blame the connection for an unexpected client error', () => {
    const alert = setupFailureAlert(new Error('Business name and email are required'));
    expect(alert.message).toBe('Business name and email are required. Your answers are still here.');
    expect(alert.message).not.toContain('Check your connection');
  });
});
