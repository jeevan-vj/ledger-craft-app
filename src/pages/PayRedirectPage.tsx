import { useEffect, useLayoutEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { applyNoReferrerPolicy } from '@/lib/referrerPolicy';

export default function PayRedirectPage() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const status = params.get('status');
  useLayoutEffect(() => applyNoReferrerPolicy(), []);
  useEffect(() => { if (token && !status) window.location.replace(`/api/public/pay/${encodeURIComponent(token)}`); }, [status, token]);
  const success = status === 'success';
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><Card className="w-full max-w-md"><CardContent className="flex flex-col items-center py-12 text-center">{!status ? <><Loader2 className="h-10 w-10 animate-spin text-[#635BFF]" /><h1 className="mt-5 text-2xl font-semibold">Opening secure payment</h1><p className="mt-2 text-muted-foreground">You’ll continue to Stripe Checkout.</p></> : success ? <><CheckCircle2 className="h-12 w-12 text-emerald-600" /><h1 className="mt-5 text-2xl font-semibold">Payment submitted</h1><p className="mt-2 text-muted-foreground">Stripe is confirming the payment. The business will receive an automatic receipt record.</p></> : <><XCircle className="h-12 w-12 text-slate-500" /><h1 className="mt-5 text-2xl font-semibold">Payment cancelled</h1><p className="mt-2 text-muted-foreground">No payment was made. You can use the original link to try again.</p></>}</CardContent></Card></main>;
}
