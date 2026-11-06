import { useCallback, useEffect, useState } from 'react';
import type { AccountSession } from '@ledgercraft/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/StableAuthContext';
import { changeEmail, changePassword, listAccountSessions, revokeAccountSession, revokeAllSessions, revokeOtherSessions } from '@/features/auth/api/authApi';

function deviceName(session: AccountSession): string {
  const agent = session.userAgent ?? '';
  if (/android/i.test(agent)) return 'Android device';
  if (/iphone|ipad/i.test(agent)) return 'Apple device';
  if (/chrome/i.test(agent)) return 'Chrome browser';
  if (/safari/i.test(agent)) return 'Safari browser';
  return 'Signed-in device';
}

export function AccountSecurityPanel() {
  const { toast } = useToast();
  const { signOut, refreshUser } = useAuth();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const load = useCallback(async () => {
    setSessionsLoading(true); setSessionsError('');
    try { setSessions(await listAccountSessions()); }
    catch (error) { setSessionsError(error instanceof Error ? error.message : 'Could not load signed-in devices.'); throw error; }
    finally { setSessionsLoading(false); }
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  const action = async (task: () => Promise<void>, message: string, reload = true) => {
    setBusy(true);
    try { await task(); if (reload) await load(); toast({ title: message }); }
    catch (error) { toast({ title: 'Couldn’t update account security', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Password</CardTitle><CardDescription>Changing your password keeps this browser signed in and signs out every other device.</CardDescription></CardHeader>
      <CardContent><form className="grid gap-3 sm:max-w-md" onSubmit={(event) => { event.preventDefault(); void action(async () => { await changePassword(currentPassword, newPassword); setCurrentPassword(''); setNewPassword(''); }, 'Password changed'); }}>
        <label className="text-sm font-medium" htmlFor="current-password">Current password</label><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        <label className="text-sm font-medium" htmlFor="new-password">New password</label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        <Button type="submit" disabled={busy}>Change password</Button>
      </form></CardContent></Card>

    <Card><CardHeader><CardTitle>Email address</CardTitle><CardDescription>Your current email stays active until you verify the new address. Existing users can sign in while verification delivery is being established.</CardDescription></CardHeader>
      <CardContent><form className="flex max-w-xl flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void action(async () => { await changeEmail(newEmail); setNewEmail(''); }, 'Verification sent', false); }}>
        <Input aria-label="New email address" type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required />
        <Button type="submit" disabled={busy}>Verify new email</Button>
      </form></CardContent></Card>

    <Card><CardHeader><CardTitle>Signed-in devices</CardTitle><CardDescription>Review active sessions. “Sign out other devices” keeps this browser active; “Sign out everywhere” includes it.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {sessionsLoading ? <p role="status" className="text-sm text-muted-foreground">Loading signed-in devices…</p> : null}
        {sessionsError ? <p role="alert" className="text-sm text-destructive">{sessionsError}</p> : null}
        {!sessionsLoading && !sessionsError && sessions.length === 0 ? <p className="text-sm text-muted-foreground">No active sessions found.</p> : null}
        {sessions.map((session) => <div key={session.token} className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
          <div><p className="font-medium">{deviceName(session)} {session.current ? '(this browser)' : ''}</p><p className="text-sm text-muted-foreground">Signed in {session.createdAt.toLocaleString()}{session.ipAddress ? ` · ${session.ipAddress}` : ''}</p></div>
          {!session.current ? <Button variant="outline" disabled={busy} onClick={() => void action(() => revokeAccountSession(session.token), 'Device signed out')}>Sign out device</Button> : null}
        </div>)}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" disabled={busy} onClick={() => void action(revokeOtherSessions, 'Other devices signed out')}>Sign out other devices</Button>
          <Button variant="destructive" disabled={busy} onClick={() => { if (window.confirm('Sign out every device, including this browser?')) void action(async () => { await revokeAllSessions(); await signOut(); }, 'Signed out everywhere', false); }}>Sign out everywhere</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void action(refreshUser, 'Account refreshed', false)}>Refresh account</Button>
        </div>
      </CardContent></Card>
  </div>;
}
