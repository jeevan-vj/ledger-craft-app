import { friendlyApiText, isSchemaDiagnostic } from './apiErrorCopy';

describe('friendly API copy', () => {
  it('hides schema diagnostics from validation failures', () => {
    expect(isSchemaDiagnostic('theme.background: Required')).toBe(true);
    expect(friendlyApiText({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'theme.background: Required',
      requestId: 'req_abc123',
    })).toBe(
      "Something in your details didn't save. Please try again, and contact support if it keeps happening. Ref: req_abc123",
    );
  });

  it('uses a plain server message for 5xx responses', () => {
    expect(friendlyApiText({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service temporarily unavailable. Please try again later.',
      requestId: 'req_down',
    })).toBe('Something went wrong on our side. Ref: req_down');
  });

  it('keeps a product message for a known user-facing code', () => {
    expect(friendlyApiText({
      status: 400,
      code: 'customer_email_required',
      message: 'Add an email to this customer',
      requestId: 'req_mail',
    })).toBe('Add an email to this customer. Ref: req_mail');
    expect(friendlyApiText({
      status: 409,
      code: 'HTTP_ERROR',
      message: 'Only draft bills can be edited',
    })).toBe('Only draft bills can be edited.');
  });

  it('replaces a written validation error with the same plain message', () => {
    expect(friendlyApiText({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: "Discount can't exceed the subtotal",
    })).toBe("Something in your details didn't save. Please try again, and contact support if it keeps happening.");
  });

  it('keeps the actionable email-unavailable message', () => {
    expect(friendlyApiText({
      status: 503,
      code: 'EMAIL_UNAVAILABLE',
      message: 'Email delivery is unavailable. Download or share the invoice instead.',
    })).toBe('Email delivery is unavailable. Download or share the invoice instead.');
  });
});
