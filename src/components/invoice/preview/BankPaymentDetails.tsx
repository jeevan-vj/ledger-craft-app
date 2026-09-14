import type { BusinessProfile } from '@/types';

export type BankPaymentDetailsProps = Pick<BusinessProfile, 'bankAccountName' | 'bankAccountNumber'>;

export function BankPaymentDetails({ bankAccountName, bankAccountNumber }: BankPaymentDetailsProps) {
  const name = bankAccountName?.trim();
  const number = bankAccountNumber?.trim();
  if (!name && !number) return null;

  return (
    <section className="mt-4 text-xs sm:text-sm" style={{ breakInside: 'avoid' }} aria-label="Payment details">
      <h4 className="mb-2 font-semibold">Payment details</h4>
      <dl className="space-y-1">
        {name && <div className="flex gap-3"><dt className="w-32 shrink-0 font-medium">Account name:</dt><dd className="min-w-0 break-words">{name}</dd></div>}
        {number && <div className="flex gap-3"><dt className="w-32 shrink-0 font-medium">Account number:</dt><dd className="min-w-0 break-words tabular-nums">{number}</dd></div>}
      </dl>
    </section>
  );
}
