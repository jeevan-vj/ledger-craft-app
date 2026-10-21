import { AuthApiError } from '@/features/auth/api/http';
import { setupFailureAlert } from './setupFailure';

describe('setup failure copy', () => {
  it('uses the connection message only when the request never reached the API', () => {
    expect(setupFailureAlert(new AuthApiError('Failed to fetch', 0))).toEqual({
      title: 'Couldn’t finish setup',
      message: 'Check your connection and try again. Your answers are still here.',
    });
  });

  it('hides validation diagnostics and keeps a support reference', () => {
    const alert = setupFailureAlert(new AuthApiError('theme.background: Required', 400, 'VALIDATION_ERROR', 'req_abc123'));
    expect(alert.title).toBe('Couldn’t finish setup');
    expect(alert.message).toBe(
      "Something in your details didn't save. Please try again, and contact support if it keeps happening. Your answers are still here. Ref: req_abc123",
    );
    expect(alert.message).not.toContain('theme.background');
    expect(alert.message).not.toContain('Check your connection');
  });

  it('uses a plain server-side message for 5xx failures', () => {
    const alert = setupFailureAlert(new AuthApiError(
      'Service temporarily unavailable. Please try again later.',
      503,
      'SERVICE_UNAVAILABLE',
      'req_down',
    ));
    expect(alert.message).toBe('Something went wrong on our side. Your answers are still here. Ref: req_down');
    expect(alert.message).not.toContain('Service temporarily unavailable');
  });

  it('shows a known user-facing server message', () => {
    const alert = setupFailureAlert(new AuthApiError(
      'Add an email to this customer',
      400,
      'customer_email_required',
      'req_mail',
    ));
    expect(alert.message).toBe('Add an email to this customer. Your answers are still here. Ref: req_mail');
  });

  it('keeps a local sentence and falls back when the text is a schema diagnostic', () => {
    expect(setupFailureAlert(new Error('Business name and email are required')).message)
      .toBe('Business name and email are required. Your answers are still here.');
    const diagnostic = setupFailureAlert(new Error('gstRegistrationStatus: Invalid enum value. Expected registered received sometimes'));
    expect(diagnostic.message).toContain("Something in your details didn't save");
    expect(diagnostic.message).not.toContain('gstRegistrationStatus');
    expect(diagnostic.message.endsWith('Your answers are still here.')).toBe(true);
  });
});
