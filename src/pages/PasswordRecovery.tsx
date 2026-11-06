import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import ModernAuthLayout from '@/components/auth/modern/ModernAuthLayout';
import { ModernInput } from '@/components/auth/modern/ModernInput';
import { ModernButton } from '@/components/auth/modern/ModernButton';
import { requestPasswordReset, resetPassword } from '@/features/auth/api/authApi';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await requestPasswordReset(email.trim()); setSent(true); }
    catch (error_) { setError(error_ instanceof Error ? error_.message : 'Could not request a reset link.'); }
    finally { setBusy(false); }
  };
  return <ModernAuthLayout title="Reset your password" subtitle="We’ll send a secure, single-use link if an account exists.">
    {sent ? <output className="block space-y-4"><p>Check your email. If that address has an account, a reset link is on its way.</p><Link className="text-primary" to="/login">Back to sign in</Link></output> :
      <form className="space-y-6" onSubmit={submit}>
        <ModernInput label="Email address" type="email" icon={Mail} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <ModernButton type="submit" fullWidth size="lg" loading={busy} disabled={!email.trim()}>Send reset link</ModernButton>
        <Link className="block text-center text-primary" to="/login">Back to sign in</Link>
      </form>}
  </ModernAuthLayout>;
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const callbackError = params.get('error');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(callbackError ? 'This reset link is invalid or has expired.' : '');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true); setError('');
    try { await resetPassword(token, password); setDone(true); }
    catch { setError('This reset link is invalid, expired, or has already been used.'); }
    finally { setBusy(false); }
  };
  return <ModernAuthLayout title="Choose a new password" subtitle="Completing this reset signs out every existing device.">
    {done ? <output className="block space-y-4"><p>Your password has been reset. Sign in again on this and every other device.</p><Link className="text-primary" to="/login">Sign in</Link></output> :
      <form className="space-y-6" onSubmit={submit}>
        <ModernInput label="New password" type="password" icon={Lock} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" showPasswordToggle required />
        <ModernInput label="Confirm new password" type="password" icon={Lock} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" showPasswordToggle required />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <ModernButton type="submit" fullWidth size="lg" loading={busy} disabled={!token || !!callbackError}>Reset password</ModernButton>
        <Link className="block text-center text-primary" to="/forgot-password">Request a new link</Link>
      </form>}
  </ModernAuthLayout>;
}
