import type { AuthEmail } from './auth';

export type AuthEmailEnv = {
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]!);
}

function copyFor(email: AuthEmail): { subject: string; heading: string; action: string; lifetime: string } {
  return email.kind === 'password-reset'
    ? {
        subject: 'Reset your easybizinvoice password',
        heading: 'Reset your password',
        action: 'Reset password',
        lifetime: 'This single-use link expires in 1 hour.',
      }
    : {
        subject: 'Verify your easybizinvoice email',
        heading: 'Verify your email',
        action: 'Verify email',
        lifetime: 'This link expires in 24 hours.',
      };
}

export function createAuthEmailSender(env: AuthEmailEnv): ((email: AuthEmail) => Promise<void>) | undefined {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();
  if (!apiKey || !from) return undefined;

  return async (email) => {
    const content = copyFor(email);
    const safeUrl = escapeHtml(email.url);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: content.subject,
        text: `${content.heading}\n\n${email.url}\n\n${content.lifetime}\nIf you did not request this, you can ignore this email.`,
        html: `<h1>${content.heading}</h1><p><a href="${safeUrl}">${content.action}</a></p><p>${content.lifetime}</p><p>If you did not request this, you can ignore this email.</p>`,
      }),
    });
    if (!response.ok) throw new Error('Authentication email delivery failed');
  };
}
