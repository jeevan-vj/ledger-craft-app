import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <article className="mx-auto max-w-2xl space-y-6">
        <p className="text-sm text-muted-foreground">
          <Link to="/signup" className="text-primary hover:underline">Back to sign up</Link>
        </p>
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">EasyBizInvoice · {updated}</p>
        </header>
        <div className="space-y-4 text-sm leading-6 text-muted-foreground">{children}</div>
      </article>
    </main>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="4 November 2026">
      <p>EasyBizInvoice is a tool for creating invoices and keeping business records. You are responsible for the information you enter and for your own tax filings, including GST.</p>
      <p>You keep ownership of the customers, invoices, and other business records you add. You give EasyBizInvoice permission to store and display that information so the service can work.</p>
      <p>Use an account only for a business you are allowed to represent. Do not use the service to break the law or to interfere with other people&apos;s accounts.</p>
      <p>The service is provided as available. We may change these terms; this page shows the current version. If you keep using EasyBizInvoice after a change, you accept the updated terms.</p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="6 November 2026">
      <p>We collect the name, email address, and password you use to create an account, plus the business profile, customers, invoices, and other records you choose to enter.</p>
      <p>We use that information to sign you in, show your business records, and keep the service working. Your password is stored as a hash. Sign-in uses a session cookie.</p>
      <p>We do not sell your information. We share it only when you ask us to, such as when you send an invoice, or when the law requires it.</p>
      <p>You can update your business details in Settings. The same account works on the EasyBizInvoice website and the mobile app.</p>
      <p>You can permanently delete your account in Settings. We delete your identity, sessions, company records, files, public share links, and recurring schedules for companies you own alone. In shared companies with another owner, we remove only your membership. We retain only a non-identifying deletion tombstone with the deletion time.</p>
      <p>Export your records before deletion. New Zealand businesses may be required by Inland Revenue to keep tax records for 7 years. EasyBizInvoice does not retain deleted records on your behalf.</p>
    </LegalLayout>
  );
}
