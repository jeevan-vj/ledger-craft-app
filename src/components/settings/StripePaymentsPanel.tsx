import { useEffect, useState } from 'react';
import type { StripeAccountStatus } from '@ledgercraft/contracts';
import { Check, CircleAlert, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { stripeApi } from '@/features/stripe/api/stripeApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

function statusCopy(account: StripeAccountStatus) {
  if (account.status === 'active') return { title: 'Ready to accept card payments', detail: 'Customers can pay NZD invoices securely through Stripe Checkout.' };
  if (account.status === 'not_connected') return { title: 'Accept card payments', detail: 'Connect a Stripe test account to take invoice payments. LedgerCraft keeps the configured platform margin.' };
  if (account.status === 'onboarding') return { title: 'Finish Stripe setup', detail: 'Stripe still needs business or bank details before payments and payouts can be enabled.' };
  return { title: 'Stripe needs attention', detail: account.disabledReason || 'Review the outstanding requirements in Stripe.' };
}

export function StripePaymentsPanel() {
  const [account, setAccount] = useState<StripeAccountStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const returning = new URLSearchParams(window.location.search).has('stripe');
      setAccount(returning ? await stripeApi.refreshAccount() : await stripeApi.account());
    } catch (error) { toast.error('Could not load Stripe status', { description: error instanceof Error ? error.message : 'Try again.' }); }
  };
  useEffect(() => { void load(); }, []);
  const onboard = async () => {
    setBusy(true);
    try {
      if (account?.status === 'not_connected') await stripeApi.createAccount();
      const link = await stripeApi.onboardingLink();
      window.open(link.url, '_self', 'noopener,noreferrer');
    }
    catch (error) { toast.error('Could not start Stripe setup', { description: error instanceof Error ? error.message : 'Try again.' }); setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true);
    try { setAccount(await stripeApi.refreshAccount()); toast.success('Stripe status refreshed'); }
    catch (error) { toast.error('Could not refresh Stripe', { description: error instanceof Error ? error.message : 'Try again.' }); }
    finally { setBusy(false); }
  };
  if (!account) return <Card><CardContent className="flex min-h-44 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading Stripe status" /></CardContent></Card>;
  const copy = statusCopy(account);
  return <Card className="overflow-hidden">
    <CardHeader className="border-b bg-muted/40"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#635BFF] text-white"><CreditCard className="h-5 w-5" /></span><div><CardTitle>{copy.title}</CardTitle><CardDescription className="mt-1 max-w-2xl">{copy.detail}</CardDescription></div></div></CardHeader>
    <CardContent className="space-y-5 pt-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-xl border p-4">{account.chargesEnabled ? <Check className="h-5 w-5 text-emerald-600" /> : <CircleAlert className="h-5 w-5 text-amber-600" />}<span className="font-medium">Charges {account.chargesEnabled ? 'enabled' : 'not enabled'}</span></div>
        <div className="flex items-center gap-2 rounded-xl border p-4">{account.payoutsEnabled ? <Check className="h-5 w-5 text-emerald-600" /> : <CircleAlert className="h-5 w-5 text-amber-600" />}<span className="font-medium">Payouts {account.payoutsEnabled ? 'enabled' : 'not enabled'}</span></div>
      </div>
      {account.requirementsDue.length > 0 && <p className="text-sm text-muted-foreground">{account.requirementsDue.length} Stripe requirement{account.requirementsDue.length === 1 ? '' : 's'} still due.</p>}
      <div className="flex flex-wrap gap-3">{account.status !== 'active' && <Button type="button" disabled={busy} onClick={() => void onboard()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{account.status === 'not_connected' ? 'Set up Stripe payments' : 'Continue Stripe setup'}</Button>}{account.status !== 'not_connected' && <Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}><RefreshCw className="mr-2 h-4 w-4" />Refresh status</Button>}</div>
      <p className="text-xs text-muted-foreground">Stripe securely collects verification and payout details. LedgerCraft never stores your Stripe password or bank credentials.</p>
    </CardContent>
  </Card>;
}
