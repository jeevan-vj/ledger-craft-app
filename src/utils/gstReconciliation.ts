export type BankCoverageStatus = 'complete' | 'partial' | 'in_progress' | 'missing';
export type GstReconciliationReadiness = 'ready' | 'warning' | 'not_applicable';

export interface GstPeriod {
  startDate: string;
  endDate: string;
}

export interface GstReconSession {
  id: string;
  bankAccountId: string;
  statementStartDate: string;
  statementEndDate: string;
  status: 'in_progress' | 'completed' | 'locked';
  unmatchedBankCount: number;
}

export interface GstReconAccount {
  id: string;
  accountName: string;
  bankName: string;
}

export interface BankAccountCoverage {
  accountId: string;
  accountName: string;
  bankName: string;
  status: BankCoverageStatus;
  sessionId: string | null;
  unmatchedBankCount: number;
}

export interface GstFigureLine {
  id: 'totalSales' | 'gstOnSales' | 'totalPurchases' | 'gstOnPurchases';
  label: string;
  books: number;
  returnValue: number;
  difference: number;
}

export interface GstReturnFigures {
  totalSales: number;
  gstOnSales: number;
  totalPurchases: number;
  gstOnPurchases: number;
}

export interface UnreconciledSample {
  id: string;
  date: string;
  description: string;
  amount: number;
}

export interface GstPeriodReconciliation {
  period: GstPeriod;
  readiness: GstReconciliationReadiness;
  accounts: BankAccountCoverage[];
  unreconciledTransactionCount: number;
  unreconciledSamples: UnreconciledSample[];
  figures: GstFigureLine[];
  figuresMatch: boolean;
  issues: string[];
}

const CENTS = 0.01;

export function amountsMatch(a: number, b: number, tolerance = CENTS): boolean {
  return Math.abs(a - b) < tolerance;
}

export function periodsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

export function sessionCoversPeriod(session: GstReconSession, period: GstPeriod): boolean {
  return session.statementStartDate <= period.startDate && session.statementEndDate >= period.endDate;
}

export function evaluateAccountCoverage(
  account: GstReconAccount,
  sessions: GstReconSession[],
  period: GstPeriod
): BankAccountCoverage {
  const accountSessions = sessions.filter((session) => session.bankAccountId === account.id);
  const overlapping = accountSessions.filter((session) =>
    periodsOverlap(session.statementStartDate, session.statementEndDate, period.startDate, period.endDate)
  );
  const completedCovering = overlapping.filter(
    (session) =>
      (session.status === 'completed' || session.status === 'locked') &&
      sessionCoversPeriod(session, period)
  );
  const inProgress = overlapping.filter((session) => session.status === 'in_progress');
  const completedPartial = overlapping.filter(
    (session) => session.status === 'completed' || session.status === 'locked'
  );

  if (completedCovering.length > 0) {
    const session = completedCovering[0];
    return {
      accountId: account.id,
      accountName: account.accountName,
      bankName: account.bankName,
      status: 'complete',
      sessionId: session.id,
      unmatchedBankCount: session.unmatchedBankCount,
    };
  }

  if (inProgress.length > 0) {
    const session = inProgress[0];
    return {
      accountId: account.id,
      accountName: account.accountName,
      bankName: account.bankName,
      status: 'in_progress',
      sessionId: session.id,
      unmatchedBankCount: session.unmatchedBankCount,
    };
  }

  if (completedPartial.length > 0) {
    const session = completedPartial[0];
    return {
      accountId: account.id,
      accountName: account.accountName,
      bankName: account.bankName,
      status: 'partial',
      sessionId: session.id,
      unmatchedBankCount: session.unmatchedBankCount,
    };
  }

  return {
    accountId: account.id,
    accountName: account.accountName,
    bankName: account.bankName,
    status: 'missing',
    sessionId: null,
    unmatchedBankCount: 0,
  };
}

export function evaluateGstFigures(
  books: GstReturnFigures,
  returnValues: GstReturnFigures
): GstFigureLine[] {
  const rows: Array<{ id: GstFigureLine['id']; label: string; books: number; returnValue: number }> = [
    { id: 'totalSales', label: 'Total sales (incl. GST)', books: books.totalSales, returnValue: returnValues.totalSales },
    { id: 'gstOnSales', label: 'GST on sales', books: books.gstOnSales, returnValue: returnValues.gstOnSales },
    { id: 'totalPurchases', label: 'Total purchases (incl. GST)', books: books.totalPurchases, returnValue: returnValues.totalPurchases },
    { id: 'gstOnPurchases', label: 'GST on purchases', books: books.gstOnPurchases, returnValue: returnValues.gstOnPurchases },
  ];

  return rows.map((row) => ({
    ...row,
    difference: Math.round((row.returnValue - row.books) * 100) / 100,
  }));
}

function coverageIssue(account: BankAccountCoverage): string {
  switch (account.status) {
    case 'complete':
      return '';
    case 'partial':
      return `${account.accountName} is only partly reconciled for this GST period`;
    case 'in_progress':
      return `${account.accountName} has an in-progress reconciliation`;
    case 'missing':
      return `${account.accountName} has no bank reconciliation for this GST period`;
    default: {
      const _exhaustive: never = account.status;
      return _exhaustive;
    }
  }
}

export function evaluateGstPeriodReconciliation(input: {
  period: GstPeriod;
  accounts: GstReconAccount[];
  sessions: GstReconSession[];
  unreconciledTransactionCount: number;
  unreconciledSamples: UnreconciledSample[];
  books: GstReturnFigures;
  returnValues: GstReturnFigures;
}): GstPeriodReconciliation {
  const coverage = input.accounts.map((account) =>
    evaluateAccountCoverage(account, input.sessions, input.period)
  );
  const figures = evaluateGstFigures(input.books, input.returnValues);
  const figuresMatch = figures.every((line) => amountsMatch(line.books, line.returnValue));

  const issues: string[] = [];
  for (const account of coverage) {
    const issue = coverageIssue(account);
    if (issue) issues.push(issue);
  }
  if (input.unreconciledTransactionCount > 0) {
    issues.push(
      `${input.unreconciledTransactionCount} bank transaction${input.unreconciledTransactionCount === 1 ? '' : 's'} still unmatched in this period`
    );
  }
  if (!figuresMatch) {
    issues.push('GST return figures do not match the books for this period');
  }

  let readiness: GstReconciliationReadiness;
  if (input.accounts.length === 0) {
    readiness = 'not_applicable';
  } else if (issues.length === 0) {
    readiness = 'ready';
  } else {
    readiness = 'warning';
  }

  return {
    period: input.period,
    readiness,
    accounts: coverage,
    unreconciledTransactionCount: input.unreconciledTransactionCount,
    unreconciledSamples: input.unreconciledSamples,
    figures,
    figuresMatch,
    issues,
  };
}

export function toReconciliationSnapshot(recon: GstPeriodReconciliation): {
  status: GstReconciliationReadiness;
  unreconciledTransactionCount: number;
  figuresMatch: boolean;
  accounts: Array<{
    accountId: string;
    accountName: string;
    status: BankCoverageStatus;
    sessionId: string | null;
  }>;
  issues: string[];
} {
  return {
    status: recon.readiness,
    unreconciledTransactionCount: recon.unreconciledTransactionCount,
    figuresMatch: recon.figuresMatch,
    accounts: recon.accounts.map((account) => ({
      accountId: account.accountId,
      accountName: account.accountName,
      status: account.status,
      sessionId: account.sessionId,
    })),
    issues: recon.issues,
  };
}
