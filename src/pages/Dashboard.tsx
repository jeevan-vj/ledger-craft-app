import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Plus,
  Receipt,
  Upload,
  Wallet,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { useAppData } from '@/hooks/useAppData';
import { acceptedNotInvoicedCount, openQuoteSummary } from '@/features/quotes/filters';
import { useQuotesQuery } from '@/features/quotes/hooks/useQuotes';
import { formatCurrency } from '@/utils/invoiceUtils';
import { PageHeader } from '@/components/layout/PageHeader';
import { ActionRow } from '@/components/ui/ActionRow';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ActivityTab = 'invoices' | 'expenses' | 'pending';

const Dashboard = () => {
  const navigate = useNavigate();
  const {
    invoices,
    isLoadingInvoices,
    customers,
    isLoadingCustomers,
    expenses,
    isLoadingExpenses,
  } = useAppData();
  const quotesQuery = useQuotesQuery();

  const isLoadingStats = isLoadingInvoices || isLoadingCustomers || isLoadingExpenses;
  const [activityTab, setActivityTab] = useState<ActivityTab>('invoices');

  const totalEarnings = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const paidEarnings = paidInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const netIncome = paidEarnings - totalExpenses;
  const profitMargin = paidEarnings > 0 ? (netIncome / paidEarnings) * 100 : 0;

  const currentYear = new Date().getFullYear();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    name: monthNames[i],
    revenue: 0,
    expenses: 0,
    netIncome: 0,
  }));

  invoices.forEach((invoice) => {
    const date = new Date(invoice.date);
    if (date.getFullYear() === currentYear && invoice.status === 'paid') {
      monthlyData[date.getMonth()].revenue += invoice.total;
    }
  });

  expenses.forEach((expense) => {
    const date = new Date(expense.expenseDate);
    if (date.getFullYear() === currentYear) {
      monthlyData[date.getMonth()].expenses += expense.amount;
    }
  });

  monthlyData.forEach((month) => {
    month.netIncome = month.revenue - month.expenses;
  });

  const expensesByCategory = expenses.reduce((acc, expense) => {
    const categoryName = expense.category?.name || 'Uncategorized';
    acc[categoryName] = (acc[categoryName] || 0) + expense.amount;
    return acc;
  }, {} as Record<string, number>);

  const expenseCategoryData = Object.entries(expensesByCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const categoryColors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
  ];

  const recentInvoices = [...invoices]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime())
    .slice(0, 5);

  const pendingInvoices = invoices
    .filter((invoice) => invoice.status === 'sent' || invoice.status === 'overdue')
    .slice(0, 5);
  const quoteRows = quotesQuery.data?.quotes ?? [];
  const openQuotes = openQuoteSummary(quoteRows);
  const acceptedQuotes = acceptedNotInvoicedCount(quoteRows);

  if (isLoadingStats) {
    return (
      <div className="space-y-8">
        <div className="h-10 w-32 rounded-lg bg-muted animate-pulse" />
        <div className="h-16 w-56 rounded-lg bg-muted animate-pulse" />
        <div className="space-y-3">
          <div className="h-20 rounded-2xl bg-muted animate-pulse" />
          <div className="h-20 rounded-2xl bg-muted animate-pulse" />
          <div className="h-20 rounded-2xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader title="Home" />

      <section>
        <p className="text-sm font-medium text-muted-foreground">Net income</p>
        <p
          className={cn(
            'mt-1 text-5xl font-bold tracking-tight tabular-nums',
            netIncome < 0 && 'text-destructive'
          )}
        >
          {formatCurrency(netIncome)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatCurrency(paidEarnings)} received · {formatCurrency(totalEarnings - paidEarnings)} outstanding
          {paidEarnings > 0 && ` · ${profitMargin.toFixed(1)}% margin`}
        </p>
      </section>

      <section className="space-y-3">
        <ActionRow
          icon={Plus}
          title="New invoice"
          subtitle="Create and send a professional invoice"
          to="/invoices/new"
        />
        <ActionRow
          icon={Receipt}
          title="Record expense"
          subtitle="Log a business cost"
          to="/expenses"
        />
        <ActionRow
          icon={Upload}
          title="Import transactions"
          subtitle="Upload a bank statement"
          to="/transaction-import"
        />
        <ActionRow
          icon={Wallet}
          title="Record payment"
          subtitle="Mark an invoice as paid"
          to="/payments"
        />
      </section>

      <ContentPanel padded={false}>
        <div className="p-6 pb-4">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <SegmentedControl
            className="mt-4"
            value={activityTab}
            onChange={setActivityTab}
            options={[
              { value: 'invoices', label: 'Invoices' },
              { value: 'expenses', label: 'Expenses' },
              { value: 'pending', label: 'Pending' },
            ]}
          />
        </div>

        <div className="divide-y divide-border">
          {activityTab === 'invoices' &&
            (recentInvoices.length > 0 ? (
              recentInvoices.map((invoice) => (
                <ActivityRow
                  key={invoice.id}
                  title={invoice.invoiceNumber}
                  subtitle={invoice.customer?.name || invoice.customerId}
                  amount={invoice.total}
                  status={invoice.status}
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                />
              ))
            ) : (
              <div className="px-6 py-10 text-center">
                <p className="font-semibold text-foreground">Create your first invoice</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Send it, get paid, GST-ready.
                </p>
                <Button asChild className="mt-4">
                  <Link to="/invoices/new" data-testid="dashboard-empty-create-invoice">
                    Create your first invoice
                  </Link>
                </Button>
              </div>
            ))}

          {activityTab === 'expenses' &&
            (recentExpenses.length > 0 ? (
              recentExpenses.map((expense) => (
                <ActivityRow
                  key={expense.id}
                  title={expense.description}
                  subtitle={expense.category?.name || 'Uncategorized'}
                  amount={-expense.amount}
                  onClick={() => navigate('/expenses')}
                />
              ))
            ) : (
              <p className="px-6 py-10 text-sm text-muted-foreground">No expenses yet.</p>
            ))}

          {activityTab === 'pending' &&
            (pendingInvoices.length > 0 ? (
              pendingInvoices.map((invoice) => (
                <ActivityRow
                  key={invoice.id}
                  title={invoice.invoiceNumber}
                  subtitle={`Due ${new Date(invoice.dueDate).toLocaleDateString()}`}
                  amount={invoice.total}
                  status={invoice.status}
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                />
              ))
            ) : (
              <p className="px-6 py-10 text-sm text-muted-foreground">No pending invoices.</p>
            ))}
        </div>

        <div className="px-6 py-4 border-t border-border">
          <Link
            to={activityTab === 'expenses' ? '/expenses' : '/invoices'}
            className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
          >
            View all
          </Link>
        </div>
      </ContentPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ContentPanel>
          <h2 className="text-lg font-semibold">Cash flow</h2>
          <p className="text-sm text-muted-foreground mt-1">Monthly revenue vs expenses</p>
          <div className="h-[280px] mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                <YAxis
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} name="Revenue" />
                <Bar dataKey="expenses" fill="hsl(var(--chart-5))" radius={[6, 6, 0, 0]} name="Expenses" />
                <Line dataKey="netIncome" stroke="hsl(var(--foreground))" strokeWidth={2} name="Net Income" type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ContentPanel>

        <ContentPanel>
          <h2 className="text-lg font-semibold">Expense breakdown</h2>
          <p className="text-sm text-muted-foreground mt-1">Top spending categories</p>
          <div className="h-[280px] mt-6">
            {expenseCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseCategoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={90}
                    dataKey="value"
                  >
                    {expenseCategoryData.map((entry, index) => (
                      <Cell key={entry.name} fill={categoryColors[index % categoryColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No expense data yet
              </div>
            )}
          </div>
        </ContentPanel>
      </div>

      <ContentPanel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Quotes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open quotes are drafts, sent, or viewed. Accepted quotes are waiting to be invoiced.</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/quotes">View quotes</Link>
          </Button>
        </div>
        {quotesQuery.isLoading ? (
          <div className="mt-6 h-16 animate-pulse rounded-xl bg-muted" aria-label="Loading quotes" />
        ) : quotesQuery.isError ? (
          <p className="mt-6 text-sm text-muted-foreground">Quotes could not be loaded.</p>
        ) : (
          <dl className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Open quotes</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">
                {openQuotes.count}
                <span className="ml-2 text-base font-medium text-muted-foreground">
                  {formatCurrency(openQuotes.value, quoteRows.find((quote) => quote.status === 'draft' || quote.status === 'sent' || quote.status === 'viewed')?.currency || 'NZD')}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Accepted, not invoiced</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{acceptedQuotes}</dd>
            </div>
          </dl>
        )}
      </ContentPanel>

      <ContentPanel>
        <h2 className="text-lg font-semibold">At a glance</h2>
        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
          <GlanceStat label="Invoices" value={invoices.length} />
          <GlanceStat label="Customers" value={customers.length} />
          <GlanceStat label="Paid" value={paidInvoices.length} />
          <GlanceStat label="Pending" value={pendingInvoices.length} />
        </dl>
      </ContentPanel>
    </div>
  );
};

function GlanceStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

interface ActivityRowProps {
  title: string;
  subtitle: string;
  amount: number;
  status?: string;
  onClick: () => void;
}

function ActivityRow({ title, subtitle, amount, status, onClick }: ActivityRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-muted/50 transition-colors"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{title}</p>
        <p className="text-sm text-muted-foreground truncate">
          {subtitle}
          {status ? ` · ${status}` : ''}
        </p>
      </div>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          amount < 0 ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {formatCurrency(amount)}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}

export default Dashboard;
