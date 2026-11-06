import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteAccount } from '@/features/auth/api/authApi';
import { useAuth } from '@/context/StableAuthContext';

export function AccountDeletionPanel() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await deleteAccount({ password, confirmation: 'DELETE' });
      await signOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete your account. Try again.');
      setSubmitting(false);
    }
  };

  return <Card className="border-destructive/40">
    <CardHeader>
      <CardTitle>Delete account</CardTitle>
      <CardDescription>Permanently delete your personal account and any companies you own alone. In a company with another owner, only your membership is removed. This cannot be undone.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Export invoices, reports, and tax records first. New Zealand businesses may need to keep tax records for 7 years. EasyBizInvoice does not retain those records on your behalf after deletion.</p>
      <p className="text-sm text-muted-foreground">A non-identifying deletion tombstone containing only a one-way account hash and deletion time is retained indefinitely so deletion retries stay safe.</p>
      <Button asChild variant="outline"><Link to="/reports">Export your data first</Link></Button>
      {!open ? <Button type="button" variant="destructive" onClick={() => setOpen(true)}>Delete account</Button> : <div className="space-y-4 rounded-lg border border-destructive/40 p-4">
        <p className="text-sm font-medium">Enter your current password and type DELETE to confirm.</p>
        <div className="space-y-2"><Label htmlFor="delete-password">Current password</Label><Input id="delete-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="delete-confirmation">Type DELETE</Label><Input id="delete-confirmation" autoCapitalize="characters" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button><Button type="button" variant="destructive" onClick={submit} disabled={!password || confirmation !== 'DELETE' || submitting}>{submitting ? 'Deleting…' : 'Permanently delete account'}</Button></div>
      </div>}
    </CardContent>
  </Card>;
}
